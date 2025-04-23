const userService = require('../services/userService');
const { success, error } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const User = require('../models/User');

exports.register = async (req, res, next) => {
  try {
    const result = await userService.register(req.body);
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await userService.login(email, password);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const users = await userService.getUsers();
    return success(res, { users });
  } catch (err) {
    next(err);
  }
};

// Obtener perfil del usuario actual
exports.getMe = async (req, res, next) => {
  try {
    // El middleware de autenticación ya ha añadido el usuario a req.user
    // Podemos obtener datos frescos de la base de datos si es necesario
    const user = await User.findById(req.user.id);

    if (!user) {
      return next(new AppError('Usuario no encontrado', 404));
    }

    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

// Actualizar perfil del usuario
exports.updateProfile = async (req, res, next) => {
  try {
    // Solo permitir actualizar ciertos campos
    const allowedFields = ['name', 'biography'];
    const updateData = {};

    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    // Validar longitud de la biografía
    if (updateData.biography && updateData.biography.length > 3000) {
      return next(new AppError('La biografía no puede tener más de 3000 caracteres', 400));
    }

    // Actualizar usuario
    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!user) {
      return next(new AppError('Usuario no encontrado', 404));
    }

    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

// Subir/actualizar foto de perfil
exports.updateProfilePhoto = async (req, res, next) => {
  try {
    // El middleware uploadToS3AndUpdateUser ya ha actualizado el usuario 
    // y lo ha guardado en req.updatedUser
    const user = req.updatedUser;

    if (!user) {
      return next(new AppError('Error al actualizar la foto de perfil', 500));
    }

    return success(res, {
      user,
      message: 'Foto de perfil actualizada correctamente'
    });
  } catch (err) {
    next(err);
  }
};

// Eliminar foto de perfil
exports.deleteProfilePhoto = async (req, res, next) => {
  try {
    const profilePhotoService = require('../services/profilePhotoService');
    const user = await profilePhotoService.deleteProfilePhoto(req.user.id);

    return success(res, {
      user,
      message: 'Foto de perfil eliminada correctamente'
    });
  } catch (err) {
    next(err);
  }
};

// Cambiar contraseña del usuario
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validar que se proporcionaron ambas contraseñas
    if (!currentPassword || !newPassword) {
      return next(new AppError('Por favor proporciona la contraseña actual y la nueva', 400));
    }

    // Validar longitud de nueva contraseña
    if (newPassword.length < 6) {
      return next(new AppError('La nueva contraseña debe tener al menos 6 caracteres', 400));
    }

    // Obtener usuario con contraseña
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return next(new AppError('Usuario no encontrado', 404));
    }

    // Verificar contraseña actual
    const isCorrect = await user.comparePassword(currentPassword);

    if (!isCorrect) {
      return next(new AppError('Contraseña actual incorrecta', 401));
    }

    // Actualizar contraseña
    user.password = newPassword;
    await user.save(); // Usar save() para que se ejecute el middleware de encriptación

    // Generar nuevo token
    const token = userService.generateToken(user._id);

    // No devolver la contraseña
    user.password = undefined;

    return success(res, { user, token });
  } catch (err) {
    next(err);
  }
};

// Actualizar idioma preferido del usuario
exports.updatePreferredLanguage = async (req, res, next) => {
  try {
    const { preferredLanguage } = req.body;

    // Validar que el idioma enviado esté entre los permitidos
    const allowedLanguages = ['es', 'en', 'es-CL', 'en-US'];
    if (!allowedLanguages.includes(preferredLanguage)) {
      return next(new AppError('Idioma no válido. Opciones permitidas: es, en, es-CL, en-US', 400));
    }

    // Actualizar el idioma del usuario
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { preferredLanguage },
      { new: true, runValidators: true }
    );

    if (!user) {
      return next(new AppError('Usuario no encontrado', 404));
    }

    return success(res, { user });
  } catch (err) {
    next(err);
  }
}; 