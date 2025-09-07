const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// 获取广场统计信息
router.get('/stats', async (req, res) => {
  try {
    // 获取总动态数
    const totalPostsResult = await query(
      'SELECT COUNT(*) as total_posts FROM mood_posts WHERE is_public = true'
    );

    // 获取总用户数
    const totalUsersResult = await query(
      'SELECT COUNT(*) as total_users FROM users'
    );

    // 获取今日动态数
    const todayPostsResult = await query(
      `SELECT COUNT(*) as today_posts 
       FROM mood_posts 
       WHERE is_public = true AND DATE(created_at) = CURRENT_DATE`
    );

    // 获取热门心情统计
    const popularMoodsResult = await query(
      `SELECT 
        mood_type,
        COUNT(*) as count
      FROM mood_posts 
      WHERE is_public = true
      GROUP BY mood_type
      ORDER BY count DESC
      LIMIT 5`
    );

    const popularMoods = popularMoodsResult.rows.map(row => ({
      moodType: row.mood_type,
      count: parseInt(row.count)
    }));

    const stats = {
      totalPosts: parseInt(totalPostsResult.rows[0].total_posts),
      totalUsers: parseInt(totalUsersResult.rows[0].total_users),
      todayPosts: parseInt(todayPostsResult.rows[0].today_posts),
      popularMoods
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取广场统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取广场统计失败',
      error: error.message
    });
  }
});

// 获取热门动态
router.get('/trending', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, timeRange = 'week' } = req.query;

    const offset = (page - 1) * pageSize;

    // 根据时间范围构建时间条件
    let timeCondition = '';
    switch (timeRange) {
      case 'day':
        timeCondition = 'AND mp.created_at >= CURRENT_DATE';
        break;
      case 'week':
        timeCondition = 'AND mp.created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
        break;
      case 'month':
        timeCondition = 'AND mp.created_at >= CURRENT_DATE - INTERVAL \'30 days\'';
        break;
      default:
        timeCondition = 'AND mp.created_at >= CURRENT_DATE - INTERVAL \'7 days\'';
    }

    // 查询热门动态（按点赞数排序）
    const trendingQuery = `
      SELECT 
        mp.*,
        u.username,
        u.nickname,
        u.avatar_url,
        COALESCE(like_counts.like_count, 0) as like_count,
        COALESCE(comment_counts.comment_count, 0) as comment_count,
        CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM mood_posts mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as like_count
        FROM post_likes
        GROUP BY post_id
      ) like_counts ON mp.id = like_counts.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as comment_count
        FROM post_comments
        GROUP BY post_id
      ) comment_counts ON mp.id = comment_counts.post_id
      LEFT JOIN post_likes user_likes ON mp.id = user_likes.post_id AND user_likes.user_id = $1
      WHERE mp.is_public = true ${timeCondition}
      ORDER BY like_count DESC, mp.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(trendingQuery, [
      req.user?.id || null,
      pageSize,
      offset
    ]);

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM mood_posts mp
      WHERE mp.is_public = true ${timeCondition}
    `;

    const countResult = await query(countQuery, []);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const posts = result.rows.map(post => ({
      ...post,
      user: {
        id: post.user_id,
        username: post.username,
        nickname: post.nickname,
        avatarUrl: post.avatar_url
      },
      likeCount: parseInt(post.like_count),
      commentCount: parseInt(post.comment_count),
      isLiked: post.is_liked
    }));

    res.json({
      success: true,
      data: {
        items: posts,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取热门动态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取热门动态失败',
      error: error.message
    });
  }
});

