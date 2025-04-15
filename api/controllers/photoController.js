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
const geocodingService = require('../services/geocodingService');

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

// Función auxiliar para procesar la foto subida
async function processUploadedPhoto(file) {
  // Ruta temporal del archivo
  const filePath = file.path;

  // Leer archivo
  const fileBuffer = fs.readFileSync(filePath);

  // Procesar imagen y subirla a S3
  const processedImage = await imageService.processImage(
    fileBuffer,
    file.originalname
  );

  // Verificar duplicados por hash si existe
  if (processedImage.fileHash) {
    console.log(`Hash de la imagen: ${processedImage.fileHash}`);
  }

  // Eliminar archivo temporal
  fs.unlinkSync(filePath);

  // Verificar y transformar coordenadas si existen
  if (processedImage.metadata && processedImage.metadata.coordinates) {
    console.log('Coordenadas encontradas en metadata:', processedImage.metadata.coordinates);

    // Si las coordenadas están en formato {lat, lon}
    if (processedImage.metadata.coordinates.lat !== undefined &&
      processedImage.metadata.coordinates.lon !== undefined) {

      // Convertir a formato [lon, lat] para MongoDB
      processedImage.metadata.coordinates = [
        processedImage.metadata.coordinates.lon,
        processedImage.metadata.coordinates.lat
      ];

      console.log('Coordenadas transformadas a formato GeoJSON:', processedImage.metadata.coordinates);
    }
  }

  return processedImage;
}

