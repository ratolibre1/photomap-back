const { body, validationResult } = require('express-validator');
const { AppError } = require('../utils/errorHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  next();
};

exports.validateUser = [
  body('name')
    .trim()
    .not()
    .isEmpty()
    .withMessage('El nombre es obligatorio'),
  body('email')
    .isEmail()
    .withMessage('Ingresa un email válido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  validate
];

exports.validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Ingresa un email válido')
    .normalizeEmail(),
  body('password')
    .not()
    .isEmpty()
    .withMessage('La contraseña es obligatoria'),
  validate
];

exports.validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .not()
    .isEmpty()
    .withMessage('El nombre no puede estar vacío'),
  body('biography')
    .optional()
    .trim()
    .isLength({ max: 3000 })
    .withMessage('La biografía no puede tener más de 3000 caracteres'),
  validate
];

exports.validatePasswordUpdate = [
  body('currentPassword')
    .not()
    .isEmpty()
    .withMessage('La contraseña actual es obligatoria'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
  validate
]; 