const Joi = require('joi');

// 验证动态数据
const validatePost = (req, res, next) => {
  const schema = Joi.object({
    moodType: Joi.string().valid(
      '快乐', '兴奋', '平静', '一般', '疲惫', '焦虑', '压力', '悲伤', '愤怒'
    ).required(),
    content: Joi.string().max(1000).required(),
    weather: Joi.string().valid(
      '晴天', '多云', '阴天', '小雨', '大雨', '雪天', '雾天'
    ).optional(),
    location: Joi.string().max(200).optional(),
    gpsLatitude: Joi.number().min(-90).max(90).optional(),
    gpsLongitude: Joi.number().min(-180).max(180).optional(),
    gpsAddress: Joi.string().max(500).optional(),
    tags: Joi.array().items(Joi.string().max(20)).max(10).optional(),
    images: Joi.array().items(Joi.string().uri()).max(9).optional(),
    videos: Joi.array().items(Joi.string().uri()).max(3).optional(),
    isPublic: Joi.boolean().optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '数据验证失败',
      error: error.details[0].message
    });
  }

  next();
};

// 验证评论数据
const validateComment = (req, res, next) => {
  const schema = Joi.object({
    content: Joi.string().min(1).max(500).required(),
    parentId: Joi.number().integer().positive().optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '评论数据验证失败',
      error: error.details[0].message
    });
  }

  next();
};

// 验证用户数据
const validateUser = (req, res, next) => {
  const schema = Joi.object({
    nickname: Joi.string().min(1).max(100).optional(),
    avatarUrl: Joi.string().uri().optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '用户数据验证失败',
      error: error.details[0].message
    });
  }

  next();
};

// 验证分页参数
const validatePagination = (req, res, next) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional()
  });

  const { error } = schema.validate(req.query);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '分页参数验证失败',
      error: error.details[0].message
    });
  }

  next();
};

// 验证搜索参数
const validateSearch = (req, res, next) => {
  const schema = Joi.object({
    keyword: Joi.string().max(100).optional(),
    moodType: Joi.string().valid(
      '快乐', '兴奋', '平静', '一般', '疲惫', '焦虑', '压力', '悲伤', '愤怒'
    ).optional(),
    location: Joi.string().max(200).optional(),
    page: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional(),
    sortBy: Joi.string().valid('time', 'likes', 'comments').optional()
  });

  const { error } = schema.validate(req.query);
  if (error) {
    return res.status(400).json({
      success: false,
      message: '搜索参数验证失败',
      error: error.details[0].message
    });
  }

  next();
};

module.exports = {
  validatePost,
  validateComment,
  validateUser,
  validatePagination,
  validateSearch
};
