const backgroundService = require('../services/backgroundService');
const { success } = require('../utils/responseFormatter');
const Photo = require('../models/Photo');
const geocodingService = require('../services/geocodingService');
const crypto = require('crypto');
const s3Service = require('../services/s3Service');

exports.triggerGeocodingProcess = async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    // Iniciar proceso en background
    backgroundService.processGeocodingQueue(limit)
      .then(result => console.log('Procesamiento completado:', result))
      .catch(err => console.error('Error en procesamiento:', err));

    return success(res, {
      message: 'Proceso de geocodificación iniciado en segundo plano',
      limit
    });
  } catch (error) {
    next(error);
  }
};

exports.getGeocodingStatus = async (req, res, next) => {
  try {
    // Contar fotos por estado
    const pendingCount = await Photo.countDocuments({
      $or: [
        { geocodingStatus: 'pending' },
        { geocodingStatus: { $exists: false } },
        { geocodingStatus: null }
      ]
    });

    const processingCount = await Photo.countDocuments({ geocodingStatus: 'processing' });
    const completedCount = await Photo.countDocuments({ geocodingStatus: 'completed' });
    const failedCount = await Photo.countDocuments({ geocodingStatus: 'failed' });

    // Obtener algunas muestras
    const sampleCompleted = await Photo.find({ geocodingStatus: 'completed' })
      .select('title location geocodingDetails')
      .limit(5);

    return success(res, {
      counts: {
        pending: pendingCount,
        processing: processingCount,
        completed: completedCount,
        failed: failedCount,
        total: pendingCount + processingCount + completedCount + failedCount
      },
      samples: sampleCompleted
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Procesa la geocodificación de fotos pendientes
 */
exports.processGeocodingBatch = async (req, res, next) => {
  try {
    const options = {
      limit: req.body.limit || 100,
      force: req.body.force || false,
      userId: req.body.userId,
      status: req.body.status
    };

    // Iniciar procesamiento en segundo plano
    const jobId = `geo-job-${Date.now()}`;

    // Esto se debe adaptar a tu sistema de tareas en segundo plano
    backgroundService.addTask(jobId, async () => {
      try {
        const result = await geocodingService.processPendingPhotos(options);
        console.log(`Procesamiento completado: ${result.totalProcessed} fotos, ${result.totalErrors} errores`);
      } catch (error) {
        console.error('Error en procesamiento batch:', error);
      }
    });

    return success(res, {
      message: 'Procesamiento de geocodificación iniciado',
      details: {
        queued: options.limit,
        status: 'started',
        jobId: jobId
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Actualiza hashes para fotos existentes sin hash
 */
exports.updatePhotoHashes = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || 100);
    let processed = 0;
    let errors = 0;

    // Buscar fotos sin hash
    const photos = await Photo.find({ fileHash: { $exists: false } })
      .limit(limit);

    console.log(`Procesando ${photos.length} fotos sin hash`);

    for (const photo of photos) {
      try {
        // Descargar archivo de S3
        const imageUrl = photo.originalUrl;
        const imageBuffer = await s3Service.getFileFromS3ByUrl(imageUrl);

        if (!imageBuffer) {
          console.error(`No se pudo obtener la imagen de ${imageUrl}`);
          errors++;
          continue;
        }

        // Calcular hash
        const fileHash = crypto
          .createHash('sha256')
          .update(imageBuffer)
          .digest('hex');

        // Actualizar foto
        photo.fileHash = fileHash;
        await photo.save();

        processed++;
      } catch (error) {
        console.error(`Error procesando foto ${photo._id}:`, error);
        errors++;
      }
    }

    return success(res, {
      message: `Proceso completado: ${processed} fotos actualizadas, ${errors} errores`,
      processed,
      errors,
      remaining: await Photo.countDocuments({ fileHash: { $exists: false } })
    });
  } catch (error) {
    return next(error);
  }
}; 