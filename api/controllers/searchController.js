const { success } = require('../utils/responseFormatter');
const Photo = require('../models/Photo');

exports.search = async (req, res, next) => {
  try {
    const {
      query, categories, startDate, endDate,
      lat, lng, distance,
      page = 1, limit = 20
    } = req.query;

    const searchQuery = {};

    // Búsqueda por texto
    if (query) {
      searchQuery.$or = [
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ];
    }

    // Filtro por categorías
    if (categories) {
      searchQuery.categories = { $in: categories.split(',') };
    }

    // Filtro por fechas
    if (startDate || endDate) {
      searchQuery.timestamp = {};
      if (startDate) searchQuery.timestamp.$gte = new Date(startDate);
      if (endDate) searchQuery.timestamp.$lte = new Date(endDate);
    }

    // Filtro por ubicación
    if (lat && lng && distance) {
      searchQuery.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseInt(distance, 10)
        }
      };
    }

    // Paginación
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Ejecutar consulta
    const photos = await Photo.find(searchQuery)
      .populate('categories', 'name')
      .populate('uploader', 'name')
      .skip(skip)
      .limit(parseInt(limit, 10))
      .sort({ timestamp: -1 });

    // Contar total
    const total = await Photo.countDocuments(searchQuery);

    return success(res, {
      photos,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    next(err);
  }
}; 