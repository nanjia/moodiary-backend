# 心情日记后端API服务

这是一个基于Node.js和PostgreSQL的心情日记应用后端服务，提供用户认证、动态发布、点赞评论等功能的RESTful API。

## 功能特性

- 用户注册、登录、身份验证
- 心情动态的发布、查看、编辑、删除
- 图片上传到腾讯云COS
- 动态点赞和评论功能
- 广场功能（热门动态、最新动态、搜索）
- 用户统计信息
- 数据验证和错误处理
- 安全中间件（CORS、限流、Helmet）

## 技术栈

- **Node.js** - 运行环境
- **Express.js** - Web框架
- **PostgreSQL** - 数据库
- **JWT** - 身份验证
- **bcryptjs** - 密码加密
- **Joi** - 数据验证
- **腾讯云COS** - 图片存储

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

复制 `env.example` 文件为 `.env` 并填入您的配置：

```bash
cp env.example .env
```

编辑 `.env` 文件：

```env
# 服务器配置
PORT=8080
NODE_ENV=development

# 数据库配置
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=moodiary
DB_USER=your-username
DB_PASSWORD=your-password

# JWT配置
JWT_SECRET=your-super-secret-jwt-key

# 跨域配置
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

### 3. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

服务将在 `http://localhost:8080` 启动。

## API文档

### 认证相关

#### 用户注册
```
POST /api/auth/register
Content-Type: application/json

{
  "username": "用户名",
  "password": "密码",
  "nickname": "昵称（可选）"
}
```

#### 用户登录
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "用户名",
  "password": "密码"
}
```

#### 验证令牌
```
GET /api/auth/verify
Authorization: Bearer <token>
```

### 动态相关

#### 发布动态
```
POST /api/posts
Authorization: Bearer <token>
Content-Type: application/json

{
  "moodType": "快乐",
  "content": "今天心情很好！",
  "weather": "晴天",
  "location": "家",
  "tags": ["开心", "工作"],
  "images": ["https://example.com/image1.jpg"],
  "isPublic": true
}
```

#### 获取动态列表
```
GET /api/posts?page=1&pageSize=10&moodType=快乐&keyword=开心
```

#### 获取动态详情
```
GET /api/posts/:id
```

#### 更新动态
```
PUT /api/posts/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "更新的内容",
  "isPublic": false
}
```

#### 删除动态
```
DELETE /api/posts/:id
Authorization: Bearer <token>
```

#### 点赞动态
```
POST /api/posts/:id/like
Authorization: Bearer <token>
```

#### 取消点赞
```
DELETE /api/posts/:id/unlike
Authorization: Bearer <token>
```

### 评论相关

#### 添加评论
```
POST /api/posts/:postId/comments
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "评论内容",
  "parentId": 123  // 可选，用于回复评论
}
```

#### 获取评论列表
```
GET /api/posts/:postId/comments?page=1&pageSize=10
```

#### 删除评论
```
DELETE /api/comments/:id
Authorization: Bearer <token>
```

### 用户相关

#### 获取当前用户信息
```
GET /api/users/current
Authorization: Bearer <token>
```

#### 更新用户信息
```
PUT /api/users/update
Authorization: Bearer <token>
Content-Type: application/json

{
  "nickname": "新昵称",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

#### 获取用户统计
```
GET /api/users/:id/stats
```

#### 获取用户动态
```
GET /api/users/:id/posts?page=1&pageSize=10&includePrivate=false
```

### 广场相关

#### 获取广场统计
```
GET /api/square/stats
```

#### 获取热门动态
```
GET /api/square/trending?page=1&pageSize=10&timeRange=week
```

#### 获取最新动态
```
GET /api/square/latest?page=1&pageSize=10
```

#### 搜索动态
```
GET /api/square/search?keyword=开心&moodType=快乐&location=北京&sortBy=time
```

## 数据库表结构

### users 表
- id: 主键
- username: 用户名（唯一）
- password_hash: 密码哈希
- nickname: 昵称
- avatar_url: 头像URL
- created_at: 创建时间
- updated_at: 更新时间

### mood_posts 表
- id: 主键
- user_id: 用户ID（外键）
- mood_type: 心情类型
- content: 内容
- weather: 天气
- location: 位置
- gps_latitude: GPS纬度
- gps_longitude: GPS经度
- gps_address: GPS地址
- tags: 标签数组
- images: 图片URL数组
- is_public: 是否公开
- created_at: 创建时间
- updated_at: 更新时间

### post_likes 表
- id: 主键
- post_id: 动态ID（外键）
- user_id: 用户ID（外键）
- created_at: 创建时间

### post_comments 表
- id: 主键
- post_id: 动态ID（外键）
- user_id: 用户ID（外键）
- content: 评论内容
- parent_id: 父评论ID（外键，用于回复）
- created_at: 创建时间
- updated_at: 更新时间

## 部署说明

### 使用Docker部署

1. 创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
```

2. 创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_NAME=moodiary
      - DB_USER=moodiary
      - DB_PASSWORD=your_password
    depends_on:
      - postgres

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=moodiary
      - POSTGRES_USER=moodiary
      - POSTGRES_PASSWORD=your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

3. 启动服务：

```bash
docker-compose up -d
```

### 使用PM2部署

1. 安装PM2：

```bash
npm install -g pm2
```

2. 创建PM2配置文件 `ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: 'moodiary-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    }
  }]
};
```

3. 启动应用：

```bash
pm2 start ecosystem.config.js
```

## 开发说明

### 项目结构

```
backend/
├── config/
│   └── database.js          # 数据库配置
├── middleware/
│   ├── auth.js             # 身份验证中间件
│   ├── validation.js       # 数据验证中间件
│   └── errorHandler.js     # 错误处理中间件
├── routes/
│   ├── auth.js             # 认证路由
│   ├── users.js            # 用户路由
│   ├── posts.js            # 动态路由
│   ├── comments.js         # 评论路由
│   └── square.js           # 广场路由
├── server.js               # 服务器入口
├── package.json
└── README.md
```

### 开发命令

```bash
# 安装依赖
npm install

# 开发模式（自动重启）
npm run dev

# 生产模式
npm start

# 运行测试
npm test
```

### 代码规范

- 使用ES6+语法
- 使用async/await处理异步操作
- 统一的错误处理
- 完整的API文档注释
- 数据验证和类型检查

## 许可证

MIT License
"# moodiary-backend" 
