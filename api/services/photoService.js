const Photo = require('../models/Photo');
const { AppError } = require('../utils/errorHandler');
const s3Service = require('./s3Service');
const imageService = require('./imageService');
const mongoose = require('mongoose');

// Aplicar al principio del archivo
mongoose.set('strictPopulate', false);

/**
 * Crea una nueva foto
 * @param {Object} photoData - Datos de la foto
 * @param {String} [userId] - ID del usuario (opcional, puede venir en photoData)
 * @returns {Promise<Object>} - Foto creada
 */
exports.createPhoto = async (photoData, userId) => {
  try {
    // Usar el userId proporcionado o el de photoData
    const finalUserId = userId || photoData.userId;

    // Si ni siquiera tenemos userId en photoData, loguear para debug
    if (!finalUserId && !photoData.userId) {
      console.warn('Creando foto sin userId:', photoData.title);
    }

    const photoToCreate = {
      ...photoData,
      userId: finalUserId // Asegurarnos de usar el userId correcto
    };

    // Solo para depuración
    console.log('Creando foto con datos:', {
      title: photoToCreate.title,
      userId: photoToCreate.userId,
      hasLocation: !!photoToCreate.location
    });

    // Verificar si tiene coordenadas válidas para geocodificación
    if (photoToCreate.location &&
      photoToCreate.location.coordinates &&
      photoToCreate.location.coordinates.length === 2 &&
      (photoToCreate.location.coordinates[0] !== 0 || photoToCreate.location.coordinates[1] !== 0)) {
      // Marcar para procesamiento posterior
      photoToCreate.geocodingStatus = 'pending';
    } else {
      // No tiene coordenadas válidas
      photoToCreate.geocodingStatus = 'failed';
    }

    const photo = new Photo(photoToCreate);
    return await photo.save();
  } catch (error) {
    console.error('Error en createPhoto:', error);
    throw error;
  }
};

/**
 * Obtiene fotos según filtros
 */
exports.searchPhotos = async (filters = {}, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  // Construir el query
  const query = {};

  // Filtrar por usuario
  if (filters.userId) {
    query.userId = filters.userId;
  }

  // Buscar por texto en título o descripción
  if (filters.searchText) {
    query.$or = [
      { title: { $regex: filters.searchText, $options: 'i' } },
      { description: { $regex: filters.searchText, $options: 'i' } }
    ];
  }

  // Filtrar por visibilidad (solo si se proporciona)
  if (filters.isPublic !== undefined) {
    query.isPublic = filters.isPublic;
  }

  // Aplicar filtros
  if (filters.categories && filters.categories.length) {
    query.categories = { $in: filters.categories };
  }

  if (filters.startDate && filters.endDate) {
    query.timestamp = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  } else if (filters.startDate) {
    query.timestamp = { $gte: new Date(filters.startDate) };
  } else if (filters.endDate) {
    query.timestamp = { $lte: new Date(filters.endDate) };
  }

  // Filtro por ubicación (cerca de un punto)
  if (filters.near && filters.near.lat && filters.near.lng && filters.near.distance) {
    const coordinates = [filters.near.lng, filters.near.lat];
    const distance = filters.near.distance;

    // Si hay una ordenación personalizada, usar $geoWithin
    if (options.sortBy && options.sortBy !== 'distance') {
      query.location = {
        $geoWithin: {
          $centerSphere: [
            coordinates,
            distance / 6378100 // convertir metros a radianes (radio de la Tierra ~6378.1km)
          ]
        }
      };
    } else {
      // Si no hay ordenación personalizada o se ordena por distancia, usar $near
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: distance // en metros
        }
      };
    }
  }

  // En searchPhotos, agregar soporte para filtrar por IDs de entidades geográficas
  if (filters.countryId) {
    query['geocodingDetails.countryId'] = filters.countryId;
  }

  if (filters.regionId) {
    query['geocodingDetails.regionId'] = filters.regionId;
  }

  if (filters.countyId) {
    query['geocodingDetails.countyId'] = filters.countyId;
  }

  if (filters.cityId) {
    query['geocodingDetails.cityId'] = filters.cityId;
  }

  // Opciones de ordenación
  const sortField = options.sortBy || 'timestamp';
  const sortDirection = options.sortDirection === 'asc' ? 1 : -1;
  const sortOptions = {};
  sortOptions[sortField] = sortDirection;

  // Corregido - usar userId en lugar de uploader
  const photos = await Photo.find(query)
    .populate('userId', 'name')
    .sort(sortOptions) // Usar opciones de ordenación dinámicas
    .skip(skip)
    .limit(limit);

  // Contar total para paginación
  const total = await Photo.countDocuments(query);

  console.log('Ejecutando consulta final:', JSON.stringify(query));

  return {
    photos,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Obtiene una foto por ID
 */
exports.getPhotoById = async (photoId) => {
  // Corregido - usar userId en lugar de uploader
  const photo = await Photo.findById(photoId)
    .populate('categories', 'name')
    .populate('userId', 'name');

  if (!photo) {
    throw new AppError('Foto no encontrada', 404);
  }

  return photo;
};

/**
 * Actualiza una foto
 */
exports.updatePhoto = async (photoId, updateData, userId) => {
  const photo = await Photo.findById(photoId);

  if (!photo) {
    throw new AppError('Foto no encontrada', 404);
  }

  // Corregido - usar userId en lugar de uploader
  if (photo.userId && photo.userId.toString() !== userId) {
    throw new AppError('No tienes permiso para actualizar esta foto', 403);
  }

  // Verificar si estamos actualizando coordenadas
  if (updateData.location && updateData.location.coordinates) {
    // Reiniciar la información de geocodificación si las coordenadas cambiaron
    if (photo.geocodingDetails) {
      // Mantener solo updatedAt del objeto geocodingDetails
      updateData.geocodingDetails = {
        updatedAt: new Date()
      };
    }
  }

  // Actualizar la foto
  Object.keys(updateData).forEach(key => {
    if (updateData[key] !== undefined) {
      // Para manejar campos anidados como 'location.name'
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        if (!photo[parent]) photo[parent] = {};
        photo[parent][child] = updateData[key];
      } else {
        photo[key] = updateData[key];
      }
    }
  });

  // Guardar cambios
  await photo.save();

  return photo;
};

