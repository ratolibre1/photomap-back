const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { protect, restrictTo } = require('../middlewares/auth');

// Rutas protegidas
router.get('/system', protect, statsController.getSystemStats);
router.get('/me', protect, statsController.getUserStats);

module.exports = router; 