const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const unzipper = require('unzip-stream');
const exifr = require('exifr');
const s3Service = require('../services/s3Service');
const photoService = require('../services/photoService');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const os = require('os');
const sharp = require('sharp');

/**
 * Procesa un archivo ZIP que contiene fotos
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Middleware siguiente
 */
exports.processPhotoZip = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No se ha subido ningún archivo', 400));
    }

    const zipPath = req.file.path;
    const extractPath = path.join(os.tmpdir(), `photos-${Date.now()}`);

    // Obtener el flag de visibilidad pública (default: false)
    const isPublic = req.body.isPublic === 'true' || req.body.isPublic === true;
    console.log(`Procesando ZIP con visibilidad pública: ${isPublic}`);

    // Crear directorio temporal si no existe
    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath, { recursive: true });
    }

    console.log('Iniciando procesamiento de ZIP con fotos');
    console.log('Información del archivo:', req.file);

    // Estadísticas a devolver
    const stats = {
      processed: 0,
      withLocation: 0,
      withoutLocation: 0,
      withTimestamp: 0,
      withoutTimestamp: 0,
      isPublic: isPublic,
      errors: 0,
      photos: []
    };

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
      return next(new AppError(`Error al extraer el archivo ZIP: ${extractError.message}`, 500));
    }

    // Buscar archivos de imágenes recursivamente
    const imageFiles = findImageFiles(extractPath);
    console.log(`Se encontraron ${imageFiles.length} archivos de imagen`);

    // Procesar cada imagen
    for (const imagePath of imageFiles) {
      try {
        console.log(`Procesando: ${imagePath}`);

        // Leer la imagen
        const imageBuffer = fs.readFileSync(imagePath);

        // Extraer metadatos EXIF
        let exifData = {};
        try {
          exifData = await exifr.parse(imageBuffer, {
            gps: true,
            exif: true,
            iptc: true,
            xmp: true
          });

          console.log('Metadatos EXIF extraídos:', {
            hasDate: !!exifData.DateTimeOriginal,
            dateType: exifData.DateTimeOriginal ? typeof exifData.DateTimeOriginal : 'none',
            hasGPS: !!(exifData.latitude && exifData.longitude)
          });
        } catch (exifErr) {
          console.warn(`Error al extraer EXIF: ${exifErr.message}`);
        }

        // Redimensionar imágenes
        let optimizedBuffer, thumbnailBuffer;

        try {
          // Versión optimizada (máximo 1800px en su dimensión más grande)
          optimizedBuffer = await sharp(imageBuffer)
            .rotate() // Auto-rotar según EXIF
            .resize({
              width: 1800,
              height: 1800,
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 85 })
            .toBuffer();

          // Miniatura (300px)
          thumbnailBuffer = await sharp(imageBuffer)
            .rotate()
            .resize({
              width: 300,
              height: 300,
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 75 })
            .toBuffer();

        } catch (sharpErr) {
          console.error(`Error procesando imagen con Sharp: ${sharpErr.message}`);
          // Fallback: usar buffer original
          optimizedBuffer = imageBuffer;
          thumbnailBuffer = imageBuffer;
        }

        // Subir a S3
        const fileName = path.basename(imagePath);
        const userId = req.user?.id;
        const s3Key = `users/${userId}/photos/zip-${Date.now()}-${fileName}`;
        const thumbnailKey = `users/${userId}/photos/thumbnails/zip-${Date.now()}-${fileName}`;

        const uploadResult = await s3Service.uploadBuffer({
          Buffer: optimizedBuffer,
          Key: s3Key,
          ContentType: 'image/jpeg'
        });

        const thumbnailResult = await s3Service.uploadBuffer({
          Buffer: thumbnailBuffer,
          Key: thumbnailKey,
          ContentType: 'image/jpeg'
        });

        // Preparar datos para BD
        const photoData = {
          userId: userId,
          title: fileName,
          description: '',
          s3Key: uploadResult.Key,
          s3Url: uploadResult.Location,
          timestamp: null, // Lo estableceremos después de validar
          thumbnailUrl: thumbnailResult.Location,
          originalUrl: uploadResult.Location,
          source: 'zip_upload',
          isPublic: isPublic,
          metadata: {
            width: exifData.ImageWidth,
            height: exifData.ImageHeight,
            creationTime: exifData.DateTimeOriginal,
            camera: exifData.Make ? `${exifData.Make} ${exifData.Model}`.trim() : undefined,
            lens: exifData.LensModel,
            aperture: exifData.FNumber ? `f/${exifData.FNumber}` : undefined,
            shutterSpeed: exifData.ExposureTime ? `${exifData.ExposureTime}s` : undefined,
            iso: exifData.ISO,
            fileSize: imageBuffer.length,
            fileType: 'image/jpeg'
          }
        };

        // Procesar el timestamp
        let timestamp = null;

        // Primero intentar con EXIF DateTimeOriginal
        if (exifData.DateTimeOriginal) {
          console.log('Usando fecha de EXIF:', exifData.DateTimeOriginal);
          timestamp = exifData.DateTimeOriginal;
        }
        // Usar la fecha del nombre del archivo si parece tener formato de fecha
        else if (fileName.match(/\d{8}/) || fileName.match(/\d{4}[-_]\d{2}[-_]\d{2}/)) {
          console.log('Intentando extraer fecha del nombre del archivo:', fileName);
          try {
            // Extraer partes de fecha de nombres como IMG_20200326_181917.jpg
            const dateMatch = fileName.match(/(\d{4})(\d{2})(\d{2})/);
            if (dateMatch) {
              const [_, year, month, day] = dateMatch;
              // Extraer hora si existe
              const timeMatch = fileName.match(/(\d{2})(\d{2})(\d{2})/g);
              let hours = 0, minutes = 0, seconds = 0;

              if (timeMatch && timeMatch.length > 1) {
                // Si hay al menos 2 coincidencias, la segunda podría ser la hora
                const timeParts = timeMatch[1];
                hours = parseInt(timeParts.substring(0, 2), 10);
                minutes = parseInt(timeParts.substring(2, 4), 10);
                seconds = parseInt(timeParts.substring(4, 6), 10);
              }

              timestamp = new Date(year, month - 1, day, hours, minutes, seconds);
              console.log('Fecha extraída del nombre:', timestamp);
            }
          } catch (dateErr) {
            console.warn('Error extrayendo fecha del nombre:', dateErr.message);
          }
        }

        // Última opción: usar la fecha actual
        if (!timestamp || isNaN(timestamp.getTime())) {
          console.log('Usando fecha actual como fallback');
          timestamp = new Date();
        }

        photoData.timestamp = timestamp;

        // Agregar ubicación si existe en EXIF
        if (exifData && typeof exifData.latitude === 'number' && typeof exifData.longitude === 'number') {
          photoData.location = {
            type: 'Point',
            coordinates: [exifData.longitude, exifData.latitude]
          };
          stats.withLocation++;
        } else {
          stats.withoutLocation++;
        }

        // Actualizar estadísticas de timestamp
        if (photoData.timestamp && photoData.timestamp instanceof Date && !isNaN(photoData.timestamp.getTime())) {
          stats.withTimestamp++;
        } else {
          stats.withoutTimestamp++;
        }

        // Guardar en BD
        console.log(`Guardando en BD: ${photoData.title}`);
        const photo = await photoService.createPhoto(photoData, photoData.userId);

        stats.processed++;
        stats.photos.push({
          id: photo.id,
          title: photoData.title,
          hasLocation: !!photoData.location,
          hasTimestamp: !!(photoData.timestamp && photoData.timestamp instanceof Date && !isNaN(photoData.timestamp.getTime()))
        });

      } catch (photoErr) {
        console.error(`Error procesando foto: ${photoErr.message}`);
        stats.errors++;
      }
    }

    // Limpiar archivos temporales
    try {
      fs.unlinkSync(zipPath); // Eliminar ZIP original
      fs.rmSync(extractPath, { recursive: true, force: true }); // Eliminar directorio temporal
    } catch (cleanupErr) {
      console.warn(`Error al limpiar archivos temporales: ${cleanupErr.message}`);
    }

    return success(res, {
      message: `Procesamiento de ZIP completado. Se procesaron ${stats.processed} fotos.`,
      stats
    });

  } catch (error) {
    console.error('Error general en procesamiento de ZIP:', error);
    return next(new AppError(`Error al procesar ZIP: ${error.message}`, 500));
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