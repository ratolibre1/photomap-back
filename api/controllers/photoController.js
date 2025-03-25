const multer = require('multer');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const photoService = require('../services/photoService');
const imageService = require('../services/imageService');
const path = require('path');
const fs = require('fs');
const s3Service = require('../services/s3Service');
const Photo = require('../models/Photo');
const AWS = require('aws-sdk');
const {
  AWS_BUCKET_NAME
} = require('../../config/env');
const coordParser = require('coord-parser');
const mongoose = require('mongoose');

// Configuración de multer para subida temporal
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = process.env.UPLOAD_TEMP_DIR || './uploads';
    // Crear directorio si no existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Filtro para permitir solo imágenes
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new AppError('Solo se permiten archivos de imagen', 400));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter
});

// Middleware para manejar la subida
exports.uploadPhoto = upload.single('photo');

// Crear foto
exports.createPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No se ha subido ninguna imagen', 400));
    }

    // Ruta temporal del archivo
    const filePath = req.file.path;

    // Leer archivo
    const fileBuffer = fs.readFileSync(filePath);

    // Procesar imagen y subirla a S3
    const processedImage = await imageService.processImage(
      fileBuffer,
      req.file.originalname
    );

    // Verificar duplicados por hash
    if (processedImage.fileHash) {
      const existingPhoto = await Photo.findOne({
        fileHash: processedImage.fileHash,
        userId: req.user.id  // Solo buscar entre las fotos del mismo usuario
      });

      if (existingPhoto) {
        // Eliminar archivo temporal
        fs.unlinkSync(filePath);

        // Si el cliente envió un parámetro para forzar la subida a pesar de duplicados
        if (req.body.forceDuplicate !== 'true') {
          return next(new AppError('Esta imagen ya fue subida anteriormente', 409, {
            duplicateId: existingPhoto._id
          }));
        }
        // Si forzó la subida, continuamos pero lo registramos
        console.log(`Subiendo duplicado forzado de foto ${existingPhoto._id}`);
      }
    }

    // Eliminar archivo temporal
    fs.unlinkSync(filePath);

    // Fecha predeterminada: 1 de enero de 2000
    const defaultDate = new Date(2000, 0, 1);

    // Usar fecha de EXIF si está disponible, o la predeterminada
    const timestamp = (processedImage.metadata && processedImage.metadata.captureDate)
      ? processedImage.metadata.captureDate
      : defaultDate;

    console.log('Usando timestamp:', timestamp);

    // Preparar datos para guardar en DB
    const photoData = {
      title: req.body.title || path.basename(req.file.originalname, path.extname(req.file.originalname)),
      description: req.body.description,
      originalUrl: processedImage.originalUrl,
      thumbnailUrl: processedImage.thumbnailUrl,
      metadata: processedImage.metadata,
      timestamp: timestamp, // Usar el timestamp determinado arriba
      labels: req.body.labels
        ? (Array.isArray(req.body.labels)
          ? req.body.labels
          : req.body.labels.split(','))
        : [],
      isPublic: req.body.isPublic !== undefined
        ? (typeof req.body.isPublic === 'string'
          ? req.body.isPublic.toLowerCase() === 'true'
          : Boolean(req.body.isPublic))
        : true,
      fileHash: processedImage.fileHash,
      userId: req.user.id  // Añadir el ID del usuario
    };

    // Manejo de ubicación - Solo usar datos EXIF
    if (processedImage.metadata && processedImage.metadata.coordinates &&
      Array.isArray(processedImage.metadata.coordinates) &&
      processedImage.metadata.coordinates.length === 2 &&
      !isNaN(processedImage.metadata.coordinates[0]) &&
      !isNaN(processedImage.metadata.coordinates[1])) {

      // Usar coordenadas de EXIF
      photoData.location = {
        type: 'Point',
        coordinates: processedImage.metadata.coordinates,
        name: null // Dejar el nombre como null
      };
      console.log('Usando coordenadas EXIF:', processedImage.metadata.coordinates);

    } else {
      // No hay coordenadas EXIF válidas, usar [0,0]
      photoData.location = {
        type: 'Point',
        coordinates: [0, 0],
        name: null
      };
      console.log('No se encontraron coordenadas EXIF, usando [0,0]');
    }

    // Guardar foto en DB
    const photo = await photoService.createPhoto(photoData, req.user.id);

    return success(res, { photo }, 201);
  } catch (err) {
    next(err);
  }
};

