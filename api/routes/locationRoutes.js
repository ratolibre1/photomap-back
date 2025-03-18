const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { protect } = require('../middlewares/auth');
console.log('¿protect existe?', !!protect);

// Rutas de ubicación (todas requieren autenticación)
router.get('/countries', protect, locationController.getCountries);
router.get('/regions', protect, locationController.getRegions);
router.get('/counties', protect, locationController.getCounties);
router.get('/cities', protect, locationController.getCities);

module.exports = router; 