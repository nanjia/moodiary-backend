const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// 发送私信
router.post('/', authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content, images, videos } = req.body;

    // 验证参数
    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: '接收者ID和消息内容不能为空'
      });
    }

    // 检查接收者是否存在
    const receiverResult = await query(
      'SELECT id, username, nickname FROM users WHERE id = $1',
      [receiverId]
    );

    if (receiverResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '接收者不存在'
      });
    }

    // 不能给自己发私信
    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: '不能给自己发送私信'
      });
    }

    // 插入私信
    const result = await query(
      `INSERT INTO private_messages (sender_id, receiver_id, content, images, videos, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [senderId, receiverId, content, images, videos]
    );

    const message = result.rows[0];

    // 返回包含用户信息的消息
    const messageWithUsers = {
      ...message,
      sender: {
        id: req.user.id,
        username: req.user.username,
        nickname: req.user.nickname,
        avatarUrl: req.user.avatarUrl
      },
      receiver: {
        id: receiverResult.rows[0].id,
        username: receiverResult.rows[0].username,
        nickname: receiverResult.rows[0].nickname
      }
    };

    res.status(201).json({
      success: true,
      message: '私信发送成功',
      data: messageWithUsers
    });
  } catch (error) {
    console.error('发送私信失败:', error);
    res.status(500).json({
      success: false,
      message: '发送私信失败',
      error: error.message
    });
  }
});

// 获取私信列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, pageSize = 20, type = 'all' } = req.query; // type: 'sent', 'received', 'all'

    const offset = (page - 1) * pageSize;

    let whereCondition = '';
    let queryParams = [userId];
    let paramIndex = 2;

    switch (type) {
      case 'sent':
        whereCondition = 'pm.sender_id = $1';
        break;
      case 'received':
        whereCondition = 'pm.receiver_id = $1';
        break;
      default:
        whereCondition = '(pm.sender_id = $1 OR pm.receiver_id = $1)';
    }

    // 查询私信列表
    const messagesQuery = `
      SELECT 
        pm.*,
        sender.id as sender_id,
        sender.username as sender_username,
        sender.nickname as sender_nickname,
        sender.avatar_url as sender_avatar_url,
        receiver.id as receiver_id,
        receiver.username as receiver_username,
        receiver.nickname as receiver_nickname,
        receiver.avatar_url as receiver_avatar_url
      FROM private_messages pm
      JOIN users sender ON pm.sender_id = sender.id
      JOIN users receiver ON pm.receiver_id = receiver.id
      WHERE ${whereCondition}
      ORDER BY pm.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(pageSize);
    queryParams.push(offset);

    const messagesResult = await query(messagesQuery, queryParams);

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM private_messages pm
      WHERE ${whereCondition}
    `;

    const countResult = await query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const messages = messagesResult.rows.map(msg => ({
      id: msg.id,
      content: msg.content,
      images: msg.images,
      videos: msg.videos,
      created_at: msg.created_at,
      is_read: msg.is_read,
      sender_id: msg.sender_id,
      sender_username: msg.sender_username,
      sender_nickname: msg.sender_nickname,
      sender_avatar: msg.sender_avatar_url,
      receiver_id: msg.receiver_id,
      receiver_username: msg.receiver_username,
      receiver_nickname: msg.receiver_nickname,
      receiver_avatar: msg.receiver_avatar_url
    }));

    res.json({
      success: true,
      data: {
        items: messages,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取私信列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取私信列表失败',
      error: error.message
    });
  }
});

// 获取私信详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      `SELECT 
        pm.*,
        sender.id as sender_id,
        sender.username as sender_username,
        sender.nickname as sender_nickname,
        sender.avatar_url as sender_avatar_url,
        receiver.id as receiver_id,
        receiver.username as receiver_username,
        receiver.nickname as receiver_nickname,
        receiver.avatar_url as receiver_avatar_url
      FROM private_messages pm
      JOIN users sender ON pm.sender_id = sender.id
      JOIN users receiver ON pm.receiver_id = receiver.id
      WHERE pm.id = $1 AND (pm.sender_id = $2 OR pm.receiver_id = $2)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '私信不存在或无权限访问'
      });
    }

    const msg = result.rows[0];

    // 如果是接收者，标记为已读
    if (msg.receiver_id === userId && !msg.is_read) {
      await query(
        'UPDATE private_messages SET is_read = true WHERE id = $1',
        [id]
      );
    }

    const message = {
      id: msg.id,
      content: msg.content,
      images: msg.images,
      videos: msg.videos,
      createdAt: msg.created_at,
      isRead: msg.is_read,
      sender: {
        id: msg.sender_id,
        username: msg.sender_username,
        nickname: msg.sender_nickname,
        avatarUrl: msg.sender_avatar_url
      },
      receiver: {
        id: msg.receiver_id,
        username: msg.receiver_username,
        nickname: msg.receiver_nickname,
        avatarUrl: msg.receiver_avatar_url
      }
    };

    res.json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error('获取私信详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取私信详情失败',
      error: error.message
    });
  }
});

