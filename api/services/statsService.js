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
    topCountries,
    topRegions,
    topCounties,
    topCities,
    topLabels
  ] = await Promise.all([
    // Total de fotos del usuario
    Photo.countDocuments({ userId }),

    // Fotos por visibilidad (público/privado)
    Photo.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$isPublic', count: { $sum: 1 } } },
      {
        $project: {
          visibility: {
            $cond: { if: '$_id', then: 'Público', else: 'Privado' }
          },
          count: 1,
          _id: 0
        }
      }
    ]),

    // Fotos por mes (últimos 12 meses)
    Photo.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
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
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
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

    // Top 5 países
    Photo.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          'geocodingDetails.countryId': { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$geocodingDetails.countryId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'countries',
          localField: '_id',
          foreignField: '_id',
          as: 'countryInfo'
        }
      },
      { $unwind: '$countryInfo' },
      {
        $project: {
          name: '$countryInfo.name',
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 regiones
    Photo.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          'geocodingDetails.regionId': { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$geocodingDetails.regionId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'regions',
          localField: '_id',
          foreignField: '_id',
          as: 'regionInfo'
        }
      },
      { $unwind: '$regionInfo' },
      {
        $project: {
          name: '$regionInfo.name',
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 provincias
    Photo.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          'geocodingDetails.countyId': { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$geocodingDetails.countyId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'counties',
          localField: '_id',
          foreignField: '_id',
          as: 'countyInfo'
        }
      },
      { $unwind: '$countyInfo' },
      {
        $project: {
          name: '$countyInfo.name',
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 ciudades
    Photo.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          'geocodingDetails.cityId': { $exists: true, $ne: null }
        }
      },
      { $group: { _id: '$geocodingDetails.cityId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'cities',
          localField: '_id',
          foreignField: '_id',
          as: 'cityInfo'
        }
      },
      { $unwind: '$cityInfo' },
      {
        $project: {
          name: '$cityInfo.name',
          count: 1,
          _id: 0
        }
      }
    ]),

    // Top 5 etiquetas
    Photo.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$labels' },
      { $group: { _id: '$labels', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'labels',
          localField: '_id',
          foreignField: '_id',
          as: 'labelInfo'
        }
      },
      { $unwind: '$labelInfo' },
      {
        $project: {
          name: '$labelInfo.name',
          count: 1,
          _id: 0
        }
      }
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
      countries: topCountries,
      regions: topRegions,
      counties: topCounties,
      cities: topCities,
      labels: topLabels
    },
    lastUpdated: new Date()
  };
}; 