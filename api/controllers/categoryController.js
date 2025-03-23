const Category = require('../models/Category');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');
const Label = require('../models/Label');
const Photo = require('../models/Photo');

// Crear categoría
exports.createCategory = async (req, res, next) => {
  try {
    const category = await Category.create({
      ...req.body,
      userId: req.user.id
    });
    return success(res, { category }, 201);
  } catch (err) {
    next(err);
  }
};

// Obtener todas las categorías
exports.getCategories = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Obtener todas las categorías del usuario
    const categories = await Category.find({ userId }).sort('name');

    // Para cada categoría, buscar sus etiquetas
    const categoriesWithLabels = await Promise.all(categories.map(async (category) => {
      // Contar TODAS las fotos de esta categoría
      const photoCount = await Photo.countDocuments({
        categories: category._id,
        userId
      });

      // Buscar etiquetas para esta categoría
      const labels = await Label.find({
        categoryId: category._id,
        userId
      }).sort('name');

      // Obtener conteo para cada etiqueta
      const labelsWithCount = await Promise.all(labels.map(async (label) => {
        const labelPhotoCount = await Photo.countDocuments({
          labels: label._id,
          userId
        });
        const publicPhotoCount = await Photo.countDocuments({
          labels: label._id,
          userId,
          isPublic: true
        });

        return {
          ...label.toObject(),
          photoCount: labelPhotoCount,
          publicPhotoCount
        };
      }));

      // Agregar etiquetas a la categoría
      return {
        ...category.toObject(),
        photoCount,  // Solo mantenemos el conteo total a nivel de categoría
        labels: labelsWithCount
      };
    }));

    return success(res, categoriesWithLabels);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    next(error);
  }
};

// Actualizar categoría
exports.updateCategory = async (req, res, next) => {
  try {
    // Primero verificar que la categoría pertenece al usuario
    const category = await Category.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!category) {
      return next(new AppError('Categoría no encontrada', 404));
    }

    // Ahora actualizar
    Object.assign(category, req.body);
    await category.save();

    return success(res, { category });
  } catch (err) {
    next(err);
  }
};

// Eliminar categoría
exports.deleteCategory = async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    // Verificar que la categoría existe
    const category = await Category.findById(categoryId);
    if (!category) {
      return next(new AppError('Categoría no encontrada', 404));
    }

    // Encontrar todas las etiquetas de esta categoría
    const labelsToDelete = await Label.find({ categoryId });

    // Si hay etiquetas, eliminarlas de las fotos y luego eliminar las etiquetas
    if (labelsToDelete.length > 0) {
      console.log(`Eliminando ${labelsToDelete.length} etiquetas de la categoría ${category.name}`);

      // Crear un array con los IDs de las etiquetas a eliminar
      const labelIds = labelsToDelete.map(label => label._id);

      // Eliminar las etiquetas de todas las fotos
      await Photo.updateMany(
        { labels: { $in: labelIds } },
        { $pull: { labels: { $in: labelIds } } }
      );

      // Eliminar todas las etiquetas de esta categoría
      await Label.deleteMany({ categoryId });

      console.log(`Etiquetas eliminadas correctamente`);
    }

    // Finalmente eliminar la categoría
    await Category.findByIdAndDelete(categoryId);

    return success(res, {
      message: 'Categoría y sus etiquetas eliminadas correctamente',
      deletedLabelsCount: labelsToDelete.length
    });
  } catch (err) {
    next(err);
  }
};

// Obtener una categoría por ID con sus labels
exports.getCategoryById = async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    // Buscar la categoría filtrando también por userId si el usuario está autenticado
    const filter = { _id: categoryId };
    if (req.user) {
      filter.userId = req.user.id;
    }

    const category = await Category.findOne(filter);

    if (!category) {
      return next(new AppError('Categoría no encontrada', 404));
    }

    // Buscar los labels asociados a esta categoría (también del usuario)
    const labelFilter = {
      categoryId: category._id
    };
    if (req.user) {
      labelFilter.userId = req.user.id;
    }
    const labels = await Label.find(labelFilter).sort('name');

    // Obtener conteo de fotos para cada etiqueta
    const labelsWithCount = await Promise.all(labels.map(async (label) => {
      const photoCount = await Photo.countDocuments({ labels: label._id });
      return {
        ...label.toObject(),
        photoCount
      };
    }));

    // Añadir los labels a la respuesta
    return success(res, {
      category: {
        ...category.toObject(),
        labels: labelsWithCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Obtener todos los labels de una categoría específica
exports.getCategoryLabels = async (req, res, next) => {
  try {
    const categoryId = req.params.id;

    // Verificar que la categoría existe
    const categoryExists = await Category.exists({ _id: categoryId });
    if (!categoryExists) {
      return next(new AppError('Categoría no encontrada', 404));
    }

    // Buscar todos los labels de esta categoría
    const labels = await Label.find({ categoryId }).sort('name');

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

// Obtener todas las categorías con sus etiquetas
exports.getCategoriesWithLabels = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Obtener todas las categorías del usuario
    const categories = await Category.find({ userId }).sort('name');

    // Para cada categoría, buscar sus etiquetas
    const categoriesWithLabels = await Promise.all(categories.map(async (category) => {
      // Buscar etiquetas para esta categoría
      const labels = await Label.find({
        categoryId: category._id,
        userId
      }).sort('name');

      // Obtener conteo para cada etiqueta
      const labelsWithCount = await Promise.all(labels.map(async (label) => {
        const photoCount = await Photo.countDocuments({
          labels: label._id,
          userId
        });
        const publicPhotoCount = await Photo.countDocuments({
          labels: label._id,
          userId,
          isPublic: true
        });

        return {
          ...label.toObject(),
          photoCount,
          publicPhotoCount
        };
      }));

      // Agregar etiquetas a la categoría
      return {
        ...category.toObject(),
        labels: labelsWithCount
      };
    }));

    return success(res, categoriesWithLabels);
  } catch (error) {
    console.error('Error al obtener categorías con etiquetas:', error);
    next(error);
  }
}; 