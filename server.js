const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { MONGO_URI, PORT } = require('./config/env');
const mainRouter = require('./api/routes/index');

// Inicializar Express
const app = express();

// Middlewares básicos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Endpoint para health check en Render.com
app.get('/health', (req, res) => {
  const currentTime = new Date().toISOString();
  const memoryUsage = process.memoryUsage();

  res.json({
    status: 'OK',
    timestamp: currentTime,
    service: 'photomap-api',
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime() + ' segundos',
    memoryUsage: {
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
    },
    version: '1.0.0'
  });
});

// Usar solo el router principal para todas las rutas
app.use('/', mainRouter);

// Ruta de prueba directa
app.get('/test', (req, res) => {
  res.json({ success: true, message: 'API funcionando correctamente' });
});

// Middleware 404
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'No se encontró la ruta ' + req.originalUrl + ' en este servidor 🔍'
  });
});

// Middleware de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Error del servidor'
  });
});

// Antes de conectar a MongoDB, verificar la URI
const dbUri = MONGO_URI || 'mongodb://localhost:27017/photomap';
console.log('Intentando conectar a MongoDB con URI:', dbUri);

// Conectar a MongoDB con manejo de errores mejorado
mongoose.connect(dbUri)
  .then(() => {
    console.log('Conectado a MongoDB 😎');
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT} 🚀`);
    });
  })
  .catch(err => {
    console.error('Error conectando a MongoDB:', err);
    process.exit(1);
  }); 