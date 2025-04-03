const express = require('express');
const publicMapController = require('../controllers/publicMapController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

// Rutas protegidas (requieren autenticación)
router.post('/', protect, publicMapController.createPublicMap);
router.get('/user', protect, publicMapController.getUserMaps);
router.get('/:id', protect, publicMapController.getMapById);
router.get('/:id/photos', protect, publicMapController.getMapPhotosById);
router.put('/:id', protect, publicMapController.updateMap);
router.delete('/:id', protect, publicMapController.deleteMap);

// Rutas públicas (no requieren autenticación)
router.get('/share/:shareId', publicMapController.getMapByShareId);
router.get('/share/:shareId/photos', publicMapController.getMapPhotosByShareId);

module.exports = router; 