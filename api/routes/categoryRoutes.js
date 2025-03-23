const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { protect, restrictTo } = require('../middlewares/auth');

// Rutas públicas
router.get('/', protect, categoryController.getCategories);
router.get('/:id', protect, categoryController.getCategoryById);

// Rutas protegidas
router.use(protect);
router.post('/', categoryController.createCategory);
router.patch('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

module.exports = router; 