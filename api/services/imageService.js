const sharp = require('sharp');
const path = require('path');
const s3Service = require('./s3Service');
const { extractExifData } = require('../utils/exifExtractor');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Procesa una imagen: extrae metadatos, optimiza y crea thumbnail
 * @param {Buffer} imageBuffer - Buffer de la imagen original
 * @param {String} originalName - Nombre original del archivo
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Object>} Datos de la imagen procesada
 */
exports.processImage = async (imageBuffer, originalName, options = {}) => {
  try {
    console.log('Iniciando procesamiento de imagen:', originalName);

    // Calcular hash del archivo original
    console.log('Calculando hash del archivo...');
    const fileHash = calculateFileHash(imageBuffer);
    console.log('Hash generado:', fileHash);

    // Generar un ID único para el archivo
    const fileId = uuidv4();
    const fileExt = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, fileExt);

    // Nombres para S3
    const optimizedFileName = `photos/${fileId}/optimized-${baseName}${fileExt}`;
    const thumbnailFileName = `photos/${fileId}/thumbnail-${baseName}.jpg`;

    // Extraer metadatos EXIF
    const metadata = await extractExifData(imageBuffer);

    // Redimensionar la imagen original (manteniendo proporciones, máx 2000px)
    const optimizedBuffer = await sharp(imageBuffer)
      .resize({
        width: 2000,
        height: 2000,
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();

    // Crear thumbnail (300px x 300px)
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Subir a S3
    const optimizedUrl = await s3Service.uploadFile(
      optimizedBuffer,
      optimizedFileName,
      `image/${fileExt.substring(1)}`
    );

    const thumbnailUrl = await s3Service.uploadFile(
      thumbnailBuffer,
      thumbnailFileName,
      'image/jpeg'
    );

    // Obtener dimensiones finales
    const dimensions = await sharp(optimizedBuffer).metadata();

    const result = {
      originalUrl: optimizedUrl,
      thumbnailUrl: thumbnailUrl,
      metadata: {
        ...metadata,
        dimensions: {
          width: dimensions.width,
          height: dimensions.height
        },
        fileSize: optimizedBuffer.length,
        fileType: fileExt.substring(1)
      },
      fileHash
    };

    console.log('Resultado del procesamiento:', {
      ...result,
      fileHash: result.fileHash // Mostrar explícitamente el hash
    });

    return result;
  } catch (error) {
    console.error('Error procesando imagen:', error);
    throw new Error(`Error procesando imagen: ${error.message}`);
  }
};

// Función para calcular el hash de un buffer
const calculateFileHash = (buffer) => {
  return crypto
    .createHash('sha256')  // Podemos usar 'md5' si queremos un hash más corto
    .update(buffer)
    .digest('hex');
};

/**
 * Función que convierte coordenadas de formato DMS a decimal
 * @param {Object} gpsData - Datos GPS extraídos de EXIF
 * @returns {Object|null} - Coordenadas en formato decimal {lat, lon}
 */
function extractCoordinatesFromExif(gpsData) {
  try {
    if (!gpsData) return null;

    console.log('Datos GPS encontrados en EXIF:', JSON.stringify(gpsData));

    // Si viene como objeto con propiedades lat/lng, usarlo directamente
    if (gpsData.lat !== undefined && gpsData.lng !== undefined) {
      return {
        lat: gpsData.lat,
        lon: gpsData.lng
      };
    }

    // Si viene como cadena DMS, convertir
    if (typeof gpsData === 'string') {
      console.log('Intentando parsear coordenadas DMS:', gpsData);

      // Detectar formato DMS con notación cardinal (N, S, E, W)
      const dmsRegex = /(\d+)°\s*(\d+)'\s*(\d+(?:\.\d+)?)"\s*([NSEW])/gi;
      const matches = [...gpsData.matchAll(dmsRegex)];

      if (matches.length >= 2) {
        // Extraer latitud y longitud
        const coords = matches.map(match => {
          const degrees = parseFloat(match[1]);
          const minutes = parseFloat(match[2]);
          const seconds = parseFloat(match[3]);
          const direction = match[4].toUpperCase();

          // Convertir a decimal
          let decimal = degrees + (minutes / 60) + (seconds / 3600);

          // Ajustar signo según dirección cardinal
          if (direction === 'S' || direction === 'W' || direction === 'O') {
            decimal = -decimal;
          }

          return decimal;
        });

        // Determinar qué coordenada es latitud y cuál es longitud
        // Normalmente, latitud va primero y longitud después
        return {
          lat: coords[0],
          lon: coords[1]
        };
      }

      return null;
    }

    // Formato tradicional de EXIF con arrays
    if (gpsData.GPSLatitude && gpsData.GPSLongitude &&
      gpsData.GPSLatitudeRef && gpsData.GPSLongitudeRef) {

      // Convertir arreglos [degrees, minutes, seconds] a decimal
      const latDegrees = gpsData.GPSLatitude[0];
      const latMinutes = gpsData.GPSLatitude[1];
      const latSeconds = gpsData.GPSLatitude[2];

      const lonDegrees = gpsData.GPSLongitude[0];
      const lonMinutes = gpsData.GPSLongitude[1];
      const lonSeconds = gpsData.GPSLongitude[2];

      let latitude = latDegrees + (latMinutes / 60) + (latSeconds / 3600);
      let longitude = lonDegrees + (lonMinutes / 60) + (lonSeconds / 3600);

      // Ajustar signo según referencia
      if (gpsData.GPSLatitudeRef === 'S') latitude = -latitude;
      if (gpsData.GPSLongitudeRef === 'W' || gpsData.GPSLongitudeRef === 'O') longitude = -longitude;

      return {
        lat: latitude,
        lon: longitude
      };
    }

    return null;
  } catch (error) {
    console.error('Error al extraer coordenadas de EXIF:', error);
    return null;
  }
} 