const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 根据ID获取用户信息
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT id, username, nickname, avatar_url, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
});

// 获取当前用户信息
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      'SELECT id, username, nickname, avatar_url, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
});

// 更新用户信息
router.put('/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nickname, avatarUrl } = req.body;

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (nickname !== undefined) {
      updateFields.push(`nickname = $${paramIndex}`);
      updateValues.push(nickname);
      paramIndex++;
    }

    if (avatarUrl !== undefined) {
      updateFields.push(`avatar_url = $${paramIndex}`);
      updateValues.push(avatarUrl);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有要更新的字段'
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(userId);

    const result = await query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );

    res.json({
      success: true,
      message: '用户信息更新成功',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户信息失败',
      error: error.message
    });
  }
});

// 获取用户统计信息
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    // 检查用户是否存在
    const userResult = await query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 获取用户动态统计
    const postStatsResult = await query(
      `SELECT 
        COUNT(*) as post_count,
        COUNT(CASE WHEN is_public = true THEN 1 END) as public_post_count
      FROM mood_posts 
      WHERE user_id = $1`,
      [id]
    );

    // 获取用户收到的点赞总数
    const likeStatsResult = await query(
      `SELECT COUNT(*) as like_count
      FROM post_likes pl
      JOIN mood_posts mp ON pl.post_id = mp.id
      WHERE mp.user_id = $1`,
      [id]
    );

    // 获取用户评论总数
    const commentStatsResult = await query(
      'SELECT COUNT(*) as comment_count FROM post_comments WHERE user_id = $1',
      [id]
    );

    // 获取关注数和粉丝数
    const followStatsResult = await query(
      `SELECT 
        COUNT(CASE WHEN follower_id = $1 THEN 1 END) as following_count,
        COUNT(CASE WHEN following_id = $1 THEN 1 END) as follower_count
      FROM user_follows`,
      [id]
    );

    // 获取心情分布统计
    const moodStatsResult = await query(
      `SELECT 
        mood_type,
        COUNT(*) as count
      FROM mood_posts 
      WHERE user_id = $1 AND is_public = true
      GROUP BY mood_type
      ORDER BY count DESC`,
      [id]
    );

    const moodDistribution = {};
    moodStatsResult.rows.forEach(row => {
      moodDistribution[row.mood_type] = parseInt(row.count);
    });

    const stats = {
      postCount: parseInt(postStatsResult.rows[0].post_count),
      publicPostCount: parseInt(postStatsResult.rows[0].public_post_count),
      likeCount: parseInt(likeStatsResult.rows[0].like_count),
      commentCount: parseInt(commentStatsResult.rows[0].comment_count),
      followerCount: parseInt(followStatsResult.rows[0].follower_count),
      followingCount: parseInt(followStatsResult.rows[0].following_count),
      moodDistribution
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('获取用户统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户统计失败',
      error: error.message
    });
  }
});

// 获取用户动态列表
router.get('/:id/posts', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 10, includePrivate = false } = req.query;

    const offset = (page - 1) * pageSize;

    // 检查用户是否存在
    const userResult = await query(
      'SELECT id, username, nickname, avatar_url FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    const user = userResult.rows[0];

    // 构建查询条件
    let whereCondition = 'mp.user_id = $1';
    let queryParams = [id];
    let paramIndex = 2;

    if (!includePrivate || includePrivate === 'false') {
      whereCondition += ' AND mp.is_public = true';
    }

    // 查询动态列表
    const postsQuery = `
      SELECT 
        mp.*,
        COALESCE(like_counts.like_count, 0) as like_count,
        COALESCE(comment_counts.comment_count, 0) as comment_count,
        CASE WHEN user_likes.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM mood_posts mp
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
      WHERE ${whereCondition}
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
      WHERE ${whereCondition}
    `;

    const countResult = await query(countQuery, queryParams.slice(0, -3));
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const posts = postsResult.rows.map(post => ({
      ...post,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatarUrl: user.avatar_url
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
    console.error('获取用户动态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户动态失败',
      error: error.message
    });
  }
});

// 关注用户
router.post('/:id/follow', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const { id: followingId } = req.params;

    // 不能关注自己
    if (followerId === parseInt(followingId)) {
      return res.status(400).json({
        success: false,
        message: '不能关注自己'
      });
    }

    // 检查要关注的用户是否存在
    const userResult = await query(
      'SELECT id, username, nickname FROM users WHERE id = $1',
      [followingId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查是否已经关注
    const existingFollow = await query(
      'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    if (existingFollow.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: '已经关注过该用户'
      });
    }

    // 添加关注关系
    await query(
      'INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)',
      [followerId, followingId]
    );

    res.json({
      success: true,
      message: '关注成功'
    });
  } catch (error) {
    console.error('关注用户失败:', error);
    res.status(500).json({
      success: false,
      message: '关注用户失败',
      error: error.message
    });
  }
});

// 取消关注用户
router.delete('/:id/follow', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const { id: followingId } = req.params;

    const result = await query(
      'DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2 RETURNING *',
      [followerId, followingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未关注该用户'
      });
    }

    res.json({
      success: true,
      message: '取消关注成功'
    });
  } catch (error) {
    console.error('取消关注失败:', error);
    res.status(500).json({
      success: false,
      message: '取消关注失败',
      error: error.message
    });
  }
});

// 检查关注状态
router.get('/:id/follow-status', authenticateToken, async (req, res) => {
  try {
    const followerId = req.user.id;
    const { id: followingId } = req.params;

    const result = await query(
      'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );

    res.json({
      success: true,
      data: {
        isFollowing: result.rows.length > 0
      }
    });
  } catch (error) {
    console.error('检查关注状态失败:', error);
    res.status(500).json({
      success: false,
      message: '检查关注状态失败',
      error: error.message
    });
  }
});

// 获取关注列表
router.get('/:id/following', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (page - 1) * pageSize;

    const result = await query(
      `SELECT 
        u.id, u.username, u.nickname, u.avatar_url, uf.created_at as follow_time
      FROM user_follows uf
      JOIN users u ON uf.following_id = u.id
      WHERE uf.follower_id = $1
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3`,
      [id, pageSize, offset]
    );

    // 查询总数
    const countResult = await query(
      'SELECT COUNT(*) as total FROM user_follows WHERE follower_id = $1',
      [id]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      data: {
        items: result.rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取关注列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取关注列表失败',
      error: error.message
    });
  }
});

// 获取粉丝列表
router.get('/:id/followers', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (page - 1) * pageSize;

    const result = await query(
      `SELECT 
        u.id, u.username, u.nickname, u.avatar_url, uf.created_at as follow_time
      FROM user_follows uf
      JOIN users u ON uf.follower_id = u.id
      WHERE uf.following_id = $1
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3`,
      [id, pageSize, offset]
    );

    // 查询总数
    const countResult = await query(
      'SELECT COUNT(*) as total FROM user_follows WHERE following_id = $1',
      [id]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      data: {
        items: result.rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取粉丝列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取粉丝列表失败',
      error: error.message
    });
  }
});

module.exports = router;
