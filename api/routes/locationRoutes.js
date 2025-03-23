const express = require('express');
const router = express.Router();
const { getCountries, getRegions, getCounties, getCities } = require('../controllers/locationController');
const { protect } = require('../middlewares/auth');
console.log('¿protect existe?', !!protect);

// Rutas de ubicación (todas requieren autenticación)
router.get('/countries', protect, getCountries);
router.get('/regions', protect, getRegions);
router.get('/counties', protect, getCounties);
router.get('/cities', protect, getCities);

module.exports = router; 