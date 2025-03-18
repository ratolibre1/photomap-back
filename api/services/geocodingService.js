const axios = require('axios');
const { OPENCAGE_API_KEY } = require('../../config/env');
const Photo = require('../models/Photo');
const Country = require('../models/Country');
const Region = require('../models/Region');
const County = require('../models/County');
const City = require('../models/City');

/**
 * Obtiene información de ubicación a partir de coordenadas
 * @param {Number} lat - Latitud
 * @param {Number} lon - Longitud
 * @returns {Promise<Object>} - Datos de la ubicación
 */
exports.getLocationInfo = async (lat, lon) => {
  try {
    console.log(`Obteniendo información para coordenadas: ${lat}, ${lon}`);

    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      {
        headers: {
          'User-Agent': 'PhotoMap App (desarrollo/testing)'
        }
      }
    );

    // Depuración para ver la respuesta completa
    console.log('Respuesta de Nominatim:', JSON.stringify(response.data.address));

    // Extraer datos de forma más robusta
    const address = response.data.address || {};

    // Mejorar la extracción de la "ciudad" para incluir más tipos de localidades
    const cityLevel = address.city || address.town || address.village || address.hamlet ||
      address.suburb || address.neighbourhood || address.locality || '';

    // Crear objeto de retorno con valores predeterminados vacíos
    const locationInfo = {
      country: address.country || '',
      region: address.state || address.region || '',
      county: address.county || '',
      city: cityLevel,
      displayName: response.data.display_name || `${lat}, ${lon}`,
      raw: address // Guardar la respuesta completa para debugging
    };

    console.log('Datos de ubicación extraídos:', locationInfo);
    return locationInfo;
  } catch (error) {
    console.error('Error obteniendo datos de ubicación:', error);
    return null;
  }
};

/**
 * Función auxiliar para encontrar o crear un país
 */
async function findOrCreateCountry(countryName) {
  if (!countryName) return null;

  try {
    let country = await Country.findOne({ name: countryName });

    if (!country) {
      country = await Country.create({ name: countryName });
      console.log(`País creado: ${countryName}`);
    }

    return country._id;
  } catch (error) {
    console.error(`Error al crear/encontrar país ${countryName}:`, error);
    return null;
  }
}

/**
 * Función auxiliar para encontrar o crear una región
 */
async function findOrCreateRegion(regionName, countryId) {
  if (!regionName || !countryId) return null;

  try {
    let region = await Region.findOne({
      name: regionName,
      countryId: countryId
    });

    if (!region) {
      region = await Region.create({
        name: regionName,
        countryId: countryId
      });
      console.log(`Región creada: ${regionName}`);
    }

    return region._id;
  } catch (error) {
    console.error(`Error al crear/encontrar región ${regionName}:`, error);
    return null;
  }
}

/**
 * Función auxiliar para encontrar o crear un condado
 */
async function findOrCreateCounty(countyName, regionId, countryId) {
  if (!countyName || !regionId || !countryId) return null;

  try {
    let county = await County.findOne({
      name: countyName,
      regionId: regionId
    });

    if (!county) {
      county = await County.create({
        name: countyName,
        regionId: regionId,
        countryId: countryId
      });
      console.log(`Condado creado: ${countyName}`);
    }

    return county._id;
  } catch (error) {
    console.error(`Error al crear/encontrar condado ${countyName}:`, error);
    return null;
  }
}

/**
 * Función auxiliar para encontrar o crear una ciudad
 */
async function findOrCreateCity(cityName, countyId, regionId, countryId) {
  if (!cityName || !countyId || !regionId || !countryId) return null;

  try {
    let city = await City.findOne({
      name: cityName,
      countyId: countyId
    });

    if (!city) {
      city = await City.create({
        name: cityName,
        countyId: countyId,
        regionId: regionId,
        countryId: countryId
      });
      console.log(`Ciudad creada: ${cityName}`);
    }

    return city._id;
  } catch (error) {
    console.error(`Error al crear/encontrar ciudad ${cityName}:`, error);
    return null;
  }
}

/**
 * Geocodificación inversa para una coordenada
 */
exports.reverseGeocode = async (lat, lng) => {
  try {
    // Usar Nominatim (gratuito, sin API key)
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      {
        headers: {
          'User-Agent': 'PhotoMap App (desarrollo/testing)'
        }
      }
    );

    if (response.data) {
      const address = response.data.address || {};

      // Extraer datos
      const country = address.country;
      const region = address.state || address.region;
      const county = address.county;
      const city = address.city || address.town || address.village;

      // Crear o encontrar las entidades en la BD
      const countryId = await findOrCreateCountry(country);
      const regionId = await findOrCreateRegion(region, countryId);
      const countyId = await findOrCreateCounty(county, regionId, countryId);
      const cityId = await findOrCreateCity(city, countyId, regionId, countryId);

      console.log('Datos de ubicación extraídos:', {
        country,
        region,
        county,
        city,
        displayName: response.data.display_name,
      });

      // Construir respuesta
      return {
        address: {
          country,
          region,
          county,
          city,
          displayName: response.data.display_name,
          countryId,
          regionId,
          countyId,
          cityId
        },
        coordinates: {
          lat: parseFloat(lat),
          lng: parseFloat(lng)
        }
      };
    }

    throw new Error('No se encontraron resultados para estas coordenadas');
  } catch (error) {
    console.error('Error en reverseGeocode:', error);
    throw error;
  }
};

/**
 * Geocodifica fotos pendientes en batch
 */
exports.processPendingPhotos = async (options = {}) => {
  // Límite por defecto
  const limit = options.limit || 100;

  // Filtro base para fotos con coordenadas válidas
  const filter = {
    'location.coordinates.0': { $ne: 0 },
    'location.coordinates.1': { $ne: 0 }
  };

  // Si no se fuerza, solo procesar las pendientes/fallidas
  if (!options.force) {
    filter.$or = [
      { geocodingStatus: { $in: ['pending', 'failed'] } },
      { geocodingStatus: { $exists: false } },
      { geocodingStatus: null }
    ];
  }

  // Filtrar por usuario si se especifica
  if (options.userId) {
    filter.userId = options.userId;
  }

  // Filtrar por estado específico si se proporciona
  if (options.status) {
    filter.geocodingStatus = options.status;
  }

  // Buscar fotos que cumplan los criterios
  const photos = await Photo.find(filter).limit(limit);

  console.log(`Encontradas ${photos.length} fotos para geocodificar`);

  // Iniciar procesamiento
  let processed = 0;
  let errors = 0;

  for (const photo of photos) {
    try {
      // Marcar como en procesamiento
      photo.geocodingStatus = 'processing';
      await photo.save();

      // Obtener coordenadas de la foto
      const [lng, lat] = photo.location.coordinates;

      // Realizar geocodificación inversa
      const geocodeResult = await exports.reverseGeocode(lat, lng);

      // Actualizar foto con los resultados
      photo.geocodingDetails = {
        displayName: geocodeResult.address.displayName,
        countryId: geocodeResult.address.countryId,
        regionId: geocodeResult.address.regionId,
        countyId: geocodeResult.address.countyId,
        cityId: geocodeResult.address.cityId,
        updatedAt: new Date()
      };

      photo.geocodingStatus = 'completed';
      await photo.save();

      processed++;
    } catch (error) {
      console.error(`Error geocodificando foto ${photo._id}:`, error);
      photo.geocodingStatus = 'failed';
      await photo.save();
      errors++;
    }
  }

  return {
    totalProcessed: processed,
    totalErrors: errors,
    totalFound: photos.length
  };
}; 