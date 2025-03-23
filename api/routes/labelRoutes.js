const express = require('express');
const router = express.Router();
const labelController = require('../controllers/labelController');
const { protect } = require('../middlewares/auth');

// Rutas públicas (lectura)
router.get('/', protect, labelController.getLabels);
router.get('/:id', protect, labelController.getLabelById);

// Rutas protegidas (escritura) - solo requieren autenticación, no ser admin
router.post('/', protect, labelController.createLabel);
router.patch('/:id', protect, labelController.updateLabel);
router.delete('/:id', protect, labelController.deleteLabel);

module.exports = router; 