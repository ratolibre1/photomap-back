const { success } = require('../utils/responseFormatter');
const Country = require('../models/Country');
const Region = require('../models/Region');
const County = require('../models/County');
const City = require('../models/City');

/**
 * Lista todos los países disponibles
 */
exports.getCountries = async (req, res, next) => {
  try {
    const countries = await Country.find()
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
exports.getRegions = async (req, res, next) => {
  try {
    const filter = {};

    // Filtrar por país si se proporciona un ID
    if (req.query.countryId) {
      filter.countryId = req.query.countryId;
    }

    const regions = await Region.find(filter)
      .select('_id name countryId')
      .collation({ locale: 'es' })
      .sort('name');

    return success(res, regions);
  } catch (error) {
    next(error);
  }
};

/**
 * Lista condados, con filtros opcionales
 */
exports.getCounties = async (req, res, next) => {
  try {
    const filter = {};

    // Aplicar filtros si se proporcionan
    if (req.query.countryId) {
      filter.countryId = req.query.countryId;
    }

    if (req.query.regionId) {
      filter.regionId = req.query.regionId;
    }

    const counties = await County.find(filter)
      .select('_id name countryId regionId')
      .collation({ locale: 'es' })
      .sort('name');

    return success(res, counties);
  } catch (error) {
    next(error);
  }
};

/**
 * Lista ciudades, con filtros opcionales
 */
exports.getCities = async (req, res, next) => {
  try {
    const filter = {};

    // Aplicar filtros si se proporcionan
    if (req.query.countryId) {
      filter.countryId = req.query.countryId;
    }

    if (req.query.regionId) {
      filter.regionId = req.query.regionId;
    }

    if (req.query.countyId) {
      filter.countyId = req.query.countyId;
    }

    const cities = await City.find(filter)
      .select('_id name countryId regionId countyId')
      .collation({ locale: 'es' })
      .sort('name');

    return success(res, cities);
  } catch (error) {
    next(error);
  }
}; 