const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { validateUser, validateLogin } = require('../middlewares/validation');
const { protect, restrictTo } = require('../middlewares/auth');

// Rutas públicas
router.post('/register', validateUser, userController.register);
router.post('/login', validateLogin, userController.login);

// Rutas protegidas
router.get('/', protect, restrictTo('admin'), userController.getUsers);
router.get('/me', protect, userController.getMe);
router.patch('/language', protect, userController.updatePreferredLanguage);

module.exports = router; 