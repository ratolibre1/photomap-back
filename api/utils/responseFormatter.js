exports.success = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({
    status: 'success',
    data
  });
};

exports.error = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({
    status: 'error',
    message
  });
}; 