const Category = require('../models/Category');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

// Crear categoría
exports.createCategory = async (req, res, next) => {
  try {
    const category = await Category.create({
      ...req.body,
      creator: req.user.id
    });
    return success(res, { category }, 201);
  } catch (err) {
    next(err);
  }
};

// Obtener todas las categorías
exports.getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find();
    return success(res, { categories });
  } catch (err) {
    next(err);
  }
};

// Actualizar categoría
exports.updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!category) {
      return next(new AppError('Categoría no encontrada', 404));
    }

    return success(res, { category });
  } catch (err) {
    next(err);
  }
};

// Eliminar categoría
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return next(new AppError('Categoría no encontrada', 404));
    }

    return success(res, null, 204);
  } catch (err) {
    next(err);
  }
}; 