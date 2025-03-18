require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 4567,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/tu_base_de_datos',
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'tu_super_secreto_jwt',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1d',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION || 'us-east-2',
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME
}; 