// Crear foto
exports.createPhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No se subió ningún archivo', 400));
    }

    console.log('Procesando archivo subido:', req.file.originalname);
    const processedImage = await processUploadedPhoto(req.file);
    console.log('Imagen procesada. Hash:', processedImage.fileHash);

    // Verificar si ya existe una foto con el mismo hash
    if (processedImage.fileHash) {
      console.log(`Verificando duplicados para hash: ${processedImage.fileHash}`);

      const existingPhoto = await Photo.findOne({
        fileHash: processedImage.fileHash,
        userId: req.user.id
      });

      if (existingPhoto) {
        console.log('¡Foto duplicada encontrada!', {
          existingPhotoId: existingPhoto._id,
          existingPhotoUrl: existingPhoto.thumbnailUrl
        });

        // Eliminar archivos temporales que se hayan subido a S3
        try {
          if (processedImage.originalUrl) {
            const originalKey = new URL(processedImage.originalUrl).pathname.substring(1);
            console.log('Eliminando archivo original duplicado:', originalKey);
            await s3Service.deleteObject(originalKey);
          }
          if (processedImage.thumbnailUrl) {
            const thumbnailKey = new URL(processedImage.thumbnailUrl).pathname.substring(1);
            console.log('Eliminando thumbnail duplicado:', thumbnailKey);
            await s3Service.deleteObject(thumbnailKey);
          }
        } catch (deleteError) {
          console.error('Error eliminando archivos duplicados de S3:', deleteError);
        }

        return next(new AppError('Ya tienes una foto idéntica en tu colección', 409, {
          existingPhotoId: existingPhoto._id,
          existingPhotoUrl: existingPhoto.thumbnailUrl
        }));
      } else {
        console.log('No se encontraron duplicados');
      }
    } else {
      console.warn('¡Advertencia! No se generó hash para la imagen');
    }

    // Preparar datos básicos de la foto sin el campo location
    const photoData = {
      userId: req.user.id,
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      originalUrl: processedImage.originalUrl,
      thumbnailUrl: processedImage.thumbnailUrl,
      timestamp: processedImage.metadata?.captureDate || null,
      hasValidTimestamp: !!processedImage.metadata?.captureDate,
      hasValidCoordinates: false,
      geocodingStatus: 'not_applicable',
      reviewed: false,
      isPublic: req.body.isPublic === 'true' || req.body.isPublic === true ? true : false,
      location: undefined, // Explícitamente definido como undefined
      fileHash: processedImage.fileHash // Guardamos el hash para futuras validaciones
    };

    // Procesar coordenadas EXIF si existen
    if (processedImage.metadata?.coordinates &&
      Array.isArray(processedImage.metadata.coordinates) &&
      processedImage.metadata.coordinates.length === 2 &&
      !isNaN(processedImage.metadata.coordinates[0]) &&
      !isNaN(processedImage.metadata.coordinates[1])) {

      console.log('¡Coordenadas válidas encontradas!', processedImage.metadata.coordinates);

      // Solo agregamos location si hay coordenadas válidas
      photoData.location = {
        type: 'Point',
        coordinates: processedImage.metadata.coordinates,
        name: null
      };
      photoData.hasValidCoordinates = true;
      photoData.geocodingStatus = 'pending';
    } else {
      console.log('No se encontraron coordenadas válidas en la imagen');
    }

    console.log('Datos de foto a guardar:', JSON.stringify(photoData, null, 2));

    // Eliminar el campo location si está indefinido
    if (photoData.location === undefined) {
      delete photoData.location;
    }

    const photo = await Photo.create(photoData);

    // Si tiene coordenadas válidas, encolar para geocoding
    if (photo.hasValidCoordinates) {
      await queuePhotoForGeocoding(photo._id);
    }

    return success(res, { photo });
  } catch (error) {
    console.error('Error al crear la foto:', error);
    return next(error);
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
    const { id } = req.params;
    const updateData = { ...req.body };

    // Si vienen coordenadas, procesarlas
    if (updateData.coordinates) {
      console.log('Procesando coordenadas:', updateData.coordinates);

      // Si las coordenadas vienen como array, convertirlas a string
      const coordString = Array.isArray(updateData.coordinates)
        ? updateData.coordinates.join(',')
        : updateData.coordinates;

      try {
        const parsedCoords = coordParser(coordString);
        if (parsedCoords) {
          // Crear un objeto location con formato GeoJSON
          updateData.location = {
            type: 'Point',
            coordinates: [parsedCoords.lon, parsedCoords.lat],
            name: null
          };
          updateData.hasValidCoordinates = true;
          updateData.geocodingStatus = 'pending';
          updateData.edited = true;

          // Eliminar coordenadas ya que se han procesado
          delete updateData.coordinates;
        }
      } catch (error) {
        console.error('Error al parsear coordenadas:', error);
        return next(new AppError('No se pudo interpretar las coordenadas: ' + error.message, 400));
      }
    }

    // Manejar actualización de fecha
    if (updateData.date) {
      const photo = await Photo.findById(id);
      if (!photo) {
        return next(new AppError('No se encontró la foto', 404));
      }

      // Usar el timestamp existente como base
      const currentDate = new Date(photo.timestamp);
      const [year, month, day] = updateData.date.split('-').map(Number);

      // Si viene hora, actualizarla
      if (updateData.time) {
        const [hours, minutes] = updateData.time.split(':').map(Number);
        currentDate.setHours(hours, minutes);
      }

      // Actualizar la fecha manteniendo la hora si no se especificó
      currentDate.setFullYear(year, month - 1, day);

      // Actualizar el timestamp
      updateData.timestamp = currentDate;
      // Marcar como válido ya que el usuario ingresó la fecha manualmente
      updateData.hasValidTimestamp = true;
      updateData.edited = true;

      // Limpiar los campos auxiliares
      delete updateData.date;
      delete updateData.time;
    }

    const photo = await Photo.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!photo) {
      return next(new AppError('No se encontró la foto', 404));
    }

    return success(res, { photo });
  } catch (error) {
    console.error('Error al actualizar la foto:', error);
    return next(error);
  }
};

/**
 * Actualiza la transformación CSS de una foto
 */
