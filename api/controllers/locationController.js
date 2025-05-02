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
    const countries = await Country.find({ userId: req.user.id, visible: true })
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

    let query = { userId, visible: true };

    if (countryId) {
      const country = await Country.findOne({ _id: countryId, userId, visible: true });
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

    let query = { userId, visible: true };

    if (regionId) {
      const region = await Region.findOne({ _id: regionId, userId, visible: true });
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

    let query = { userId, visible: true };

    if (countyId) {
      const county = await County.findOne({ _id: countyId, userId, visible: true });
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

/**
 * Retorna la estructura jerárquica completa de ubicaciones
 * en formato de árbol anidado (países -> regiones -> provincias -> ciudades)
 * incluyendo el contador de fotos para cada ubicación
 */
const getLocationTree = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Obtener todos los elementos de ubicación para este usuario
    const countries = await Country.find({ userId }).lean();
    const regions = await Region.find({ userId }).lean();
    const counties = await County.find({ userId }).lean();
    const cities = await City.find({ userId }).lean();

    // Obtener conteo de fotos por ubicación
    const Photo = require('../models/Photo');

    // Obtener conteo de fotos por país
    const countryPhotoCounts = await Photo.aggregate([
      { $match: { userId: userId } },
      { $group: { _id: '$geocodingDetails.countryId', count: { $sum: 1 } } }
    ]);

    // Obtener conteo de fotos por región
    const regionPhotoCounts = await Photo.aggregate([
      { $match: { userId: userId } },
      { $group: { _id: '$geocodingDetails.regionId', count: { $sum: 1 } } }
    ]);

    // Obtener conteo de fotos por provincia
    const countyPhotoCounts = await Photo.aggregate([
      { $match: { userId: userId } },
      { $group: { _id: '$geocodingDetails.countyId', count: { $sum: 1 } } }
    ]);

    // Obtener conteo de fotos por ciudad
    const cityPhotoCounts = await Photo.aggregate([
      { $match: { userId: userId } },
      { $group: { _id: '$geocodingDetails.cityId', count: { $sum: 1 } } }
    ]);

    // Crear mapas de búsqueda rápida para los conteos
    const countryCountMap = new Map(countryPhotoCounts.map(item => [item._id?.toString(), item.count]));
    const regionCountMap = new Map(regionPhotoCounts.map(item => [item._id?.toString(), item.count]));
    const countyCountMap = new Map(countyPhotoCounts.map(item => [item._id?.toString(), item.count]));
    const cityCountMap = new Map(cityPhotoCounts.map(item => [item._id?.toString(), item.count]));

    // Construir el árbol comenzando con los países como raíz
    const locationTree = countries.map(country => {
      // Filtrar regiones que pertenecen a este país
      const countryRegions = regions.filter(region =>
        region.countryId && region.countryId.toString() === country._id.toString()
      );

      // Agregar regiones como hijos del país
      const regionsWithChildren = countryRegions.map(region => {
        // Filtrar provincias que pertenecen a esta región
        const regionCounties = counties.filter(county =>
          county.regionId && county.regionId.toString() === region._id.toString()
        );

        // Agregar provincias como hijos de la región
        const countiesWithChildren = regionCounties.map(county => {
          // Filtrar ciudades que pertenecen a esta provincia
          const countyCity = cities.filter(city =>
            city.countyId && city.countyId.toString() === county._id.toString()
          );

          // Retornar la provincia con sus ciudades hijas
          return {
            _id: county._id,
            name: county.name,
            visible: county.visible === undefined ? true : !!county.visible,
            photoCount: countyCountMap.get(county._id.toString()) || 0,
            cities: countyCity.map(city => ({
              _id: city._id,
              name: city.name,
              visible: city.visible === undefined ? true : !!city.visible,
              photoCount: cityCountMap.get(city._id.toString()) || 0
            }))
          };
        });

        // Retornar la región con sus provincias hijas
        return {
          _id: region._id,
          name: region.name,
          visible: region.visible === undefined ? true : !!region.visible,
          photoCount: regionCountMap.get(region._id.toString()) || 0,
          counties: countiesWithChildren
        };
      });

      // Retornar el país con sus regiones hijas
      return {
        _id: country._id,
        name: country.name,
        visible: country.visible === undefined ? true : !!country.visible,
        photoCount: countryCountMap.get(country._id.toString()) || 0,
        regions: regionsWithChildren
      };
    });

    return success(res, locationTree);
  } catch (error) {
    console.error('Error al obtener árbol de ubicaciones:', error);
    next(error);
  }
};

/**
 * Inicializa el estado de visibilidad de todas las ubicaciones
 * basándose en si tienen fotos asociadas o no
 */
const initializeLocationVisibility = async (req, res, next) => {
  try {
    // Verificar que el usuario sea administrador
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
    }

    const userId = req.user._id;
    const locationService = require('../services/locationService');
    const Photo = require('../models/Photo');

    // 1. Obtener recuentos de fotos por ubicación
    const countryPhotoCounts = await Photo.aggregate([
      { $group: { _id: '$geocodingDetails.countryId', count: { $sum: 1 } } }
    ]);

    const regionPhotoCounts = await Photo.aggregate([
      { $group: { _id: '$geocodingDetails.regionId', count: { $sum: 1 } } }
    ]);

    const countyPhotoCounts = await Photo.aggregate([
      { $group: { _id: '$geocodingDetails.countyId', count: { $sum: 1 } } }
    ]);

    const cityPhotoCounts = await Photo.aggregate([
      { $group: { _id: '$geocodingDetails.cityId', count: { $sum: 1 } } }
    ]);

    // 2. Crear mapas para búsqueda rápida
    const countryCountMap = new Map(countryPhotoCounts.map(item => [item._id?.toString(), item.count]));
    const regionCountMap = new Map(regionPhotoCounts.map(item => [item._id?.toString(), item.count]));
    const countyCountMap = new Map(countyPhotoCounts.map(item => [item._id?.toString(), item.count]));
    const cityCountMap = new Map(cityPhotoCounts.map(item => [item._id?.toString(), item.count]));

    // 3. Actualizar países
    const countries = await Country.find();
    let countriesUpdated = 0;

    for (const country of countries) {
      const photoCount = countryCountMap.get(country._id.toString()) || 0;
      const shouldBeVisible = photoCount > 0;

      // Forzar actualización de todas las ubicaciones
      country.visible = shouldBeVisible;
      await country.save();
      countriesUpdated++;
    }

    // 4. Actualizar regiones
    const regions = await Region.find();
    let regionsUpdated = 0;

    for (const region of regions) {
      const photoCount = regionCountMap.get(region._id.toString()) || 0;
      const shouldBeVisible = photoCount > 0;

      // Forzar actualización de todas las ubicaciones
      region.visible = shouldBeVisible;
      await region.save();
      regionsUpdated++;
    }

    // 5. Actualizar provincias
    const counties = await County.find();
    let countiesUpdated = 0;

    for (const county of counties) {
      const photoCount = countyCountMap.get(county._id.toString()) || 0;
      const shouldBeVisible = photoCount > 0;

      // Forzar actualización de todas las ubicaciones
      county.visible = shouldBeVisible;
      await county.save();
      countiesUpdated++;
    }

    // 6. Actualizar ciudades
    const cities = await City.find();
    let citiesUpdated = 0;

    for (const city of cities) {
      const photoCount = cityCountMap.get(city._id.toString()) || 0;
      const shouldBeVisible = photoCount > 0;

      // Forzar actualización de todas las ubicaciones
      city.visible = shouldBeVisible;
      await city.save();
      citiesUpdated++;
    }

    return success(res, {
      message: 'Visibilidad de ubicaciones inicializada correctamente',
      stats: {
        countries: { total: countries.length, updated: countriesUpdated },
        regions: { total: regions.length, updated: regionsUpdated },
        counties: { total: counties.length, updated: countiesUpdated },
        cities: { total: cities.length, updated: citiesUpdated }
      }
    });
  } catch (error) {
    console.error('Error al inicializar visibilidad de ubicaciones:', error);
    next(error);
  }
};

// Ahora sí puedes exportarlas todas juntas
module.exports = {
  getCountries,
  getRegions,
  getCounties,
  getCities,
  getLocationTree,
  initializeLocationVisibility
}; 