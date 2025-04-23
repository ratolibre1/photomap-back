const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { validateUser, validateLogin, validateProfileUpdate, validatePasswordUpdate } = require('../middlewares/validation');
const { protect, restrictTo } = require('../middlewares/auth');
const profilePhotoService = require('../services/profilePhotoService');

// Rutas públicas
router.post('/register', validateUser, userController.register);
router.post('/login', validateLogin, userController.login);

// Rutas protegidas
router.get('/', protect, restrictTo('admin'), userController.getUsers);
router.get('/me', protect, userController.getMe);
router.patch('/language', protect, userController.updatePreferredLanguage);
router.patch('/profile', protect, validateProfileUpdate, userController.updateProfile);
router.patch('/password', protect, validatePasswordUpdate, userController.updatePassword);

// Rutas de foto de perfil
router.patch(
  '/profile-photo',
  protect,
  profilePhotoService.uploadProfilePhoto,
  profilePhotoService.processProfilePhoto,
  profilePhotoService.uploadToS3AndUpdateUser,
  userController.updateProfilePhoto
);
router.delete('/profile-photo', protect, userController.deleteProfilePhoto);

module.exports = router; 