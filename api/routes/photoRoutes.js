const express = require('express');
const router = express.Router();
const photoController = require('../controllers/photoController');
const { protect } = require('../middlewares/auth');

// Rutas públicas
router.get('/:id', photoController.getPhotoById);

// Rutas protegidas
router.post('/', protect, photoController.uploadPhoto, photoController.createPhoto);

// Ruta problemática 
router.delete('/all', protect, photoController.deleteAllPhotos);

// Ruta alternativa con un nombre diferente
router.delete('/delete-all-photos', protect, photoController.deleteAllPhotos);

// Primero las rutas específicas para operaciones en lote
router.patch('/batch/visibility', protect, photoController.updateBatchVisibility);
router.delete('/batch', protect, photoController.deleteBatchPhotos);

// Después las rutas con parámetros dinámicos
router.post('/search', protect, photoController.searchPhotos);
router.patch('/:id', protect, photoController.updatePhoto);
router.delete('/:id', protect, photoController.deletePhoto);

module.exports = router; 