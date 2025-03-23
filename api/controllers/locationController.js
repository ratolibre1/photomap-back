const { success } = require('../utils/responseFormatter');
const Country = require('../models/Country');
const Region = require('../models/Region');
const County = require('../models/County');
const City = require('../models/City');

/**
 * Lista todos los países disponibles
 */
const getCountries = async (req, res, next) => {
  try {
    const countries = await Country.find({ userId: req.user.id })
      .select('_id name')
      .collation({ locale: 'es' })
      .sort('name');

    return success(res, countries);
  } catch (error) {
    next(error);
  }
};

/**
 * Lista regiones, opcionalmente filtradas por país
 */
const getRegions = async (req, res, next) => {
  try {
    const { countryId } = req.query;
    const userId = req.user._id;

    let query = { userId };

    if (countryId) {
      const country = await Country.findOne({ _id: countryId, userId });
      if (!country) {
        return res.status(404).json({ message: 'País no encontrado' });
      }
      query.countryId = countryId;
    }

    const regions = await Region.find(query).sort({ name: 1 });

    return success(res, regions);
  } catch (error) {
    console.error('Error al obtener regiones:', error);
    next(error);
  }
};

/**
 * Lista condados, con filtros opcionales
 */
const getCounties = async (req, res, next) => {
  try {
    const { regionId } = req.query;
    const userId = req.user._id;

    let query = { userId };

    if (regionId) {
      const region = await Region.findOne({ _id: regionId, userId });
      if (!region) {
        return res.status(404).json({ message: 'Región no encontrada' });
      }
      query.regionId = regionId;
    }

    const counties = await County.find(query).sort({ name: 1 });

    return success(res, counties);
  } catch (error) {
    console.error('Error al obtener provincias:', error);
    next(error);
  }
};

/**
 * Lista ciudades, con filtros opcionales
 */
const getCities = async (req, res, next) => {
  try {
    const { countyId } = req.query;
    const userId = req.user._id;

    let query = { userId };

    if (countyId) {
      const county = await County.findOne({ _id: countyId, userId });
      if (!county) {
        return res.status(404).json({ message: 'Provincia no encontrada' });
      }
      query.countyId = countyId;
    }

    const cities = await City.find(query).sort({ name: 1 });

    return success(res, cities);
  } catch (error) {
    console.error('Error al obtener ciudades:', error);
    next(error);
  }
};

// Ahora sí puedes exportarlas todas juntas
module.exports = {
  getCountries,
  getRegions,
  getCounties,
  getCities
}; 