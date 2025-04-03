const publicMapService = require('../services/publicMapService');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const User = require('../models/User');

// Crear un nuevo mapa público
exports.createPublicMap = async (req, res, next) => {
  try {
    // Validar datos mínimos requeridos
    if (!req.body.title) {
      return next(new AppError('El título es obligatorio', 400));
    }

    // Obtener userId del token JWT
    const userId = req.user.id;

    // Obtener el usuario completo para acceder a su idioma preferido
    const user = await User.findById(userId);
    if (!user) {
      return next(new AppError('Usuario no encontrado', 404));
    }

    // Obtener idioma del usuario: prioridad al idioma en la solicitud, luego al preferido del usuario
    // Extraer solo el código de idioma base si viene con región (ej: 'es-CL' -> 'es')
    const userPreferredLanguage = user.preferredLanguage?.split('-')[0] || 'es';

    // Capturar el idioma de la solicitud o usar el del usuario
    const language = req.body.language || userPreferredLanguage;

    // Si el idioma proporcionado no está en los permitidos, usar el preferido del usuario
    const validLanguage = ['es', 'en'].includes(language) ? language : userPreferredLanguage;

    // Capturar la paleta de colores (si se proporciona)
    const colorPalette = req.body.colorPalette || 'default';

    // Agregar el idioma y la paleta de colores a los datos del mapa
    const mapData = {
      ...req.body,
      language: validLanguage,
      colorPalette: colorPalette
    };

    // Crear el mapa público
    const publicMap = await publicMapService.createPublicMap(mapData, userId);

    return success(res, { publicMap }, 201);
  } catch (err) {
    next(err);
  }
};

// Obtener todos los mapas públicos del usuario
exports.getUserMaps = async (req, res, next) => {
  try {
    // Parsear parámetros de paginación
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    // Obtener mapas del usuario
    const result = await publicMapService.getUserMaps(req.user.id, options);

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// Obtener un mapa público por ID (solo el propio usuario)
exports.getMapById = async (req, res, next) => {
  try {
    const map = await publicMapService.getMapById(req.params.id, req.user.id);
    return success(res, { map });
  } catch (err) {
    next(err);
  }
};

// Obtener un mapa público por shareId (acceso público)
exports.getMapByShareId = async (req, res, next) => {
  try {
    const map = await publicMapService.getMapByShareId(req.params.shareId);
    return success(res, { map });
  } catch (err) {
    next(err);
  }
};

// Obtener fotos asociadas a un mapa público por ID (solo el propio usuario)
exports.getMapPhotosById = async (req, res, next) => {
  try {
    // Obtener el mapa
    const map = await publicMapService.getMapById(req.params.id, req.user.id);

    // Obtener las fotos asociadas
    const result = await publicMapService.getPhotosForMap(map, req.user);

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// Obtener fotos asociadas a un mapa público por shareId (acceso público)
exports.getMapPhotosByShareId = async (req, res, next) => {
  try {
    // Obtener el mapa
    const map = await publicMapService.getMapByShareId(req.params.shareId);

    // Obtener las fotos asociadas (pasar usuario si está autenticado)
    const result = await publicMapService.getPhotosForMap(map, req.user || null);

    return success(res, result);
  } catch (err) {
    next(err);
  }
};

// Actualizar un mapa público
exports.updateMap = async (req, res, next) => {
  try {
    // Si se proporcionó un idioma, verificar que sea válido
    if (req.body.language) {
      // Si no es válido, intentar usar el idioma preferido del usuario
      if (!['es', 'en'].includes(req.body.language)) {
        // Obtener usuario
        const user = await User.findById(req.user.id);
        if (user) {
          // Extraer solo el código de idioma base
          const userPreferredLanguage = user.preferredLanguage?.split('-')[0] || 'es';

          // Usar el idioma preferido del usuario si es válido
          if (['es', 'en'].includes(userPreferredLanguage)) {
            req.body.language = userPreferredLanguage;
          } else {
            // Si no es válido, predeterminado a español
            req.body.language = 'es';
          }
        } else {
          // Si no se encuentra el usuario, usar español por defecto
          req.body.language = 'es';
        }
      }
    }

    // Actualizar el mapa
    const updatedMap = await publicMapService.updateMap(
      req.params.id,
      req.body,
      req.user.id
    );

    return success(res, { map: updatedMap });
  } catch (err) {
    next(err);
  }
};

// Eliminar un mapa público
exports.deleteMap = async (req, res, next) => {
  try {
    await publicMapService.deleteMap(req.params.id, req.user.id);
    return success(res, { message: 'Mapa eliminado correctamente' });
  } catch (err) {
    next(err);
  }
}; 