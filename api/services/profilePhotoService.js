const multer = require('multer');
const sharp = require('sharp');
const s3Service = require('./s3Service');
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');
const { v4: uuidv4 } = require('uuid');

// Configuración de multer para almacenar temporalmente
const storage = multer.memoryStorage();

// Filtro para permitir solo imágenes
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image')) {
    return cb(new AppError('Por favor sube solo imágenes', 400), false);
  }
  cb(null, true);
};

// Configurar multer
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter
});

// Middleware para subir foto
exports.uploadProfilePhoto = upload.single('profilePhoto');

/**
 * Procesa y redimensiona la foto de perfil
 */
exports.processProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) return next();

    // Redimensionar a 250x250px para foto de perfil
    const buffer = await sharp(req.file.buffer)
      .resize(250, 250, { fit: 'cover' })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toBuffer();

    // Guardar el buffer en req para usar en el siguiente middleware
    req.file.processedBuffer = buffer;
    next();
  } catch (error) {
    return next(new AppError('Error al procesar la imagen', 500));
  }
};

/**
 * Sube la foto procesada a S3 y actualiza el usuario
 */
exports.uploadToS3AndUpdateUser = async (req, res, next) => {
  try {
    if (!req.file || !req.file.processedBuffer) {
      return next(new AppError('No hay imagen para procesar', 400));
    }

    const userId = req.user.id;
    const uniqueId = uuidv4();
    const key = `profile-photos/${userId}/${uniqueId}.jpg`;

    // Subir a S3
    const result = await s3Service.uploadBuffer({
      Buffer: req.file.processedBuffer,
      Key: key,
      ContentType: 'image/jpeg'
    });

    // Si el usuario ya tenía una foto de perfil, eliminarla
    const user = await User.findById(userId);
    if (user.profilePhoto && user.profilePhoto.key) {
      try {
        await s3Service.deleteObject(user.profilePhoto.key);
      } catch (error) {
        console.error('Error al eliminar foto anterior:', error);
        // Continuamos aunque haya error en la eliminación
      }
    }

    // Actualizar usuario con la nueva foto
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        profilePhoto: {
          key: result.Key,
          url: result.Location,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    // Pasar el usuario actualizado a la request para el controlador
    req.updatedUser = updatedUser;
    next();
  } catch (error) {
    return next(new AppError('Error al subir la imagen a S3', 500));
  }
};

/**
 * Elimina la foto de perfil
 */
exports.deleteProfilePhoto = async (userId) => {
  // Buscar al usuario
  const user = await User.findById(userId);

  if (!user || !user.profilePhoto || !user.profilePhoto.key) {
    throw new AppError('No hay foto de perfil para eliminar', 404);
  }

  // Eliminar de S3
  await s3Service.deleteObject(user.profilePhoto.key);

  // Actualizar usuario
  return await User.findByIdAndUpdate(
    userId,
    { $unset: { profilePhoto: 1 } },
    { new: true }
  );
}; 