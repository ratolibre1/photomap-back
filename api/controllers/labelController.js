const Label = require('../models/Label');
const Category = require('../models/Category');
const Photo = require('../models/Photo');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

// Crear etiqueta
exports.createLabel = async (req, res, next) => {
  try {
    const { name, categoryId, color, textColor } = req.body;

    // Validar que la categoría existe
    const categoryExists = await Category.exists({ _id: categoryId });
    if (!categoryExists) {
      return next(new AppError('La categoría no existe', 404));
    }

    const label = await Label.create({
      name,
      categoryId,
      color,
      textColor,
      userId: req.user.id
    });

    return success(res, { label }, 201);
  } catch (error) {
    // Si es error de duplicado
    if (error.code === 11000) {
      return next(new AppError('Ya existe una etiqueta con ese nombre en esta categoría', 400));
    }
    next(error);
  }
};

// Listar etiquetas
exports.getLabels = async (req, res, next) => {
  try {
    const { categoryId } = req.query;
    // Crear filtro base con userId obligatorio
    let filter = { userId: req.user.id };

    // Agregar categoryId al filtro si existe
    if (categoryId) {
      filter.categoryId = categoryId;
    }

    const labels = await Label.find(filter)
      .populate('categoryId', 'name')
      .sort('name');

    // Obtener conteo de fotos para cada etiqueta
    const labelsWithCount = await Promise.all(labels.map(async (label) => {
      const photoCount = await Photo.countDocuments({ labels: label._id });
      return {
        ...label.toObject(),
        photoCount
      };
    }));

    return success(res, { labels: labelsWithCount });
  } catch (error) {
    next(error);
  }
};

// Obtener una etiqueta
exports.getLabelById = async (req, res, next) => {
  try {
    const labelId = req.params.id;

    // Buscar la etiqueta filtrando también por userId si el usuario está autenticado
    const filter = { _id: labelId };
    if (req.user) {
      filter.userId = req.user.id;
    }

    const label = await Label.findOne(filter)
      .populate('categoryId', 'name');

    if (!label) {
      return next(new AppError('Etiqueta no encontrada', 404));
    }

    // Obtener conteo de fotos para esta etiqueta
    const photoCount = await Photo.countDocuments({ labels: label._id });
    const labelWithCount = {
      ...label.toObject(),
      photoCount
    };

    return success(res, { label: labelWithCount });
  } catch (error) {
    next(error);
  }
};

// Actualizar etiqueta
exports.updateLabel = async (req, res, next) => {
  try {
    const { name, color, textColor } = req.body;

    const label = await Label.findByIdAndUpdate(
      req.params.id,
      { name, color, textColor },
      { new: true, runValidators: true }
    ).populate('categoryId', 'name');

    if (!label) {
      return next(new AppError('Etiqueta no encontrada', 404));
    }

    return success(res, { label });
  } catch (error) {
    // Si es error de duplicado
    if (error.code === 11000) {
      return next(new AppError('Ya existe una etiqueta con ese nombre en esta categoría', 400));
    }
    next(error);
  }
};

// Eliminar etiqueta
exports.deleteLabel = async (req, res, next) => {
  try {
    const label = await Label.findById(req.params.id);

    if (!label) {
      return next(new AppError('Etiqueta no encontrada', 404));
    }

    // Eliminar esta etiqueta de todas las fotos que la tengan
    await Photo.updateMany(
      { labels: label._id },
      { $pull: { labels: label._id } }
    );

    console.log(`Etiqueta ${label._id} eliminada de las fotos que la contenían`);

    // Eliminar la etiqueta
    await Label.findByIdAndDelete(req.params.id);

    return success(res, { message: 'Etiqueta eliminada correctamente' });
  } catch (error) {
    next(error);
  }
}; 