// Obtener foto por ID
exports.getPhotoById = async (req, res, next) => {
  try {
    // Verificar si hay usuario autenticado
    const userId = req.user ? req.user.id : null;
    const photo = await photoService.getPhotoById(req.params.id, userId);
    return success(res, { photo });
  } catch (err) {
    next(err);
  }
};

// Función auxiliar para parsear coordenadas DMS
function parseDMS(dmsString) {
  // Expresiones regulares para capturar formatos DMS
  const latRegex = /(\d+)°(\d+)'(\d+(\.\d+)?)\"([NS])/;
  const lngRegex = /(\d+)°(\d+)'(\d+(\.\d+)?)\"([EW])/;

  const latMatch = dmsString.match(latRegex);
  const lngMatch = dmsString.match(lngRegex);

  if (!latMatch || !lngMatch) {
    throw new Error('Formato de coordenadas DMS inválido');
  }

  // Convertir a decimales
  let lat = parseInt(latMatch[1]) + parseInt(latMatch[2]) / 60 + parseFloat(latMatch[3]) / 3600;
  if (latMatch[5] === 'S') lat = -lat;

  let lng = parseInt(lngMatch[1]) + parseInt(lngMatch[2]) / 60 + parseFloat(lngMatch[3]) / 3600;
  if (lngMatch[5] === 'W') lng = -lng;

  return { lat, lng };
}

// Parsear formato decimal simple (lat, lng)
function parseDecimalCoordinates(coordString) {
  // Limpiamos el string y buscamos dos números separados por coma
  const cleaned = coordString.replace(/\s+/g, '');
  const parts = cleaned.split(',');

  if (parts.length !== 2) {
    throw new Error('El formato decimal debe ser "latitud, longitud"');
  }

  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Los valores de latitud y longitud deben ser números');
  }

  return { lat, lng };
}

// Actualizar foto
exports.updatePhoto = async (req, res, next) => {
  try {
    // Primero obtener la foto actual
    const currentPhoto = await photoService.getPhotoById(req.params.id);

    // Preparar datos de actualización
    const updateData = {
      title: req.body.title,
      description: req.body.description,
      labels: req.body.labels
        ? (Array.isArray(req.body.labels)
          ? req.body.labels
          : req.body.labels.split(','))
        : undefined,
      isPublic: req.body.isPublic !== undefined
        ? (typeof req.body.isPublic === 'string'
          ? req.body.isPublic.toLowerCase() === 'true'
          : Boolean(req.body.isPublic))
        : undefined,
      reviewed: true
    };

    // Manejar actualización de coordenadas
    if (req.body.coordinates) {
      try {
        let parsedCoord;
        console.log('Procesando coordenadas:', req.body.coordinates);

        // Intentar determinar el formato y parsear
        if (req.body.coordinates.includes('°')) {
          // Formato DMS
          console.log('Detectado formato DMS');
          parsedCoord = parseDMS(req.body.coordinates);
        } else if (req.body.coordinates.includes(',')) {
          // Probable formato decimal lat,lng
          console.log('Detectado formato decimal');
          parsedCoord = parseDecimalCoordinates(req.body.coordinates);
        } else {
          // Intentar con coord-parser como fallback
          console.log('Intentando con coord-parser');
          parsedCoord = coordParser(req.body.coordinates);
        }

        console.log('Coordenadas parseadas:', parsedCoord);

        // Verificar que ambas coordenadas son válidas
        if (parsedCoord &&
          parsedCoord.lat !== undefined && parsedCoord.lng !== undefined &&
          !isNaN(parsedCoord.lat) && !isNaN(parsedCoord.lng)) {

          // El formato para MongoDB es [longitud, latitud]
          const coordinates = [parsedCoord.lng, parsedCoord.lat];

          console.log('Coordenadas finales para MongoDB:', coordinates);

          updateData.location = {
            type: 'Point',
            coordinates: coordinates
          };

          // Si también se proporciona un nombre de ubicación, incluirlo
          if (req.body.locationName) {
            updateData.location.name = req.body.locationName;
          } else if (currentPhoto.location && currentPhoto.location.name) {
            // Mantener el nombre actual si existe
            updateData.location.name = currentPhoto.location.name;
          }

          // Marcar para re-geocodificación
          updateData.geocodingStatus = 'pending';

          console.log('Actualizando coordenadas a:', coordinates);
        } else {
          console.log('Error en validación:', parsedCoord);
          return next(new AppError('No se pudieron extraer coordenadas completas del formato proporcionado', 400));
        }
      } catch (coordError) {
        console.log('Error al parsear coordenadas:', coordError);
        return next(new AppError(`No se pudo interpretar las coordenadas: ${coordError.message}`, 400));
      }
    }
    // Si se proporciona solo un nombre de ubicación, mantener las coordenadas existentes
    else if (req.body.locationName && currentPhoto.location) {
      updateData.location = {
        type: currentPhoto.location.type,
        coordinates: currentPhoto.location.coordinates,
        name: req.body.locationName
      };
      console.log('Actualizando nombre de ubicación a:', req.body.locationName);
    }

    const photo = await photoService.updatePhoto(req.params.id, updateData, req.user.id);

    return success(res, { photo });
  } catch (err) {
    next(err);
  }
};

