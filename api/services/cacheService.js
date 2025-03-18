const redis = require('redis');
const { promisify } = require('util');
const { REDIS_URL } = require('../../config/env');

const client = redis.createClient(REDIS_URL);

// Promisify Redis functions
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const expireAsync = promisify(client.expire).bind(client);
const delAsync = promisify(client.del).bind(client);

/**
 * Obtiene un valor de caché
 * @param {String} key - Clave de caché
 * @returns {Promise<Object>} Valor de caché (parsed JSON)
 */
exports.get = async (key) => {
  const data = await getAsync(key);
  if (!data) return null;
  return JSON.parse(data);
};

/**
 * Establece un valor en caché
 * @param {String} key - Clave de caché 
 * @param {Object} value - Valor a almacenar
 * @param {Number} expirySeconds - Tiempo de expiración en segundos
 * @returns {Promise<Boolean>} Resultado de la operación
 */
exports.set = async (key, value, expirySeconds = 3600) => {
  await setAsync(key, JSON.stringify(value));
  return await expireAsync(key, expirySeconds);
};

/**
 * Elimina un valor de caché
 * @param {String} key - Clave de caché
 * @returns {Promise<Number>} Número de claves eliminadas
 */
exports.del = async (key) => {
  return await delAsync(key);
};

/**
 * Middleware para cachear respuestas
 * @param {Number} duration - Duración en segundos
 * @returns {Function} Express middleware
 */
exports.cacheMiddleware = (duration) => {
  return async (req, res, next) => {
    // No cachear si es una solicitud POST, PUT, DELETE
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return next();
    }

    // Crear clave única basada en la URL y parámetros de consulta
    const key = `cache:${req.originalUrl}`;

    try {
      // Intentar obtener de caché
      const cachedData = await exports.get(key);

      if (cachedData) {
        return res.json(cachedData);
      }

      // Si no hay caché, almacenar la respuesta
      const originalSend = res.send;
      res.send = function (body) {
        try {
          const data = JSON.parse(body);
          exports.set(key, data, duration);
        } catch (e) {
          console.error('Error setting cache:', e);
        }
        originalSend.call(this, body);
      };

      next();
    } catch (err) {
      console.error('Cache error:', err);
      next();
    }
  };
}; 