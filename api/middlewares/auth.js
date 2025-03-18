const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');
const { JWT_SECRET } = require('../../config/env');

exports.protect = async (req, res, next) => {
  try {
    // 1) Verificar si hay token
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('No estás logueado. Por favor inicia sesión para acceder', 401));
    }

    // 2) Verificar token
    const decoded = await promisify(jwt.verify)(token, JWT_SECRET);

    // 3) Verificar si el usuario aún existe
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError('El usuario de este token ya no existe', 401));
    }

    // 4) Guardar el usuario en la request
    req.user = user;
    next();
  } catch (error) {
    next(new AppError('No autorizado', 401));
  }
};

// Restricción de roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('No tienes permiso para realizar esta acción', 403));
    }
    next();
  };
}; 