// Eliminar foto
exports.deletePhoto = async (req, res, next) => {
  try {
    await photoService.deletePhoto(
      req.params.id,
      req.user.id,
      req.user.role
    );
    return success(res, { message: 'Foto eliminada correctamente' });
  } catch (err) {
    next(err);
  }
};

/**
 * Elimina todas las fotos de un usuario (BD y S3)
 * @route DELETE /api/photos/all
 * @access Privado
 */
exports.deleteAllPhotos = async (req, res, next) => {
  console.log('==== INICIANDO deleteAllPhotos ====');
  console.log('req.user:', req.user);

  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(new AppError('Usuario no autenticado', 401));
    }

    console.log(`Eliminando todas las fotos del usuario ${userId}...`);

    // 1. Obtener todas las fotos del usuario
    // Modificamos la consulta para incluir fotos sin userId si se especifica
    const includeOrphanPhotos = req.query.includeOrphans === 'true';

    let query;
    if (includeOrphanPhotos) {
      // Eliminar fotos del usuario Y fotos sin userId
      query = { $or: [{ userId }, { userId: { $exists: false } }, { userId: null }] };
      console.log('Incluyendo fotos huérfanas (sin userId)');
    } else {
      // Solo eliminar fotos del usuario
      query = { userId };
    }

    const photos = await Photo.find(query);
    console.log(`Se encontraron ${photos.length} fotos para eliminar`);

    if (photos.length === 0) {
      return success(res, { message: 'No hay fotos para eliminar', deletedCount: 0 });
    }

    // 2. Preparar claves para eliminación por lotes en S3
    const s3Keys = [];
    console.log('Extrayendo claves S3 de fotos...');

    photos.forEach(photo => {
      console.log(`Procesando foto ${photo._id}, userId: ${photo.userId || 'ninguno'}`);

      // Clave de la imagen original desde s3Key si existe
      if (photo.s3Key) {
        console.log(`Usando s3Key directo: ${photo.s3Key}`);
        s3Keys.push(photo.s3Key);
      }
      // Si no hay s3Key, intentar extraer de la URL
      else if (photo.originalUrl || photo.s3Url) {
        const originalUrl = photo.originalUrl || photo.s3Url;
        console.log(`Extrayendo de URL: ${originalUrl}`);

        try {
          // Extraer clave de la URL
          const url = new URL(originalUrl);
          let key = url.pathname;

          // Quitar "/" inicial si existe
          if (key.startsWith('/')) {
            key = key.substring(1);
          }

          // En URL de AWS, si contiene el nombre del bucket, removerlo
          const bucketName = AWS_BUCKET_NAME;
          if (key.startsWith(bucketName + '/')) {
            key = key.substring(bucketName.length + 1);
          }

          console.log(`Clave extraída: ${key}`);
          if (key) s3Keys.push(key);
        } catch (urlError) {
          console.error(`Error extrayendo clave de ${originalUrl}:`, urlError);
        }
      }

      // Miniatura - proceso similar
      if (photo.thumbnailUrl) {
        console.log(`Extrayendo de thumbnailUrl: ${photo.thumbnailUrl}`);

        try {
          const url = new URL(photo.thumbnailUrl);
          let key = url.pathname;

          if (key.startsWith('/')) {
            key = key.substring(1);
          }

          const bucketName = AWS_BUCKET_NAME;
          if (key.startsWith(bucketName + '/')) {
            key = key.substring(bucketName.length + 1);
          }

          console.log(`Clave thumbnail: ${key}`);
          if (key) s3Keys.push(key);
        } catch (urlError) {
          console.error(`Error extrayendo clave de ${photo.thumbnailUrl}:`, urlError);
        }
      }
    });

    console.log(`Se eliminarán ${s3Keys.length} objetos de S3`);

    // 3. Eliminar objetos de S3 en lotes
    let s3Result = { Deleted: [], Errors: [] };
    if (s3Keys.length > 0) {
      try {
        s3Result = await s3Service.deleteMultipleObjects(s3Keys);
      } catch (s3Error) {
        console.error('Error al eliminar objetos de S3:', s3Error);
      }
    }

    // 4. Eliminar todas las fotos de la BD
    const deleteResult = await Photo.deleteMany(query);

    return success(res, {
      message: `Se han eliminado ${deleteResult.deletedCount} fotos`,
      deletedCount: deleteResult.deletedCount,
      s3Objects: {
        deleted: s3Result.Deleted?.length || 0,
        errors: s3Result.Errors?.length || 0,
        errorDetails: s3Result.Errors?.length > 0 ? s3Result.Errors : undefined
      }
    });

  } catch (error) {
    console.error('Error al eliminar todas las fotos:', error);
    return next(new AppError(`No se pudieron eliminar las fotos: ${error.message}`, 500));
  }
};

