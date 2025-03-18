const sharp = require('sharp');

/**
 * Optimiza una imagen para web
 * @param {Buffer} imageBuffer - Buffer de la imagen original
 * @param {Object} options - Opciones de optimización
 * @returns {Promise<Buffer>} Buffer de la imagen optimizada
 */
exports.optimizeForWeb = async (imageBuffer, options = {}) => {
  const format = options.format || 'jpeg';

  // Opciones según formato
  const formatOptions = {
    jpeg: { quality: options.quality || 80, progressive: true },
    webp: { quality: options.quality || 80 },
    png: { palette: true, quality: options.quality || 80 }
  };

  let sharpInstance = sharp(imageBuffer)
    .resize({
      width: options.width || 2000,
      height: options.height || 2000,
      fit: options.fit || 'inside',
      withoutEnlargement: true
    })
    .rotate() // Auto-rotación basada en EXIF
    .flatten({ background: { r: 255, g: 255, b: 255 } }); // Fondo blanco para imágenes con alfa

  // Aplicar formato
  switch (format) {
    case 'jpeg':
      sharpInstance = sharpInstance.jpeg(formatOptions.jpeg);
      break;
    case 'webp':
      sharpInstance = sharpInstance.webp(formatOptions.webp);
      break;
    case 'png':
      sharpInstance = sharpInstance.png(formatOptions.png);
      break;
  }

  return await sharpInstance.toBuffer();
}; 