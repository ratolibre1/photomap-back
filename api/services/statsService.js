const Photo = require('../models/Photo');
const User = require('../models/User');
const Category = require('../models/Category');
const mongoose = require('mongoose');

/**
 * Obtiene estadísticas generales del sistema
 */
exports.getSystemStats = async () => {
  // Ejecutar consultas en paralelo para mejor rendimiento
  const [
    totalPhotos,
    totalUsers,
    totalCategories,
    photosByVisibility,
    photosByMonth,
    topCategories,
    topCameras
  ] = await Promise.all([
    // Total de fotos
    Photo.countDocuments(),

    // Total de usuarios
    User.countDocuments(),

    // Total de categorías
    Category.countDocuments(),

    // Fotos por visibilidad
    Photo.aggregate([
      { $group: { _id: '$visibility', count: { $sum: 1 } } },
      { $project: { visibility: '$_id', count: 1, _id: 0 } }
    ]),

    // Fotos por mes (últimos 12 meses)
    Photo.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          date: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $toString: '$_id.month' }
            ]
          },
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 categorías más usadas
    Photo.aggregate([
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $project: {
          name: '$categoryInfo.name',
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 cámaras más usadas
    Photo.aggregate([
      { $match: { 'metadata.camera': { $exists: true, $ne: null } } },
      { $group: { _id: '$metadata.camera', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { camera: '$_id', count: 1, _id: 0 } }
    ])
  ]);

  // Formatear datos para respuesta
  return {
    counts: {
      photos: totalPhotos,
      users: totalUsers,
      categories: totalCategories
    },
    distribution: {
      byVisibility: photosByVisibility,
      byMonth: photosByMonth
    },
    top: {
      categories: topCategories,
      cameras: topCameras
    },
    lastUpdated: new Date()
  };
};

/**
 * Obtiene estadísticas para un usuario específico
 */
exports.getUserStats = async (userId) => {
  // Ejecutar consultas en paralelo
  const [
    totalPhotos,
    photosByVisibility,
    photosByMonth,
    topCategories,
    topLocations
  ] = await Promise.all([
    // Total de fotos del usuario
    Photo.countDocuments({ uploader: userId }),

    // Fotos por visibilidad
    Photo.aggregate([
      { $match: { uploader: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$visibility', count: { $sum: 1 } } },
      { $project: { visibility: '$_id', count: 1, _id: 0 } }
    ]),

    // Fotos por mes (últimos 12 meses)
    Photo.aggregate([
      {
        $match: {
          uploader: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      {
        $project: {
          date: {
            $concat: [
              { $toString: '$_id.year' },
              '-',
              { $toString: '$_id.month' }
            ]
          },
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 categorías más usadas por el usuario
    Photo.aggregate([
      { $match: { uploader: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $project: {
          name: '$categoryInfo.name',
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 ubicaciones más fotografiadas
    Photo.aggregate([
      {
        $match: {
          uploader: new mongoose.Types.ObjectId(userId),
          'location.name': { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$location.name', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { location: '$_id', count: 1, _id: 0 } }
    ])
  ]);

  // Formatear datos para respuesta
  return {
    counts: {
      photos: totalPhotos
    },
    distribution: {
      byVisibility: photosByVisibility,
      byMonth: photosByMonth
    },
    top: {
      categories: topCategories,
      locations: topLocations
    },
    lastUpdated: new Date()
  };
}; 