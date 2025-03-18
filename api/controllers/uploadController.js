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
 * Procesa un archivo ZIP de Google Takeout
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Middleware siguiente
 */
exports.processTakeoutZip = async (req, res, next) => {
  try {
    if (!req.file) {
      return next(new AppError('No se ha subido ningún archivo', 400));
    }

    const zipPath = req.file.path;
    const extractPath = path.join(os.tmpdir(), `takeout-${Date.now()}`);

    // Crear directorio temporal si no existe
    if (!fs.existsSync(path.join(__dirname, '../../temp'))) {
      fs.mkdirSync(path.join(__dirname, '../../temp'));
    }

    if (!fs.existsSync(extractPath)) {
      fs.mkdirSync(extractPath);
    }

    console.log('### INICIO processTakeoutZip ###');
    console.log('Información del archivo:', req.file);

    // Estadísticas a devolver
    const stats = {
      processed: 0,
      withLocation: 0,
      withoutLocation: 0,
      errors: 0,
      photos: []
    };

    // Antes de la extracción
    console.log('### INICIO EXTRACCIÓN ###');
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Extraer el ZIP
    const readStream = fs.createReadStream(zipPath);
    const extractionPromise = new Promise((resolve, reject) => {
      console.log('Iniciando stream de extracción...');
      readStream
        .pipe(unzipper.Extract({ path: extractPath }))
        .on('error', (err) => {
          console.error('ERROR DURANTE EXTRACCIÓN:', err);
          reject(err);
        })
        .on('entry', (entry) => {
          console.log('Extrayendo archivo:', entry.path);
        })
        .on('close', () => {
          console.log('### EXTRACCIÓN COMPLETADA CORRECTAMENTE ###');
          resolve();
        });
    });

    try {
      await extractionPromise;
      console.log('Promesa de extracción resuelta');
    } catch (extractError) {
      console.error('ERROR EN EXTRACCIÓN:', extractError);
      return next(new AppError(`Error al extraer el archivo ZIP: ${extractError.message}`, 500));
    }

    // Después de la extracción
    console.log('### BUSQUEDA DE ARCHIVOS ###');

    // Buscar archivos de imágenes recursivamente
    const imageFiles = findImageFiles(extractPath);
    console.log(`Se encontraron ${imageFiles.length} archivos de imagen`);

    // Procesar cada imagen
    for (const imagePath of imageFiles) {
      try {
        console.log(`Procesando: ${imagePath}`);

        // Buscar el archivo JSON asociado (si existe)
        const jsonPath = imagePath.replace(/\.(jpg|jpeg|png)$/i, '.json');
        let googleMetadata = {};

        if (fs.existsSync(jsonPath)) {
          try {
            googleMetadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            console.log('Metadatos de Google encontrados');
          } catch (jsonErr) {
            console.warn(`Error al leer archivo JSON: ${jsonErr.message}`);
          }
        }

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
        } catch (exifErr) {
          console.warn(`Error al extraer EXIF: ${exifErr.message}`);
        }

        // NUEVO: Redimensionar imágenes
        let optimizedBuffer, thumbnailBuffer;

        try {
          // 1. Versión optimizada (máximo 1800px en su dimensión más grande, manteniendo proporción)
          optimizedBuffer = await sharp(imageBuffer)
            .rotate() // Auto-rotar según EXIF
            .resize({
              width: 1800,
              height: 1800,
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 85 }) // Buena calidad pero optimizada
            .toBuffer();

          console.log(`Imagen optimizada: ${imageBuffer.length} bytes -> ${optimizedBuffer.length} bytes`);

          // 2. Miniatura (300px de ancho, manteniendo proporción)
          thumbnailBuffer = await sharp(imageBuffer)
            .rotate() // Auto-rotar según EXIF
            .resize({
              width: 300,
              height: 300,
              fit: 'inside',
              withoutEnlargement: true
            })
            .jpeg({ quality: 75 }) // Calidad suficiente para miniatura
            .toBuffer();

          console.log(`Miniatura generada: ${thumbnailBuffer.length} bytes`);
        } catch (sharpErr) {
          console.error(`Error procesando imagen con Sharp: ${sharpErr.message}`);
          // Fallback: usar buffer original si hay error
          optimizedBuffer = imageBuffer;
          thumbnailBuffer = imageBuffer;
        }

        // Subir a S3 la versión optimizada
        const fileName = path.basename(imagePath);
        const userId = req.user?.id;
        const s3Key = `users/${userId}/photos/takeout-${Date.now()}-${fileName}`;

        const uploadResult = await s3Service.uploadBuffer({
          Buffer: optimizedBuffer, // Usar la versión optimizada
          Key: s3Key,
          ContentType: 'image/jpeg'
        });

        // Subir a S3 la miniatura
        const thumbnailKey = `users/${userId}/photos/thumbnails/takeout-${Date.now()}-${fileName}`;

        const thumbnailResult = await s3Service.uploadBuffer({
          Buffer: thumbnailBuffer, // Usar la versión miniatura
          Key: thumbnailKey,
          ContentType: 'image/jpeg'
        });

        // Preparar datos para BD
        const photoData = {
          userId: userId || 'system',
          title: fileName,
          description: googleMetadata.description || '',
          s3Key: uploadResult.Key,
          s3Url: uploadResult.Location,
          timestamp: exifData.DateTimeOriginal || googleMetadata.photoTakenTime?.timestamp || new Date(),
          thumbnailUrl: thumbnailResult.Location,
          originalUrl: uploadResult.Location,
          source: 'google_takeout',
          metadata: {
            width: exifData.ImageWidth || googleMetadata.width,
            height: exifData.ImageHeight || googleMetadata.height,
            creationTime: exifData.DateTimeOriginal,
            camera: exifData.Make ? `${exifData.Make} ${exifData.Model}`.trim() : undefined,
            lens: exifData.LensModel,
            aperture: exifData.FNumber ? `f/${exifData.FNumber}` : undefined,
            shutterSpeed: exifData.ExposureTime ? `${exifData.ExposureTime}s` : undefined,
            iso: exifData.ISO,
            fileSize: imageBuffer.length,
            fileType: 'image/jpeg',
            sourceType: 'google_takeout'
          }
        };

        // Agregar ubicación si existe
        if (exifData && typeof exifData.latitude === 'number' && typeof exifData.longitude === 'number') {
          photoData.location = {
            type: 'Point',
            coordinates: [exifData.longitude, exifData.latitude]
          };
          stats.withLocation++;
        } else if (googleMetadata.geoData && googleMetadata.geoData.latitude && googleMetadata.geoData.longitude) {
          // Intentar obtener de los metadatos de Google
          photoData.location = {
            type: 'Point',
            coordinates: [parseFloat(googleMetadata.geoData.longitude), parseFloat(googleMetadata.geoData.latitude)]
          };
          stats.withLocation++;
        } else {
          stats.withoutLocation++;
        }

        // Guardar en BD
        console.log(`Guardando en BD: ${photoData.title}`);
        const photo = await photoService.createPhoto(photoData, photoData.userId);

        stats.processed++;
        stats.photos.push({
          id: photo.id,
          title: photoData.title,
          hasLocation: !!photoData.location,
          url: photoData.s3Url
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
      message: `Procesamiento completado. ${stats.processed} fotos importadas.`,
      stats
    });

  } catch (err) {
    console.error('Error procesando ZIP de Takeout:', err);
    return next(new AppError(`Error al procesar archivo: ${err.message}`, 500));
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