exports.updatePhotoCssTransform = async (req, res, next) => {
  try {
    const { cssTransform, edited } = req.body;

    // Si edited es false, eliminamos el cssTransform
    if (edited === false) {
      console.log('Eliminando transformación CSS');
      const photo = await photoService.updatePhoto(req.params.id, {
        cssTransform: undefined,
        edited: false
      }, req.user.id);

      return success(res, { photo });
    }

    // Si edited es true, debe venir con cssTransform
    if (edited === true && !cssTransform) {
      return next(new AppError('Si edited es true, se requiere proporcionar la transformación CSS', 400));
    }

    // Caso normal: recibimos cssTransform
    if (!cssTransform) {
      return next(new AppError('Se requiere proporcionar la transformación CSS', 400));
    }

    console.log('Actualizando transformación CSS:', cssTransform);

    // Validar estructura de cssTransform
    const validTransform = {
      rotation: typeof cssTransform.rotation === 'number' ? cssTransform.rotation : 0,
      scale: typeof cssTransform.scale === 'number' ? cssTransform.scale : 1,
      flipHorizontal: typeof cssTransform.flipHorizontal === 'number' ? cssTransform.flipHorizontal : 1,
      flipVertical: typeof cssTransform.flipVertical === 'number' ? cssTransform.flipVertical : 1
    };

    // Agregar crop solo si está presente y tiene todos los campos necesarios
    if (cssTransform.crop &&
      typeof cssTransform.crop.width === 'number' &&
      typeof cssTransform.crop.height === 'number' &&
      typeof cssTransform.crop.x === 'number' &&
      typeof cssTransform.crop.y === 'number') {

      // Validar que los valores estén en rangos razonables
      validTransform.crop = {
        x: Math.min(Math.max(cssTransform.crop.x, 0), 100), // Entre 0 y 100
        y: Math.min(Math.max(cssTransform.crop.y, 0), 100), // Entre 0 y 100
        width: Math.min(Math.max(cssTransform.crop.width, 1), 100), // Entre 1 y 100
        height: Math.min(Math.max(cssTransform.crop.height, 1), 100) // Entre 1 y 100
      };

      console.log('Aplicando crop:', validTransform.crop);
    }

    const photo = await photoService.updatePhoto(req.params.id, {
      cssTransform: validTransform,
      edited: true
    }, req.user.id);

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

    console.log(`Calculando estadísticas para: mes=${monthNum}, año=${yearNum}`);

    // Preparar el filtro de consulta
    const matchQuery = {
      isPublic: true, // Solo fotos públicas para el mapa
      userId: new mongoose.Types.ObjectId(req.user.id) // Siempre filtrar por el usuario logueado
    };

    // Query para obtener el conteo de fotos por día
    const results = await Photo.aggregate([
      {
        $match: matchQuery
      },
      {
        $addFields: {
          // Extraer fecha, mes y año directamente del timestamp
          photoDate: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$timestamp"
            }
          },
          photoMonth: { $month: "$timestamp" },
          photoYear: { $year: "$timestamp" }
        }
      },
      {
        $match: {
          photoMonth: monthNum,
          photoYear: yearNum
        }
      },
      {
        $group: {
          _id: "$photoDate",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
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

    // Obtener fecha (actual o de los parámetros)
    const today = new Date();
    let currentMonth = today.getMonth() + 1; // getMonth() retorna 0-11
    let currentDay = today.getDate();

    // Si se proporcionan ambos parámetros, validarlos y usarlos
    if (req.query.month && req.query.day) {
      const month = parseInt(req.query.month);
      const day = parseInt(req.query.day);

      // Validar mes
      if (isNaN(month) || month < 1 || month > 12) {
        return next(new AppError('El mes debe ser un número entre 1 y 12', 400));
      }

      // Validar día
      if (isNaN(day) || day < 1 || day > 31) {
        return next(new AppError('El día debe ser un número entre 1 y 31', 400));
      }

      // Validación más flexible para días en cada mes
      const maxDaysInMonth = {
        1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
        7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31
      };

      if (day > maxDaysInMonth[month]) {
        return next(new AppError(`El mes ${month} tiene máximo ${maxDaysInMonth[month]} días`, 400));
      }

      // Actualizar valores
      currentMonth = month;
      currentDay = day;
    }
    // Si se proporciona solo uno de los dos parámetros, error
    else if (req.query.month || req.query.day) {
      return next(new AppError('Debes proporcionar tanto el día como el mes, o ninguno para usar la fecha actual', 400));
    }

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

// Función auxiliar para encolar una foto para geocodificación
async function queuePhotoForGeocoding(photoId) {
  try {
    console.log(`Encolando foto para geocodificación: ${photoId}`);

    // Actualiza el estado de geocodificación a 'pending'
    await Photo.findByIdAndUpdate(photoId, {
      geocodingStatus: 'pending'
    });

    // Aquí podrías implementar una cola real (como Redis o Bull)
    // Por ahora simplemente programamos un timeout para procesar la foto
    setTimeout(async () => {
      try {
        await geocodingService.processPhotoGeocoding(photoId);
      } catch (error) {
        console.error(`Error al procesar geocodificación para foto ${photoId}:`, error);
      }
    }, 1000); // Espera 1 segundo antes de procesar

    return true;
  } catch (error) {
    console.error(`Error al encolar foto ${photoId} para geocodificación:`, error);
    return false;
  }
} 