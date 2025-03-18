const mongoose = require('mongoose');
const { MONGO_URI } = require('./env');

mongoose.set('strictPopulate', false);

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Conectado a MongoDB 😎');
  } catch (err) {
    console.error('Error al conectar a MongoDB 😢', err);
    process.exit(1);
  }
};

module.exports = connectDB; 