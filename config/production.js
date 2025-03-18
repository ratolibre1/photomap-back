// Configuraciones específicas para producción
module.exports = {
  CORS_ORIGIN: process.env.FRONTEND_URL,
  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // 100 peticiones por ventana
  },
  COMPRESSION: true,
  HELMET: true
}; 