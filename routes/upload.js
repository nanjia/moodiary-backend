const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { query } = require('../config/database');

const router = express.Router();

// 配置文件存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 根据文件类型选择存储目录
    let uploadPath = 'uploads/';
    if (req.route.path.includes('avatar')) {
      uploadPath = 'uploads/avatars/';
    } else if (req.route.path.includes('post')) {
      uploadPath = 'uploads/posts/';
    }
    
    // 确保目录存在
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的图片格式
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式'), false);
  }
};

// 配置multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 9 // 最多9个文件
  }
});

// 上传头像
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请选择要上传的头像文件'
      });
    }

    const userId = req.user.id;
    const filePath = req.file.path;
    const fileName = req.file.filename;

    // 这里应该将文件上传到对象存储（如腾讯云COS）
    // 暂时返回本地文件路径
    const avatarUrl = `/uploads/avatars/${fileName}`;

    // 更新用户头像URL到数据库
    await query(
      'UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [avatarUrl, userId]
    );

    res.json({
      success: true,
      message: '头像上传成功',
      data: {
        avatarUrl: avatarUrl,
        fileName: fileName
      }
    });
  } catch (error) {
    console.error('头像上传失败:', error);
    res.status(500).json({
      success: false,
      message: '头像上传失败',
      error: error.message
    });
  }
});

// 上传帖子图片
router.post('/post-images', authenticateToken, upload.array('images', 9), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请选择要上传的图片文件'
      });
    }

    const userId = req.user.id;
    const imageUrls = [];

    // 处理每个上传的文件
    for (const file of req.files) {
      const imageUrl = `/uploads/posts/${file.filename}`;
      imageUrls.push(imageUrl);
    }

    res.json({
      success: true,
      message: '图片上传成功',
      data: {
        imageUrls: imageUrls,
        count: imageUrls.length
      }
    });
  } catch (error) {
    console.error('图片上传失败:', error);
    res.status(500).json({
      success: false,
      message: '图片上传失败',
      error: error.message
    });
  }
});

// 删除文件
router.delete('/file/:filename', authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../uploads', filename);

    // 检查文件是否存在
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({
        success: true,
        message: '文件删除成功'
      });
    } else {
      res.status(404).json({
        success: false,
        message: '文件不存在'
      });
    }
  } catch (error) {
    console.error('文件删除失败:', error);
    res.status(500).json({
      success: false,
      message: '文件删除失败',
      error: error.message
    });
  }
});

module.exports = router;
