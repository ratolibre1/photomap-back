const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { protect } = require('../middlewares/auth');

// Rutas públicas
router.get('/test', apiController.test);

// Rutas protegidas
router.post('/datos', protect, apiController.recibirDatos);

module.exports = router; 