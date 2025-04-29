const express = require('express');
const router = express.Router();
const photoController = require('../controllers/photoController');
const { protect } = require('../middlewares/auth');

// Rutas específicas
router.post('/search', photoController.searchPhotos);
router.get('/calendar', protect, photoController.getPhotoCalendarStats);
router.get('/on-this-day', protect, photoController.getOnThisDayPhotos);
router.patch('/batch-visibility', protect, photoController.updateBatchVisibility);
router.post('/multiple', protect, photoController.uploadMultiplePhotos, photoController.createMultiplePhotos);
router.delete('/delete-all-photos', protect, photoController.deleteAllPhotos);
router.delete('/batch', protect, photoController.deleteBatchPhotos);

// Usar la ruta de carga múltiple para ambos casos (individual y múltiple)
router.post('/', protect, photoController.uploadMultiplePhotos, photoController.createMultiplePhotos);

// Rutas con parámetros dinámicos (deben ir al final)
router.patch('/:id', protect, photoController.updatePhoto);
router.delete('/:id', protect, photoController.deletePhoto);
router.get('/:id', protect, photoController.getPhotoById);

module.exports = router; 