// 标记私信为已读
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      'UPDATE private_messages SET is_read = true WHERE id = $1 AND receiver_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '私信不存在或无权限操作'
      });
    }

    res.json({
      success: true,
      message: '私信已标记为已读'
    });
  } catch (error) {
    console.error('标记私信已读失败:', error);
    res.status(500).json({
      success: false,
      message: '标记私信已读失败',
      error: error.message
    });
  }
});

// 删除私信
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await query(
      'DELETE FROM private_messages WHERE id = $1 AND (sender_id = $2 OR receiver_id = $2) RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '私信不存在或无权限删除'
      });
    }

    res.json({
      success: true,
      message: '私信删除成功'
    });
  } catch (error) {
    console.error('删除私信失败:', error);
    res.status(500).json({
      success: false,
      message: '删除私信失败',
      error: error.message
    });
  }
});

// 获取与特定用户的对话
router.get('/conversation/:userId', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId: targetUserId } = req.params;
    const { page = 1, pageSize = 50 } = req.query;

    const offset = (page - 1) * pageSize;

    // 查询与特定用户的对话消息
    const messagesQuery = `
      SELECT 
        pm.*,
        sender.id as sender_id,
        sender.username as sender_username,
        sender.nickname as sender_nickname,
        sender.avatar_url as sender_avatar_url,
        receiver.id as receiver_id,
        receiver.username as receiver_username,
        receiver.nickname as receiver_nickname,
        receiver.avatar_url as receiver_avatar_url
      FROM private_messages pm
      JOIN users sender ON pm.sender_id = sender.id
      JOIN users receiver ON pm.receiver_id = receiver.id
      WHERE (pm.sender_id = $1 AND pm.receiver_id = $2) 
         OR (pm.sender_id = $2 AND pm.receiver_id = $1)
      ORDER BY pm.created_at ASC
      LIMIT $3 OFFSET $4
    `;

    const messagesResult = await query(messagesQuery, [
      currentUserId, 
      targetUserId, 
      pageSize, 
      offset
    ]);

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM private_messages pm
      WHERE (pm.sender_id = $1 AND pm.receiver_id = $2) 
         OR (pm.sender_id = $2 AND pm.receiver_id = $1)
    `;

    const countResult = await query(countQuery, [currentUserId, targetUserId]);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / pageSize);

    // 格式化返回数据
    const messages = messagesResult.rows.map(msg => ({
      id: msg.id,
      content: msg.content,
      images: msg.images,
      videos: msg.videos,
      created_at: msg.created_at,
      is_read: msg.is_read,
      sender_id: msg.sender_id,
      sender_username: msg.sender_username,
      sender_nickname: msg.sender_nickname,
      sender_avatar: msg.sender_avatar_url,
      receiver_id: msg.receiver_id,
      receiver_username: msg.receiver_username,
      receiver_nickname: msg.receiver_nickname,
      receiver_avatar: msg.receiver_avatar_url
    }));

    res.json({
      success: true,
      data: {
        items: messages,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages
      }
    });
  } catch (error) {
    console.error('获取对话失败:', error);
    res.status(500).json({
      success: false,
      message: '获取对话失败',
      error: error.message
    });
  }
});

// 获取未读私信数量
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      'SELECT COUNT(*) as count FROM private_messages WHERE receiver_id = $1 AND is_read = false',
      [userId]
    );

    const unreadCount = parseInt(result.rows[0].count);

    res.json({
      success: true,
      data: {
        unreadCount
      }
    });
  } catch (error) {
    console.error('获取未读私信数量失败:', error);
    res.status(500).json({
      success: false,
      message: '获取未读私信数量失败',
      error: error.message
    });
  }
});

module.exports = router;
