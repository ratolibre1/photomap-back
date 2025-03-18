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
    // Calcular hash del archivo original
    const fileHash = calculateFileHash(imageBuffer);

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

    return {
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