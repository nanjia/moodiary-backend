const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 添加评论
router.post('/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: '评论内容不能为空'
      });
    }

    // 检查动态是否存在
    const postResult = await query(
      'SELECT id FROM mood_posts WHERE id = $1 AND is_public = true',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '动态不存在'
      });
    }

    // 如果是回复评论，检查父评论是否存在
    if (parentId) {
      const parentResult = await query(
        'SELECT id FROM post_comments WHERE id = $1 AND post_id = $2',
        [parentId, postId]
      );

      if (parentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '父评论不存在'
        });
      }
    }

    // 添加评论
    const result = await query(
      `INSERT INTO post_comments (post_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [postId, userId, content.trim(), parentId || null]
    );

    const comment = result.rows[0];

    // 获取用户信息
    const userResult = await query(
      'SELECT id, username, nickname, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    comment.user = userResult.rows[0];

    res.status(201).json({
      success: true,
      message: '评论添加成功',
      data: comment
    });
  } catch (error) {
    console.error('添加评论失败:', error);
    res.status(500).json({
      success: false,
      message: '添加评论失败',
      error: error.message
    });
  }
});

// 获取评论列表
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;

    const offset = (page - 1) * pageSize;

    // 检查动态是否存在
    const postResult = await query(
      'SELECT id FROM mood_posts WHERE id = $1 AND is_public = true',
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '动态不存在'
      });
    }

    // 查询评论列表（只查询顶级评论，不包含回复）
    const commentsQuery = `
      SELECT 
        c.*,
        u.username,
        u.nickname,
        u.avatar_url
      FROM post_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1 AND c.parent_id IS NULL
      ORDER BY c.created_at ASC
      LIMIT $2 OFFSET $3
    `;

    const commentsResult = await query(commentsQuery, [postId, pageSize, offset]);

    // 查询每个评论的回复
    const comments = [];
    for (const comment of commentsResult.rows) {
      const repliesResult = await query(
        `SELECT 
          c.*,
          u.username,
          u.nickname,
          u.avatar_url
        FROM post_comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.parent_id = $1
        ORDER BY c.created_at ASC
        LIMIT 5`,
        [comment.id]
      );

      comment.user = {
        id: comment.user_id,
        username: comment.username,
        nickname: comment.nickname,
        avatarUrl: comment.avatar_url
      };

      comment.replies = repliesResult.rows.map(reply => ({
        ...reply,
        user: {
          id: reply.user_id,
          username: reply.username,
          nickname: reply.nickname,
          avatarUrl: reply.avatar_url
        }
      }));

      comments.push(comment);
    }

    // 查询评论总数
    const countResult = await query(
      'SELECT COUNT(*) as total FROM post_comments WHERE post_id = $1 AND parent_id IS NULL',
      [postId]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    res.json({
      success: true,
      data: {
        items: comments,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取评论列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取评论列表失败',
      error: error.message
    });
  }
});

// 删除评论
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 检查评论是否存在且属于当前用户
    const checkResult = await query(
      'SELECT user_id FROM post_comments WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '评论不存在'
      });
    }

    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: '无权限删除此评论'
      });
    }

    // 删除评论（会级联删除回复）
    await query('DELETE FROM post_comments WHERE id = $1', [id]);

    res.json({
      success: true,
      message: '评论删除成功'
    });
  } catch (error) {
    console.error('删除评论失败:', error);
    res.status(500).json({
      success: false,
      message: '删除评论失败',
      error: error.message
    });
  }
});

// 获取评论详情
router.get('/detail/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        c.*,
        u.username,
        u.nickname,
        u.avatar_url
      FROM post_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '评论不存在'
      });
    }

    const comment = result.rows[0];
    comment.user = {
      id: comment.user_id,
      username: comment.username,
      nickname: comment.nickname,
      avatarUrl: comment.avatar_url
    };

    res.json({
      success: true,
      data: comment
    });
  } catch (error) {
    console.error('获取评论详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取评论详情失败',
      error: error.message
    });
  }
});

module.exports = router;
