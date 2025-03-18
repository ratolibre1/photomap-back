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