/**
 * Actualiza la visibilidad de múltiples fotos
 */
exports.updateBatchVisibility = async (req, res, next) => {
  try {
    const { photoIds, isPublic } = req.body;
    const userId = req.user._id;

    // Validar parámetros
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return next(new AppError('Se requiere un array de IDs de fotos', 400));
    }

    if (isPublic === undefined) {
      return next(new AppError('Se requiere especificar el valor de isPublic', 400));
    }

    // Convertir a booleano explícito si viene como string
    const isPublicBool = typeof isPublic === 'string'
      ? isPublic.toLowerCase() === 'true'
      : Boolean(isPublic);

    const result = await photoService.updatePhotosVisibility(photoIds, isPublicBool, userId);

    return success(res, {
      message: `Se actualizaron ${result.totalUpdated} fotos a modo ${isPublicBool ? 'público' : 'privado'}, fallaron ${result.totalFailed}`,
      result
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Elimina múltiples fotos por sus IDs
 */
exports.deleteBatchPhotos = async (req, res, next) => {
  try {
    const { photoIds } = req.body;
    const userId = req.user._id;

    // Validar parámetros
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return next(new AppError('Se requiere un array de IDs de fotos', 400));
    }

    const result = await photoService.deleteMultiplePhotos(photoIds, userId);

    return success(res, {
      message: `Se eliminaron ${result.totalDeleted} fotos, fallaron ${result.totalFailed}`,
      result
    });
  } catch (error) {
    return next(error);
  }
};

// Busca fotos con filtros
exports.searchPhotos = async (req, res, next) => {
  try {
    console.log('Recibido en /photos/search:', req.body);
    // Todos los parámetros ahora vienen en el body
    const filters = {
      labels: req.body.labels || null,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      userId: req.body.userId,
      countryId: req.body.countryId,
      regionId: req.body.regionId,
      countyId: req.body.countyId,
      cityId: req.body.cityId,
      searchText: req.body.search || req.body.q || null,
      isPublic: req.body.isPublic !== undefined
        ? Boolean(req.body.isPublic)
        : undefined
    };

    // Filtro por ubicación
    if (req.body.lat && req.body.lng && req.body.distance) {
      filters.near = {
        lat: parseFloat(req.body.lat),
        lng: parseFloat(req.body.lng),
        distance: parseInt(req.body.distance, 10)
      };
    }

    // Opciones de paginación y ordenación
    const options = {
      page: parseInt(req.body.page, 10) || 1,
      limit: parseInt(req.body.limit, 10) || 20,
      sortBy: req.body.sortBy || 'timestamp',
      sortDirection: req.body.sortDirection || 'desc'
    };

    console.log('Filtros para búsqueda:', filters);
    const result = await photoService.searchPhotos(filters, options, req.user);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * Obtiene estadísticas de fotos por día para un mes y el siguiente
 */
exports.getPhotoCalendarStats = async (req, res, next) => {
  try {
    const { month, year } = req.query;

    // Validar parámetros
    if (!month || !year) {
      return next(new AppError('Debes proporcionar mes y año', 400));
    }

    // Convertir a números
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);

    // Validar rango de valores
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return next(new AppError('El mes debe ser un número entre 1 y 12', 400));
    }

    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return next(new AppError('El año debe ser un número válido', 400));
    }

    // Calcular fecha de inicio (primer día del mes especificado)
    const startDate = new Date(yearNum, monthNum - 1, 1);

    // Calcular fecha de fin (último día del mes siguiente)
    const endDate = new Date(yearNum, monthNum + 1, 0); // +1 mes, día 0 = último día del mes anterior
    endDate.setHours(23, 59, 59, 999);

    console.log('Rango de fechas:', startDate, 'a', endDate);

    // Preparar el filtro de consulta
    const matchQuery = {
      timestamp: { $gte: startDate, $lte: endDate }
    };

    // Si el usuario no es admin, solo ver sus propias fotos
    if (req.user && req.user.role !== 'admin') {
      matchQuery.userId = mongoose.Types.ObjectId(req.user.id);
    }

    // Query para obtener el conteo de fotos por día
    const results = await Photo.aggregate([
      {
        $match: matchQuery
      },
      {
        $group: {
          _id: {
            year: { $year: "$timestamp" },
            month: { $month: "$timestamp" },
            day: { $dayOfMonth: "$timestamp" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                  day: "$_id.day"
                }
              }
            }
          },
          count: 1
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);

    console.log('Resultados de estadísticas del calendario:', results);
    return success(res, { calendar: results });
  } catch (error) {
    console.error('Error al obtener estadísticas del calendario:', error);
    return next(error);
  }
};

/**
 * Obtiene fotos tomadas "Un día como hoy" en años anteriores
 * agrupadas por año
 */
exports.getOnThisDayPhotos = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Obtener fecha actual
    const today = new Date();
    const currentMonth = today.getMonth() + 1; // getMonth() retorna 0-11
    const currentDay = today.getDate();
    const currentYear = today.getFullYear();

    console.log(`Buscando fotos para día ${currentDay} y mes ${currentMonth} (años anteriores a ${currentYear})`);

    // Buscar fotos del mismo día y mes en años anteriores
    const photos = await Photo.aggregate([
      // Filtrar por usuario
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },

      // Extraer campos de fecha de timestamp (o fecha de la foto)
      {
        $addFields: {
          photoDay: { $dayOfMonth: "$timestamp" },
          photoMonth: { $month: "$timestamp" },
          photoYear: { $year: "$timestamp" }
        }
      },

      // Filtrar solo por fotos del mismo día y mes, pero años anteriores
      {
        $match: {
          photoDay: currentDay,
          photoMonth: currentMonth,
          photoYear: { $lt: currentYear } // Solo años anteriores
        }
      },

      // Ordenar por año (más reciente primero)
      { $sort: { photoYear: -1 } },

      // Agrupar por año
      {
        $group: {
          _id: "$photoYear",
          photos: {
            $push: {
              _id: "$_id",
              title: "$title",
              description: "$description",
              filename: "$filename",
              thumbnailUrl: "$thumbnailUrl",
              originalUrl: "$originalUrl",
              timestamp: "$timestamp",
              location: "$location",
              isPublic: "$isPublic",
              geocodingDetails: "$geocodingDetails"
            }
          },
          count: { $sum: 1 }
        }
      },

      // Formatear resultado final
      {
        $project: {
          year: "$_id",
          photos: 1,
          count: 1,
          _id: 0
        }
      },

      // Ordenar por año descendente
      { $sort: { year: -1 } }
    ]);

    // Si no hay fotos para este día
    if (photos.length === 0) {
      return success(res, {
        message: `No tienes fotos tomadas un ${currentDay} de ${getMonthName(currentMonth)} en años anteriores`,
        memories: []
      });
    }

    return success(res, {
      date: `${currentDay} de ${getMonthName(currentMonth)}`,
      memories: photos
    });
  } catch (error) {
    console.error('Error al obtener fotos de "Un día como hoy":', error);
    next(error);
  }
};

// Función auxiliar para obtener el nombre del mes
function getMonthName(month) {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  return months[month - 1]; // Ajustar porque los meses en JS van de 0-11
} 