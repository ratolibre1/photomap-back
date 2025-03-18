const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Versión sin restricción para pruebas iniciales
router.post('/trigger-geocoding', adminController.triggerGeocodingProcess);
router.get('/geocoding-status', adminController.getGeocodingStatus);

module.exports = router; 