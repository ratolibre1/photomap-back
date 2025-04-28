const fs = require('fs');
const path = require('path');
const unzipper = require('unzip-stream');
const photoProcessingService = require('../services/photoProcessingService');
const uploadService = require('../services/uploadService');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const os = require('os');

/**
 * Procesa un archivo ZIP que contiene fotos
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Middleware siguiente
 * 
 * @description
 * Acepta los siguientes parámetros:
 * - req.file: Archivo ZIP con fotos
 * - req.body.isPublic: 'true' para hacer todas las fotos públicas, 'false' o ausente para privadas
 * - req.body.labels: Array o string separado por comas con IDs de etiquetas a aplicar a todas las fotos
 * 
 * @returns {Object} Objeto con estadísticas del proceso
 */
exports.processPhotoZip = async (req, res, next) => {
  let uploadRecord = null;

  try {
    if (!req.file) {
      return next(new AppError('No se ha subido ningún archivo', 400));
    }

    console.log('Procesando ZIP con nombre:', req.file.originalname, 'tamaño:', req.file.size);
    const zipPath = req.file.path;
    const extractPath = path.join(os.tmpdir(), `photos-${Date.now()}`);

    // Crear registro de upload en BD
    uploadRecord = await uploadService.createUploadRecord({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      uploadType: 'zip'
    }, req.user.id);

    console.log(`Creado registro de upload con ID: ${uploadRecord._id}`);

    // Obtener el flag de visibilidad pública (default: false)
    const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
    console.log(`Procesando ZIP con visibilidad pública: ${isPublic}`);

    // Crear directorio temporal si no existe
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    console.log('Iniciando procesamiento de ZIP con fotos');
    console.log('Información del archivo:', req.file);

    // Extraer el ZIP
    const readStream = fs.createReadStream(zipPath);
    const extractionPromise = new Promise((resolve, reject) => {
      console.log('Iniciando extracción del ZIP...');
      readStream
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('error', (err) => {
          console.error('Error durante extracción:', err);
          reject(err);
        })
        .on('close', () => {
          console.log('Extracción completada correctamente');
          resolve();
        });
    });

    try {
      await extractionPromise;
    } catch (extractError) {
      console.error('Error en extracción:', extractError);
      // Marcar upload como fallido
      if (uploadRecord) {
        await uploadService.failUpload(uploadRecord._id, `Error al extraer ZIP: ${extractError.message}`);
      }

      // Intentar limpiar recursos antes de devolver error
      try {
        if (fs.existsSync(zipPath)) {
          fs.unlinkSync(zipPath);
        }
        if (fs.existsSync(extractPath)) {
          fs.rmSync(extractPath, { recursive: true, force: true });
        }
      } catch (cleanupErr) {
        console.warn('Error al limpiar recursos temporales:', cleanupErr);
      }
      return next(new AppError(`Error al extraer el archivo ZIP: ${extractError.message}`, 500));
    }

    // Buscar archivos de imágenes recursivamente
    const imageFiles = findImageFiles(extractPath);
    console.log(`Se encontraron ${imageFiles.length} archivos de imagen`);

    // Si no hay imágenes, devolver error
    if (imageFiles.length === 0) {
      // Marcar upload como fallido
      if (uploadRecord) {
        await uploadService.failUpload(uploadRecord._id, 'El archivo ZIP no contiene imágenes válidas');
      }

      // Limpiar recursos
      try {
        fs.unlinkSync(zipPath);
        fs.rmSync(extractPath, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Error al limpiar recursos temporales:', cleanupErr);
      }
      return next(new AppError('El archivo ZIP no contiene imágenes válidas', 400));
    }

    // Preparar array de infos para el procesamiento
    const photoInfos = [];

    // Leer cada imagen y preparar para procesamiento
    for (const imagePath of imageFiles) {
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const fileName = path.basename(imagePath);

        photoInfos.push({
          buffer: imageBuffer,
          fileName: fileName,
          options: {
            isPublic: isPublic,
            labels: req.body.labels // Pasamos etiquetas si hay
          }
        });
      } catch (readError) {
        console.error(`Error leyendo archivo ${imagePath}:`, readError);
      }
    }

    console.log(`Preparadas ${photoInfos.length} fotos para procesar`);

    // Procesar todas las fotos con el servicio compartido
    const results = await photoProcessingService.processMultiplePhotos(photoInfos, req.user?.id);

    console.log(`Procesamiento ZIP completado. Stats:`, JSON.stringify({
      processed: results.stats.processed,
      duplicates: results.stats.duplicates,
      errors: results.stats.errors,
      totalPhotos: photoInfos.length
    }));

    // Limpiar archivos temporales
    try {
      fs.unlinkSync(zipPath); // Eliminar ZIP original
      fs.rmSync(extractPath, { recursive: true, force: true }); // Eliminar directorio temporal
    } catch (cleanupErr) {
      console.warn(`Error al limpiar archivos temporales: ${cleanupErr.message}`);
      // Continuamos a pesar del error en la limpieza
    }

    // Preparar información para actualizar el registro de upload
    const photoDetails = [];
    if (results.stats.photos && results.stats.photos.length > 0) {
      for (const photo of results.stats.photos) {
        const photoDetail = {
          fileName: photo.title || photo.fileName,
          status: photo.duplicate ? 'duplicate' : (photo.error ? 'error' : 'processed'),
          errorMessage: photo.error || null
        };

        // Agregar ID solo si fue procesada correctamente o es duplicada
        if (photo.id) {
          photoDetail.photoId = photo.id;
        }

        photoDetails.push(photoDetail);
      }
    }

    // Asegurar que las estadísticas tengan todos los campos necesarios
    if (!results.stats.withLocation) results.stats.withLocation = 0;
    if (!results.stats.withoutLocation) results.stats.withoutLocation = 0;
    if (!results.stats.withTimestamp) results.stats.withTimestamp = 0;
    if (!results.stats.withoutTimestamp) results.stats.withoutTimestamp = 0;

    // Actualizar registro de upload como completado
    if (uploadRecord) {
      await uploadService.completeUpload(uploadRecord._id, results.stats, photoDetails);
    }

    // Detectar si todas son duplicadas
    if (results.stats.duplicates > 0 && results.stats.processed === 0) {
      if (results.stats.duplicates === photoInfos.length) {
        // Si TODAS son duplicadas, modificamos el mensaje y aseguramos un status 200
        return success(res, {
          message: `¡Todas las fotos (${results.stats.duplicates}) ya existen en tu colección!`,
          allDuplicates: true,
          stats: results.stats,
          uploadId: uploadRecord?._id
        });
      } else if (results.stats.errors > 0) {
        // Si hay algunas duplicadas y algunos errores
        results.message = `Se encontraron ${results.stats.duplicates} fotos duplicadas y hubo ${results.stats.errors} errores en el procesamiento.`;
      } else {
        // Solo duplicadas sin errores (caso poco probable pero posible)
        results.message = `Se encontraron ${results.stats.duplicates} fotos duplicadas.`;
      }
    }

    return success(res, {
      message: results.message,
      stats: results.stats,
      uploadId: uploadRecord?._id
    });

  } catch (error) {
    console.error('Error general en procesamiento de ZIP:', error);

    // Marcar upload como fallido
    if (uploadRecord) {
      await uploadService.failUpload(uploadRecord._id, `Error al procesar ZIP: ${error.message}`);
    }

    // Intentar limpieza en caso de error
    try {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      // Limpiar directorio temporal si existe
      const extractPath = path.join(os.tmpdir(), `photos-${Date.now()}`);
      if (fs.existsSync(extractPath)) {
        fs.rmSync(extractPath, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error('Error durante limpieza de emergencia:', cleanupError);
    }
    return next(new AppError(`Error al procesar ZIP: ${error.message}`, 500));
  }
};

/**
 * Obtiene el historial de cargas del usuario
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Middleware siguiente
 */
exports.getUploadHistory = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const history = await uploadService.getUserUploads(req.user.id, {
      page,
      limit
    });

    return success(res, history);
  } catch (error) {
    console.error('Error al obtener historial de cargas:', error);
    return next(error);
  }
};

/**
 * Obtiene detalles de una carga específica
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Middleware siguiente
 */
exports.getUploadDetails = async (req, res, next) => {
  try {
    const uploadId = req.params.id;

    if (!uploadId) {
      return next(new AppError('ID de carga no proporcionado', 400));
    }

    const upload = await uploadService.getUploadById(uploadId, req.user.id);

    return success(res, { upload });
  } catch (error) {
    console.error('Error al obtener detalles de carga:', error);
    return next(error);
  }
};

/**
 * Busca archivos de imágenes en un directorio recursivamente
 * @param {string} dir - Directorio a buscar
 * @returns {Array} - Array con rutas de imágenes
 */
function findImageFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat && stat.isDirectory()) {
      // Buscar recursivamente en subdirectorios
      results = results.concat(findImageFiles(filePath));
    } else {
      // Verificar si es un archivo de imagen
      if (/\.(jpg|jpeg|png)$/i.test(file) && !file.includes('thumbnail')) {
        results.push(filePath);
      }
    }
  });

  return results;
} 