const Photo = require('../models/Photo');
const geocodingService = require('./geocodingService');

/**
 * Procesa la cola de geocodificación en segundo plano
 * @param {Number} limit - Límite de fotos a procesar
 */
exports.processGeocodingQueue = async (limit = 20) => {
  try {
    console.log(`Iniciando procesamiento de cola de geocodificación, límite: ${limit}`);

    // Usar el nuevo servicio de geocodificación con soporte para entidades jerárquicas
    const result = await geocodingService.processPendingPhotos({
      limit: limit,
      force: false
    });

    console.log('Procesamiento completado:', {
      procesadas: result.totalProcessed,
      errores: result.totalErrors,
      total: result.totalFound
    });

    return result;
  } catch (error) {
    console.error('Error en processGeocodingQueue:', error);
    throw error;
  }
};

/**
 * Procesa fotos pendientes de geocodificación
 */
const processGeocodingQueue = async () => {
  try {
    console.log('Iniciando procesamiento de cola de geocodificación...');

    // Buscar fotos con estado pendiente
    const pendingPhotos = await Photo.find({
      geocodingStatus: 'pending',
      'location.coordinates': { $exists: true, $ne: [0, 0] } // Solo procesar con coordenadas válidas
    }).limit(BATCH_SIZE);

    if (pendingPhotos.length === 0) {
      console.log('No hay fotos pendientes de geocodificación');
      return;
    }

    console.log(`Procesando ${pendingPhotos.length} fotos pendientes`);

    // Procesar cada foto
    for (const photo of pendingPhotos) {
      await processPhotoGeocoding(photo);
    }

    console.log('Procesamiento de geocodificación completado');
  } catch (error) {
    console.error('Error procesando cola de geocodificación:', error);
  }
};