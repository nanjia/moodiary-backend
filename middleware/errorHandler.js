// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
  console.error('服务器错误:', err);

  // 默认错误响应
  let statusCode = 500;
  let message = '服务器内部错误';

  // 处理不同类型的错误
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = '数据验证失败';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = '无效的数据格式';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = '无效的访问令牌';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = '访问令牌已过期';
  } else if (err.code === '23505') { // PostgreSQL唯一约束违反
    statusCode = 409;
    message = '数据已存在';
  } else if (err.code === '23503') { // PostgreSQL外键约束违反
    statusCode = 400;
    message = '关联数据不存在';
  } else if (err.code === '23502') { // PostgreSQL非空约束违反
    statusCode = 400;
    message = '必填字段缺失';
  } else if (err.code === '42P01') { // PostgreSQL表不存在
    statusCode = 500;
    message = '数据库表不存在';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 500;
    message = '数据库连接失败';
  } else if (err.code === 'ENOTFOUND') {
    statusCode = 500;
    message = '网络连接失败';
  }

  // 开发环境下返回详细错误信息
  const errorResponse = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && {
      error: err.message,
      stack: err.stack
    })
  };

  res.status(statusCode).json(errorResponse);
};

// 404处理中间件
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: '请求的资源不存在'
  });
};

// 异步错误捕获包装器
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
