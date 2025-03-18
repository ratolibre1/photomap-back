const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { protect, restrictTo } = require('../middlewares/auth');

// Rutas públicas
router.get('/', categoryController.getCategories);

// Rutas protegidas
router.use(protect);
router.post('/', restrictTo('admin'), categoryController.createCategory);
router.patch('/:id', restrictTo('admin'), categoryController.updateCategory);
router.delete('/:id', restrictTo('admin'), categoryController.deleteCategory);

module.exports = router; 