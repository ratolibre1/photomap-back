const PublicMap = require('../models/PublicMap');
const { AppError } = require('../utils/errorHandler');
const crypto = require('crypto');
const photoService = require('./photoService');

/**
 * Genera un ID único para compartir
 * @returns {String} ID único basado en hash del userId y timestamp
 */
const generateShareId = () => {
  const timestamp = Date.now();
  // Creamos un hash usando SHA-256 del userId + timestamp
  const hash = crypto
    .createHash('sha256')
    .update(`${timestamp}`)
    .digest('base64url'); // base64url es URL-safe por defecto

  // Tomamos los primeros 16 caracteres del hash
  return hash.substring(0, 16);
};

/**
 * Crea un nuevo mapa público
 * @param {Object} mapData - Datos del mapa
 * @param {String} userId - ID del usuario
 * @returns {Promise<Object>} - Mapa creado
 */
exports.createPublicMap = async (mapData, userId) => {
  try {
    // Generar ID único para compartir
    const shareId = generateShareId();

    const publicMapData = {
      ...mapData,
      userId,
      shareId
    };

    const publicMap = new PublicMap(publicMapData);
    return await publicMap.save();
  } catch (error) {
    console.error('Error en createPublicMap:', error);
    throw error;
  }
};

/**
 * Obtiene todos los mapas públicos de un usuario
 * @param {String} userId - ID del usuario
 * @param {Object} options - Opciones de paginación
 * @returns {Promise<Object>} - Lista de mapas y metadata de paginación
 */
exports.getUserMaps = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const maps = await PublicMap.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await PublicMap.countDocuments({ userId });

  return {
    maps,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Obtiene un mapa público por ID
 * @param {String} mapId - ID del mapa
 * @param {String} userId - ID del usuario (opcional, para verificar permisos)
 * @returns {Promise<Object>} - Mapa encontrado
 */
exports.getMapById = async (mapId, userId = null) => {
  const map = await PublicMap.findById(mapId);

  if (!map) {
    throw new AppError('Mapa no encontrado', 404);
  }

  // Si se proporciona userId, verificar que el mapa pertenezca al usuario
  if (userId && map.userId.toString() !== userId) {
    throw new AppError('No tienes permiso para acceder a este mapa', 403);
  }

  return map;
};

/**
 * Obtiene un mapa público por su ID de compartir
 * @param {String} shareId - ID único para compartir
 * @returns {Promise<Object>} - Mapa encontrado
 */
exports.getMapByShareId = async (shareId) => {
  const map = await PublicMap.findOne({ shareId, isActive: true });

  if (!map) {
    throw new AppError('Mapa no encontrado o desactivado', 404);
  }

  // Actualizar estadísticas de visualización
  map.stats.viewCount += 1;
  map.stats.lastViewed = new Date();
  await map.save();

  return map;
};

/**
 * Actualiza un mapa público
 * @param {String} mapId - ID del mapa
 * @param {Object} updateData - Datos a actualizar
 * @param {String} userId - ID del usuario
 * @returns {Promise<Object>} - Mapa actualizado
 */
exports.updateMap = async (mapId, updateData, userId) => {
  const map = await this.getMapById(mapId, userId);

  // Actualizar campos permitidos
  if (updateData.title) map.title = updateData.title;
  if (updateData.description) map.description = updateData.description;
  if (updateData.filters) map.filters = updateData.filters;
  if (updateData.displayOptions) map.displayOptions = updateData.displayOptions;
  if (updateData.isActive !== undefined) map.isActive = updateData.isActive;
  if (updateData.language && ['es', 'en'].includes(updateData.language)) {
    map.language = updateData.language;
  }
  if (updateData.colorPalette !== undefined) {
    map.colorPalette = updateData.colorPalette;
  }

  return await map.save();
};

/**
 * Elimina un mapa público
 * @param {String} mapId - ID del mapa
 * @param {String} userId - ID del usuario
 * @returns {Promise<Object>} - Resultado de la operación
 */
exports.deleteMap = async (mapId, userId) => {
  const map = await this.getMapById(mapId, userId);
  return await map.deleteOne();
};

/**
 * Obtiene las fotos asociadas a un mapa público
 * @param {Object} map - Mapa público
 * @param {Object} user - Usuario (opcional, para verificar permisos adicionales)
 * @returns {Promise<Object>} - Fotos según los filtros del mapa
 */
exports.getPhotosForMap = async (map, user = null) => {
  // Convertir los filtros del mapa al formato que espera el photoService
  const filters = { ...map.filters };

  // Procesar fechas correctamente si existen
  if (filters.startDate && filters.endDate) {
    // Asegurarse de que sean objetos Date válidos
    filters.startDate = new Date(filters.startDate);
    filters.endDate = new Date(filters.endDate);

    // Validar que las fechas sean correctas
    if (isNaN(filters.startDate.getTime()) || isNaN(filters.endDate.getTime())) {
      console.warn('Fechas inválidas en el mapa:', map._id);
      // Eliminar fechas inválidas para evitar errores
      delete filters.startDate;
      delete filters.endDate;
    } else {
      // Si son válidas, formatear como string en formato ISO
      filters.startDate = filters.startDate.toISOString().split('T')[0];
      filters.endDate = filters.endDate.toISOString().split('T')[0];
      console.log('Fechas procesadas:', filters.startDate, filters.endDate);
    }
  }

  // Opciones de visualización
  const options = { ...map.displayOptions };

  // Obtener las fotos usando el servicio existente
  return await photoService.searchPhotos(filters, options, user);
}; 