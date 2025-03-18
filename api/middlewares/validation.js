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