// 获取最新动态
router.get('/latest', async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;

    const offset = (page - 1) * pageSize;

    // 查询最新动态
    const latestQuery = `
      SELECT 
        mp.*,
        u.username,
        u.nickname,
        u.avatar_url,
        COALESCE(like_counts.like_count, 0) as like_count,
        COALESCE(comment_counts.comment_count, 0) as comment_count,
        CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM mood_posts mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as like_count
        FROM post_likes
        GROUP BY post_id
      ) like_counts ON mp.id = like_counts.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as comment_count
        FROM post_comments
        GROUP BY post_id
      ) comment_counts ON mp.id = comment_counts.post_id
      LEFT JOIN post_likes user_likes ON mp.id = user_likes.post_id AND user_likes.user_id = $1
      WHERE mp.is_public = true
      ORDER BY mp.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(latestQuery, [
      req.user?.id || null,
      pageSize,
      offset
    ]);

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM mood_posts mp
      WHERE mp.is_public = true
    `;

    const countResult = await query(countQuery, []);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const posts = result.rows.map(post => ({
      ...post,
      user: {
        id: post.user_id,
        username: post.username,
        nickname: post.nickname,
        avatarUrl: post.avatar_url
      },
      likeCount: parseInt(post.like_count),
      commentCount: parseInt(post.comment_count),
      isLiked: post.is_liked
    }));

    res.json({
      success: true,
      data: {
        items: posts,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取最新动态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取最新动态失败',
      error: error.message
    });
  }
});

// 搜索动态
router.get('/search', async (req, res) => {
  try {
    const { 
      keyword, 
      moodType, 
      location, 
      page = 1, 
      pageSize = 10,
      sortBy = 'time' // time, likes, comments
    } = req.query;

    if (!keyword && !moodType && !location) {
      return res.status(400).json({
        success: false,
        message: '搜索关键词不能为空'
      });
    }

    const offset = (page - 1) * pageSize;

    // 构建搜索条件
    let whereConditions = ['mp.is_public = true'];
    let queryParams = [];
    let paramIndex = 1;

    if (keyword) {
      whereConditions.push(`(mp.content ILIKE $${paramIndex} OR mp.location ILIKE $${paramIndex})`);
      queryParams.push(`%${keyword}%`);
      paramIndex++;
    }

    if (moodType) {
      whereConditions.push(`mp.mood_type = $${paramIndex}`);
      queryParams.push(moodType);
      paramIndex++;
    }

    if (location) {
      whereConditions.push(`mp.location ILIKE $${paramIndex}`);
      queryParams.push(`%${location}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // 构建排序条件
    let orderBy = 'mp.created_at DESC';
    switch (sortBy) {
      case 'likes':
        orderBy = 'like_count DESC, mp.created_at DESC';
        break;
      case 'comments':
        orderBy = 'comment_count DESC, mp.created_at DESC';
        break;
      default:
        orderBy = 'mp.created_at DESC';
    }

    // 查询搜索结果
    const searchQuery = `
      SELECT 
        mp.*,
        u.username,
        u.nickname,
        u.avatar_url,
        COALESCE(like_counts.like_count, 0) as like_count,
        COALESCE(comment_counts.comment_count, 0) as comment_count,
        CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM mood_posts mp
      LEFT JOIN users u ON mp.user_id = u.id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as like_count
        FROM post_likes
        GROUP BY post_id
      ) like_counts ON mp.id = like_counts.post_id
      LEFT JOIN (
        SELECT post_id, COUNT(*) as comment_count
        FROM post_comments
        GROUP BY post_id
      ) comment_counts ON mp.id = comment_counts.post_id
      LEFT JOIN post_likes user_likes ON mp.id = user_likes.post_id AND user_likes.user_id = $${paramIndex}
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `;

    queryParams.push(req.user?.id || null);
    queryParams.push(pageSize);
    queryParams.push(offset);

    const result = await query(searchQuery, queryParams);

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM mood_posts mp
      WHERE ${whereClause}
    `;

    const countResult = await query(countQuery, queryParams.slice(0, -3));
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const posts = result.rows.map(post => ({
      ...post,
      user: {
        id: post.user_id,
        username: post.username,
        nickname: post.nickname,
        avatarUrl: post.avatar_url
      },
      likeCount: parseInt(post.like_count),
      commentCount: parseInt(post.comment_count),
      isLiked: post.is_liked
    }));

    res.json({
      success: true,
      data: {
        items: posts,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('搜索动态失败:', error);
    res.status(500).json({
      success: false,
      message: '搜索动态失败',
      error: error.message
    });
  }
});

module.exports = router;