/**
 * Elimina una foto
 */
exports.deletePhoto = async (photoId, userId, userRole) => {
  const photo = await Photo.findById(photoId);

  // Corregido para usar userId y userRole pasados como parámetros
  if (photo.userId && photo.userId.toString() !== userId && userRole !== 'admin') {
    throw new AppError('No tienes permiso para eliminar esta foto', 403);
  }

  // Eliminar archivos de S3
  await s3Service.deleteFileFromS3(photo.originalUrl);
  await s3Service.deleteFileFromS3(photo.thumbnailUrl);

  // Eliminar de la base de datos
  await Photo.findByIdAndDelete(photoId);

  return { message: 'Foto eliminada correctamente' };
};

/**
 * Actualiza la visibilidad de múltiples fotos por IDs
 * @param {Array} photoIds - Array de IDs de fotos a actualizar
 * @param {Boolean} isPublic - Booleano que indica si las fotos son públicas
 * @param {String} userId - ID del usuario que hace la solicitud
 * @returns {Promise<Object>} - Resultado con fotos actualizadas y errores
 */
exports.updatePhotosVisibility = async (photoIds, isPublic, userId) => {
  try {
    // Validar que isPublic sea un booleano
    if (typeof isPublic !== 'boolean') {
      throw new AppError('El valor de visibilidad debe ser un booleano', 400);
    }

    console.log(`Actualizando visibilidad a "${isPublic ? 'público' : 'privado'}" para ${photoIds.length} fotos`);

    // Resultados
    const result = {
      updated: [],
      errors: [],
      totalUpdated: 0,
      totalFailed: 0
    };

    // Para cada ID en el array, intentar actualizar
    for (const photoId of photoIds) {
      try {
        // Validar que el ID sea válido
        if (!mongoose.Types.ObjectId.isValid(photoId)) {
          result.errors.push({ id: photoId, error: 'ID no válido' });
          result.totalFailed++;
          continue;
        }

        // Buscar la foto
        const photo = await Photo.findById(photoId);

        // Verificar si la foto existe
        if (!photo) {
          result.errors.push({ id: photoId, error: 'Foto no encontrada' });
          result.totalFailed++;
          continue;
        }

        // Verificar permisos (solo el propietario o admin)
        if (photo.userId && photo.userId.toString() !== userId) {
          result.errors.push({ id: photoId, error: 'No tienes permiso para esta foto' });
          result.totalFailed++;
          continue;
        }

        // Actualizar visibilidad
        photo.isPublic = isPublic;
        await photo.save();

        // Agregar a resultados exitosos
        result.updated.push(photoId);
        result.totalUpdated++;

      } catch (error) {
        console.error(`Error actualizando foto ${photoId}:`, error);
        result.errors.push({ id: photoId, error: error.message });
        result.totalFailed++;
      }
    }

    return result;
  } catch (error) {
    console.error('Error en updatePhotosVisibility:', error);
    throw error;
  }
};

