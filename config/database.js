const { Pool } = require('pg');

// 数据库配置
const dbConfig = {
  user: process.env.DB_USER || 'cmspop',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'moodiary',
  password: process.env.DB_PASSWORD || 'chuhe123',
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // 连接池最大连接数
  idleTimeoutMillis: 30000, // 空闲连接超时时间
  connectionTimeoutMillis: 2000, // 连接超时时间
};

// 创建连接池
const pool = new Pool(dbConfig);

// 连接数据库
const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL 数据库连接成功');
    
    // 测试查询
    const result = await client.query('SELECT NOW()');
    console.log('数据库时间:', result.rows[0].now);
    
    client.release();
    
    // 初始化数据库表
    await initTables();
  } catch (error) {
    console.error('数据库连接失败:', error);
    process.exit(1);
  }
};

// 初始化数据库表
const initTables = async () => {
  try {
    const client = await pool.connect();
    
    // 创建用户表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(100),
        avatar_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建心情动态表
    await client.query(`
      CREATE TABLE IF NOT EXISTS mood_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        mood_type VARCHAR(20) NOT NULL,
        content TEXT,
        weather VARCHAR(20),
        location VARCHAR(200),
        gps_latitude DECIMAL(10, 8),
        gps_longitude DECIMAL(11, 8),
        gps_address TEXT,
        tags TEXT[],
        images TEXT[],
        videos TEXT[],
        is_public BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建点赞表
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES mood_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `);

    // 创建评论表
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES mood_posts(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        parent_id INTEGER REFERENCES post_comments(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建私信表
    await client.query(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        images TEXT[],
        videos TEXT[],
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建关注关系表
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id SERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);

    // 创建索引
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mood_posts_user_id ON mood_posts(user_id);
      CREATE INDEX IF NOT EXISTS idx_mood_posts_created_at ON mood_posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mood_posts_mood_type ON mood_posts(mood_type);
      CREATE INDEX IF NOT EXISTS idx_mood_posts_is_public ON mood_posts(is_public);
      CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);
      CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON post_comments(user_id);
      CREATE INDEX IF NOT EXISTS idx_private_messages_sender_id ON private_messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_private_messages_receiver_id ON private_messages(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_private_messages_created_at ON private_messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_follows_follower_id ON user_follows(follower_id);
      CREATE INDEX IF NOT EXISTS idx_user_follows_following_id ON user_follows(following_id);
    `);

    console.log('数据库表初始化完成');
    
    // 执行数据库迁移
    await migrateDatabase(client);
    
    // 创建测试账号
    await createTestAccount(client);
    
    client.release();
  } catch (error) {
    console.error('数据库表初始化失败:', error);
    throw error;
  }
};

// 数据库迁移
const migrateDatabase = async (client) => {
  try {
    console.log('开始执行数据库迁移...');
    
    // 为 mood_posts 表添加 videos 字段（如果不存在）
    try {
      await client.query(`
        ALTER TABLE mood_posts 
        ADD COLUMN IF NOT EXISTS videos TEXT[]
      `);
      console.log('mood_posts 表添加 videos 字段成功');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('添加 videos 字段失败:', error);
      }
    }
    
    // 为 private_messages 表添加 images 字段（如果不存在）
    try {
      await client.query(`
        ALTER TABLE private_messages 
        ADD COLUMN IF NOT EXISTS images TEXT[]
      `);
      console.log('private_messages 表添加 images 字段成功');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('添加 images 字段失败:', error);
      }
    }
    
    // 为 private_messages 表添加 videos 字段（如果不存在）
    try {
      await client.query(`
        ALTER TABLE private_messages 
        ADD COLUMN IF NOT EXISTS videos TEXT[]
      `);
      console.log('private_messages 表添加 videos 字段成功');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('添加 videos 字段失败:', error);
      }
    }
    
    console.log('数据库迁移完成');
  } catch (error) {
    console.error('数据库迁移失败:', error);
    throw error;
  }
};

// 创建测试账号
const createTestAccount = async (client) => {
  try {
    const bcrypt = require('bcryptjs');
    
    // 检查是否已存在测试账号
    const existingUser = await client.query(
      'SELECT id FROM users WHERE username = $1',
      ['test']
    );
    
    if (existingUser.rows.length === 0) {
      // 创建测试账号
      const hashedPassword = await bcrypt.hash('123456', 10);
      await client.query(
        `INSERT INTO users (username, password_hash, nickname)
         VALUES ($1, $2, $3)`,
        ['test', hashedPassword, '测试用户']
      );
      console.log('测试账号创建成功: username=test, password=123456');
    } else {
      console.log('测试账号已存在');
    }
  } catch (error) {
    console.error('创建测试账号失败:', error);
  }
};

// 查询方法
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('执行查询', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('查询错误', { text, error: error.message });
    throw error;
  }
};

// 事务方法
const getClient = async () => {
  return await pool.connect();
};

module.exports = {
  pool,
  query,
  getClient,
  connectDB
};
