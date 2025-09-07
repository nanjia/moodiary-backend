const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validatePost } = require('../middleware/validation');

// 发布动态
router.post('/', authenticateToken, validatePost, async (req, res) => {
  try {
    const {
      moodType,
      content,
      weather,
      location,
      gpsLatitude,
      gpsLongitude,
      gpsAddress,
      tags,
      images,
      isPublic = true
    } = req.body;

    const userId = req.user.id;

    const result = await query(
      `INSERT INTO mood_posts 
       (user_id, mood_type, content, weather, location, gps_latitude, gps_longitude, gps_address, tags, images, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, moodType, content, weather, location, gpsLatitude, gpsLongitude, gpsAddress, tags, images, isPublic]
    );

    const post = result.rows[0];

    // 获取用户信息
    const userResult = await query(
      'SELECT id, username, nickname, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    post.user = userResult.rows[0];
    post.likeCount = 0;
    post.commentCount = 0;
    post.isLiked = false;

    res.status(201).json({
      success: true,
      message: '动态发布成功',
      data: post
    });
  } catch (error) {
    console.error('发布动态失败:', error);
    res.status(500).json({
      success: false,
      message: '发布动态失败',
      error: error.message
    });
  }
});

// 获取动态列表
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      userId,
      moodType,
      keyword
    } = req.query;

    const offset = (page - 1) * pageSize;
    let whereConditions = ['mp.is_public = true'];
    let queryParams = [];
    let paramIndex = 1;

    if (userId) {
      whereConditions.push(`mp.user_id = $${paramIndex}`);
      queryParams.push(userId);
      paramIndex++;
    }

    if (moodType) {
      whereConditions.push(`mp.mood_type = $${paramIndex}`);
      queryParams.push(moodType);
      paramIndex++;
    }

    if (keyword) {
      whereConditions.push(`(mp.content ILIKE $${paramIndex} OR mp.location ILIKE $${paramIndex})`);
      queryParams.push(`%${keyword}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 查询动态列表
    const postsQuery = `
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
      ${whereClause}
      ORDER BY mp.created_at DESC
      LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
    `;

    queryParams.push(req.user?.id || null);
    queryParams.push(pageSize);
    queryParams.push(offset);

    const postsResult = await query(postsQuery, queryParams);

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM mood_posts mp
      ${whereClause}
    `;

    const countResult = await query(countQuery, queryParams.slice(0, -3));
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const posts = postsResult.rows.map(post => ({
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
    console.error('获取动态列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取动态列表失败',
      error: error.message
    });
  }
});

// 获取动态详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
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
      LEFT JOIN post_likes user_likes ON mp.id = user_likes.post_id AND user_likes.user_id = $2
      WHERE mp.id = $1`,
      [id, req.user?.id || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '动态不存在'
      });
    }

    const post = result.rows[0];
    post.user = {
      id: post.user_id,
      username: post.username,
      nickname: post.nickname,
      avatarUrl: post.avatar_url
    };
    post.likeCount = parseInt(post.like_count);
    post.commentCount = parseInt(post.comment_count);
    post.isLiked = post.is_liked;

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    console.error('获取动态详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取动态详情失败',
      error: error.message
    });
  }
});

// 更新动态
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    // 检查动态是否存在且属于当前用户
    const checkResult = await query(
      'SELECT user_id FROM mood_posts WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '动态不存在'
      });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '无权限修改此动态'
      });
    }

    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(updateData[key]);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的字段'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(id);

    const result = await query(
      `UPDATE mood_posts SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    res.json({
      success: true,
      message: '动态更新成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('更新动态失败:', error);
    res.status(500).json({
      success: false,
      message: '更新动态失败',
      error: error.message
    });
  }
});

// 删除动态
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 检查动态是否存在且属于当前用户
    const checkResult = await query(
      'SELECT user_id FROM mood_posts WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '动态不存在'
      });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '无权限删除此动态'
      });
    }

    await query('DELETE FROM mood_posts WHERE id = $1', [id]);

    res.json({
      success: true,
      message: '动态删除成功'
    });
  } catch (error) {
    console.error('删除动态失败:', error);
    res.status(500).json({
      success: false,
      message: '删除动态失败',
      error: error.message
    });
  }
});

// 点赞动态
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 检查动态是否存在
    const postResult = await query(
      'SELECT id FROM mood_posts WHERE id = $1 AND is_public = true',
      [id]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '动态不存在'
      });
    }

    // 检查是否已经点赞
    const likeResult = await query(
      'SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (likeResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: '已经点赞过了'
      });
    }

    // 添加点赞
    await query(
      'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)',
      [id, userId]
    );

    res.json({
      success: true,
      message: '点赞成功'
    });
  } catch (error) {
    console.error('点赞失败:', error);
    res.status(500).json({
      success: false,
      message: '点赞失败',
      error: error.message
    });
  }
});

// 取消点赞
router.delete('/:id/unlike', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到点赞记录'
      });
    }

    res.json({
      success: true,
      message: '取消点赞成功'
    });
  } catch (error) {
    console.error('取消点赞失败:', error);
    res.status(500).json({
      success: false,
      message: '取消点赞失败',
      error: error.message
    });
  }
});

module.exports = router;