/**
 * Elimina múltiples fotos por IDs
 * @param {Array} photoIds - Array de IDs de fotos a eliminar
 * @param {String} userId - ID del usuario que hace la solicitud
 * @returns {Promise<Object>} - Resultado con fotos eliminadas y errores
 */
exports.deleteMultiplePhotos = async (photoIds, userId) => {
  try {
    console.log(`Eliminando ${photoIds.length} fotos`);

    // Resultados
    const result = {
      deleted: [],
      errors: [],
      totalDeleted: 0,
      totalFailed: 0,
      s3Objects: {
        deleted: 0,
        errors: 0
      }
    };

    // Claves de S3 para eliminar en lote al final
    const s3Keys = [];

    // Para cada ID en el array, intentar eliminar
    for (const photoId of photoIds) {
      try {
        // Validar que el ID sea válido
        if (!mongoose.Types.ObjectId.isValid(photoId)) {
          result.errors.push({ id: photoId, error: 'ID no válido' });
          result.totalFailed++;
          continue;
        }

        // Buscar la foto
        const photo = await Photo.findById(photoId);

        // Verificar si la foto existe
        if (!photo) {
          result.errors.push({ id: photoId, error: 'Foto no encontrada' });
          result.totalFailed++;
          continue;
        }

        // Verificar permisos (solo el propietario o admin)
        if (photo.userId && photo.userId.toString() !== userId) {
          result.errors.push({ id: photoId, error: 'No tienes permiso para esta foto' });
          result.totalFailed++;
          continue;
        }

        // Recolectar URLs de S3 para eliminar después
        if (photo.originalUrl) {
          try {
            const url = new URL(photo.originalUrl);
            let key = url.pathname;
            if (key.startsWith('/')) key = key.substring(1);
            s3Keys.push(key);
          } catch (e) {
            console.error(`Error extrayendo clave de ${photo.originalUrl}:`, e);
          }
        }

        if (photo.thumbnailUrl) {
          try {
            const url = new URL(photo.thumbnailUrl);
            let key = url.pathname;
            if (key.startsWith('/')) key = key.substring(1);
            s3Keys.push(key);
          } catch (e) {
            console.error(`Error extrayendo clave de ${photo.thumbnailUrl}:`, e);
          }
        }

        // Eliminar foto de la BD
        await Photo.findByIdAndDelete(photoId);

        // Agregar a resultados exitosos
        result.deleted.push(photoId);
        result.totalDeleted++;
      } catch (error) {
        console.error(`Error eliminando foto ${photoId}:`, error);
        result.errors.push({ id: photoId, error: error.message });
        result.totalFailed++;
      }
    }

    // Eliminar archivos de S3 en lote
    if (s3Keys.length > 0) {
      try {
        const s3Result = await s3Service.deleteMultipleObjects(s3Keys);
        result.s3Objects.deleted = s3Result.Deleted?.length || 0;
        result.s3Objects.errors = s3Result.Errors?.length || 0;
      } catch (s3Error) {
        console.error('Error al eliminar objetos de S3:', s3Error);
        result.s3Objects.errors = s3Keys.length;
      }
    }

    return result;
  } catch (error) {
    console.error('Error en deleteMultiplePhotos:', error);
    throw error;
  }
};

// Función que probablemente existe para formatear las fotos para la respuesta
const formatPhotoResponse = (photo) => {
  // ... código existente ...

  // Asegurarnos que todas las fotos tengan el campo reviewed (incluso las antiguas)
  const formattedPhoto = {
    // ... propiedades existentes ...
    reviewed: photo.reviewed || false,
    // ... resto de propiedades existentes ...
  };

  return formattedPhoto;
  // ... código existente ...
}; 