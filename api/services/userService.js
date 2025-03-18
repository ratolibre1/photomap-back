const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config/env');
const { AppError } = require('../utils/errorHandler');

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

exports.register = async (userData) => {
  // Verificar si el email ya existe
  const existingUser = await User.findOne({ email: userData.email });
  if (existingUser) {
    throw new AppError('Este email ya está registrado', 400);
  }

  // Crear el usuario (temporalmente hacemos que el primer usuario sea admin)
  // Comenta o elimina esta línea después de crear tu primer usuario
  userData.role = 'admin';

  const user = await User.create(userData);

  // Generar token
  const token = generateToken(user._id);

  // No devolver la contraseña
  user.password = undefined;

  return { user, token };
};

exports.login = async (email, password) => {
  // Buscar usuario por email y traer el password
  const user = await User.findOne({ email }).select('+password');

  // Verificar si existe y la contraseña es correcta
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Email o contraseña incorrectos', 401);
  }

  // Generar token
  const token = generateToken(user._id);

  // No devolver la contraseña
  user.password = undefined;

  return { user, token };
};

exports.getUsers = async () => {
  return await User.find({ active: true });
};

/**
 * Actualiza los tokens de Google para un usuario
 */
exports.updateGoogleTokens = async (userId, tokens) => {
  return await User.findByIdAndUpdate(
    userId,
    { googleTokens: tokens },
    { new: true, runValidators: true }
  );
}; 