const Upload = require('../models/Upload');

/**
 * Crea un nuevo registro de upload en estado 'processing'
 * @param {Object} data - Datos del upload
 * @param {String} userId - ID del usuario
 * @returns {Promise<Object>} Registro creado
 */
exports.createUploadRecord = async (data, userId) => {
  const { fileName = null, fileSize = 0, uploadType } = data;

  const upload = new Upload({
    userId,
    fileName,
    fileSize,
    uploadType,
    status: 'processing',
    startedAt: new Date(),
    stats: {
      processed: 0,
      duplicates: 0,
      errors: 0,
      totalPhotos: 0
    }
  });

  return await upload.save();
};

/**
 * Finaliza un registro de upload como completado
 * @param {String} uploadId - ID del registro de upload
 * @param {Object} stats - Estadísticas finales
 * @param {Array} photos - Información de las fotos procesadas
 * @returns {Promise<Object>} Registro actualizado
 */
exports.completeUpload = async (uploadId, stats, photos = []) => {
  const now = new Date();
  const upload = await Upload.findById(uploadId);

  if (!upload) {
    throw new Error(`Upload con ID ${uploadId} no encontrado`);
  }

  const startTime = upload.startedAt || upload.createdAt;
  const processingTime = now.getTime() - startTime.getTime();

  upload.status = 'completed';
  upload.stats = stats;
  upload.photos = photos;
  upload.completedAt = now;
  upload.processingTimeMs = processingTime;

  return await upload.save();
};

/**
 * Marca un registro de upload como fallido
 * @param {String} uploadId - ID del registro de upload
 * @param {String} errorMessage - Mensaje de error
 * @returns {Promise<Object>} Registro actualizado
 */
exports.failUpload = async (uploadId, errorMessage) => {
  const now = new Date();
  const upload = await Upload.findById(uploadId);

  if (!upload) {
    throw new Error(`Upload con ID ${uploadId} no encontrado`);
  }

  const startTime = upload.startedAt || upload.createdAt;
  const processingTime = now.getTime() - startTime.getTime();

  upload.status = 'failed';
  upload.errorMessage = errorMessage;
  upload.completedAt = now;
  upload.processingTimeMs = processingTime;

  return await upload.save();
};

/**
 * Obtiene los registros de upload de un usuario
 * @param {String} userId - ID del usuario
 * @param {Object} options - Opciones de paginación
 * @returns {Promise<Object>} Registros paginados
 */
exports.getUserUploads = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const [uploads, total] = await Promise.all([
    Upload.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Upload.countDocuments({ userId })
  ]);

  return {
    uploads,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Obtiene un registro de upload por ID
 * @param {String} uploadId - ID del registro
 * @param {String} userId - ID del usuario para verificar permisos
 * @returns {Promise<Object>} Registro de upload
 */
exports.getUploadById = async (uploadId, userId) => {
  const upload = await Upload.findById(uploadId);

  if (!upload) {
    throw new Error(`Upload con ID ${uploadId} no encontrado`);
  }

  // Verificar permisos
  if (upload.userId.toString() !== userId) {
    throw new Error('No tienes permiso para ver este registro de upload');
  }

  return upload;
}; 