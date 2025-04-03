const axios = require('axios');
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
async function findOrCreateCountry(countryName, userId) {
  if (!countryName) return null;
  if (!userId) {
    console.error('Se intentó crear/encontrar un país sin userId');
    return null;
  }

  try {
    console.log(`Buscando país: "${countryName}" para usuario: ${userId}`);
    let country = await Country.findOne({
      name: countryName,
      userId: userId
    });

    if (!country) {
      console.log(`País no encontrado, creando: "${countryName}"`);
      country = await Country.create({
        name: countryName,
        userId: userId
      });
      console.log(`País creado con ID: ${country._id}`);
    } else {
      console.log(`País encontrado con ID: ${country._id}`);
    }

    // Verificar explícitamente si se creó/encontró correctamente
    if (!country || !country._id) {
      console.error(`Algo salió mal, el país no tiene ID: ${JSON.stringify(country)}`);
      return null;
    }

    return country;
  } catch (error) {
    console.error(`Error al crear/encontrar país ${countryName}:`, error);
    return null;
  }
}

/**
 * Función auxiliar para encontrar o crear una región
 */
async function findOrCreateRegion(regionName, countryId, userId) {
  if (!regionName || !countryId) return null;
  if (!userId) {
    console.error('Se intentó crear/encontrar una región sin userId');
    return null;
  }

  try {
    console.log(`Buscando región: "${regionName}" para usuario: ${userId}`);
    let region = await Region.findOne({
      name: regionName,
      countryId: countryId,
      userId: userId
    });

    if (!region) {
      console.log(`Región no encontrada, creando: "${regionName}"`);
      region = await Region.create({
        name: regionName,
        countryId: countryId,
        userId: userId
      });
      console.log(`Región creada con ID: ${region._id}`);
    } else {
      console.log(`Región encontrada con ID: ${region._id}`);
    }

    // Verificar explícitamente si se creó/encontró correctamente
    if (!region || !region._id) {
      console.error(`Algo salió mal, la región no tiene ID: ${JSON.stringify(region)}`);
      return null;
    }

    return region;
  } catch (error) {
    console.error(`Error al crear/encontrar región ${regionName}:`, error);
    return null;
  }
}

/**
 * Función auxiliar para encontrar o crear un condado
 */
async function findOrCreateCounty(countyName, regionId, countryId, userId) {
  if (!countyName || !regionId || !countryId) return null;
  if (!userId) {
    console.error('Se intentó crear/encontrar un condado sin userId');
    return null;
  }

  try {
    console.log(`Buscando condado: "${countyName}" para usuario: ${userId}`);
    let county = await County.findOne({
      name: countyName,
      regionId: regionId,
      userId: userId
    });

    if (!county) {
      console.log(`Condado no encontrado, creando: "${countyName}"`);
      county = await County.create({
        name: countyName,
        regionId: regionId,
        countryId: countryId,
        userId: userId
      });
      console.log(`Condado creado con ID: ${county._id}`);
    } else {
      console.log(`Condado encontrado con ID: ${county._id}`);
    }

    // Verificar explícitamente si se creó/encontró correctamente
    if (!county || !county._id) {
      console.error(`Algo salió mal, el condado no tiene ID: ${JSON.stringify(county)}`);
      return null;
    }

    return county;
  } catch (error) {
    console.error(`Error al crear/encontrar condado ${countyName}:`, error);
    return null;
  }
}

/**
 * Función auxiliar para encontrar o crear una ciudad
 */
async function findOrCreateCity(cityName, countyId, regionId, countryId, userId) {
  if (!cityName || !countyId || !regionId || !countryId) return null;
  if (!userId) {
    console.error('Se intentó crear/encontrar una ciudad sin userId');
    return null;
  }

  try {
    console.log(`Buscando ciudad: "${cityName}" para usuario: ${userId}`);
    let city = await City.findOne({
      name: cityName,
      countyId: countyId,
      userId: userId
    });

    if (!city) {
      console.log(`Ciudad no encontrada, creando: "${cityName}"`);
      city = await City.create({
        name: cityName,
        countyId: countyId,
        regionId: regionId,
        countryId: countryId,
        userId: userId
      });
      console.log(`Ciudad creada con ID: ${city._id}`);
    } else {
      console.log(`Ciudad encontrada con ID: ${city._id}`);
    }

    // Verificar explícitamente si se creó/encontró correctamente
    if (!city || !city._id) {
      console.error(`Algo salió mal, la ciudad no tiene ID: ${JSON.stringify(city)}`);
      return null;
    }

    return city;
  } catch (error) {
    console.error(`Error al crear/encontrar ciudad ${cityName}:`, error);
    return null;
  }
}

/**
 * Geocodificación inversa para una coordenada
 */
exports.reverseGeocode = async (coordinates, photo) => {
  try {
    // Volver al formato JSON estándar 
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinates[0]}&lon=${coordinates[1]}&zoom=10`,
      {
        headers: {
          'User-Agent': 'PhotoMap App (desarrollo/testing)'
        }
      }
    );

    if (response.data) {
      // Extraer datos de ubicación con mejor manejo de países
      const { countryName, regionName, countyName, cityName, displayName } = parseLocationFromNominatim(response.data);

      // Verificar que tenemos userId antes de continuar
      if (!photo.userId) {
        console.error(`La foto ${photo._id} no tiene userId, no se pueden crear entidades geográficas`);
        return {
          displayName: displayName || `${coordinates[0]}, ${coordinates[1]}`,
          raw: response.data.address || {}
        };
      }

      console.log('Datos extraídos:', { countryName, regionName, countyName, cityName });

      // Mejorar manejo de errores para country
      let countryObj = null;
      if (countryName) {
        try {
          countryObj = await findOrCreateCountry(countryName, photo.userId);
          console.log(`País obtenido/creado: ${countryName}`, countryObj?._id);
        } catch (err) {
          console.error(`Error al procesar país ${countryName}:`, err);
        }
      }

      // Mejorar manejo de errores para region
      let regionObj = null;
      if (regionName) {
        try {
          const countryIdToUse = countryObj ? countryObj._id : null;
          if (countryIdToUse) {
            regionObj = await findOrCreateRegion(regionName, countryIdToUse, photo.userId);
          } else {
            console.log(`No se pudo crear región ${regionName} porque falta el país`);
          }
          console.log(`Región obtenida/creada: ${regionName}`, regionObj?._id);
        } catch (err) {
          console.error(`Error al procesar región ${regionName}:`, err);
        }
      }

      // Mejorar manejo de errores para county
      let countyObj = null;
      if (countyName) {
        try {
          const regionIdToUse = regionObj ? regionObj._id : null;
          const countryIdToUse = countryObj ? countryObj._id : null;
          if (regionIdToUse && countryIdToUse) {
            countyObj = await findOrCreateCounty(countyName, regionIdToUse, countryIdToUse, photo.userId);
          } else {
            console.log(`No se pudo crear condado ${countyName} porque faltan región o país`);
          }
          console.log(`Condado obtenido/creado: ${countyName}`, countyObj?._id);
        } catch (err) {
          console.error(`Error al procesar condado ${countyName}:`, err);
        }
      }

      // Mejorar manejo de errores para city
      let cityObj = null;
      if (cityName && countyObj && regionObj && countryObj) {
        try {
          cityObj = await findOrCreateCity(cityName, countyObj._id, regionObj._id, countryObj._id, photo.userId);
          console.log(`Ciudad obtenida/creada: ${cityName}`, cityObj?._id);
        } catch (err) {
          console.error(`Error al procesar ciudad ${cityName}:`, err);
        }
      }

      console.log('Datos de ubicación extraídos:', {
        country: countryObj,
        region: regionObj,
        county: countyObj,
        city: cityObj,
        displayName: displayName,
        savedCountry: countryObj?._id || null,
        savedRegion: regionObj?._id || null,
        savedCounty: countyObj?._id || null,
        savedCity: cityObj?._id || null
      });

      // Construir respuesta
      const result = {
        country: countryObj,
        region: regionObj,
        county: countyObj,
        city: cityObj,
        displayName: displayName,
        raw: response.data.address || {} // Guardar la respuesta completa para debugging
      };

      return result;
    }

    throw new Error('No se encontraron resultados para estas coordenadas');
  } catch (error) {
    console.error(`Error en reverseGeocode para coordenadas ${coordinates}:`, error);
    throw error;
  }
};

/**
 * Geocodifica fotos pendientes en batch
 */
exports.processPendingPhotos = async (options = {}) => {
  try {
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

        console.log(`Procesando foto ${photo._id} con coordenadas: [${lat}, ${lng}]`);
        console.log(`Usuario de la foto: ${photo.userId}`);

        // Realizar geocodificación inversa
        const geocodeResult = await exports.reverseGeocode([lat, lng], photo);

        // Verificar qué datos devolvió reverseGeocode
        console.log('Resultado de geocodificación:', JSON.stringify({
          country: geocodeResult.country ? { id: geocodeResult.country._id, name: geocodeResult.country.name } : null,
          region: geocodeResult.region ? { id: geocodeResult.region._id, name: geocodeResult.region.name } : null,
          county: geocodeResult.county ? { id: geocodeResult.county._id, name: geocodeResult.county.name } : null,
          city: geocodeResult.city ? { id: geocodeResult.city._id, name: geocodeResult.city.name } : null
        }));

        // Crear objeto de geocodingDetails con valores por defecto
        const geocodingDetails = {
          displayName: geocodeResult.displayName || 'Ubicación desconocida',
          countryId: null,
          regionId: null,
          countyId: null,
          cityId: null,
          updatedAt: new Date()
        };

        // Asignar IDs solo si los objetos existen
        if (geocodeResult.country && geocodeResult.country._id) {
          geocodingDetails.countryId = geocodeResult.country._id;
          console.log(`✅ Asignando countryId: ${geocodeResult.country._id}`);
        } else {
          console.log('❌ No se pudo asignar countryId, es null o undefined');
          console.log('geocodeResult.country:', geocodeResult.country);
        }

        if (geocodeResult.region && geocodeResult.region._id) {
          geocodingDetails.regionId = geocodeResult.region._id;
          console.log(`✅ Asignando regionId: ${geocodeResult.region._id}`);
        }

        if (geocodeResult.county && geocodeResult.county._id) {
          geocodingDetails.countyId = geocodeResult.county._id;
          console.log(`✅ Asignando countyId: ${geocodeResult.county._id}`);
        }

        if (geocodeResult.city && geocodeResult.city._id) {
          geocodingDetails.cityId = geocodeResult.city._id;
          console.log(`✅ Asignando cityId: ${geocodeResult.city._id}`);
        }

        // Asignar a la foto y guardar estado
        photo.geocodingDetails = geocodingDetails;
        console.log('Guardando geocodingDetails:', JSON.stringify(geocodingDetails));

        photo.geocodingStatus = 'completed';
        await photo.save();

        // Verificar qué se guardó realmente
        const savedPhoto = await Photo.findById(photo._id);
        console.log('GeocodingDetails GUARDADOS:', JSON.stringify(savedPhoto.geocodingDetails));

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
  } catch (error) {
    console.error('Error procesando fotos pendientes:', error);
    return {
      totalProcessed: 0,
      totalErrors: 0,
      totalFound: 0
    };
  }
};

function parseLocationFromNominatim(data) {
  // 1. Primero detectar qué formato tenemos
  if (data.type === 'FeatureCollection' && data.features && data.features.length > 0) {
    const geocoding = data.features[0]?.properties?.geocoding;
    if (geocoding) {
      console.log('Procesando respuesta GeoCodeJSON');
      return {
        countryName: geocoding.country,
        regionName: geocoding.state || geocoding.admin?.level4,
        countyName: geocoding.county || geocoding.admin?.level6,
        cityName: geocoding.name || geocoding.admin?.level8,
        displayName: geocoding.label
      };
    }
  }

  // 2. Formato JSON estándar - Con mejor manejo de países
  console.log('Procesando respuesta JSON estándar');
  const address = data.address || {};

  // Extraer país (casi siempre igual en todos lados)
  const countryName = address.country;

  // Extraer ciudad (varía según país y tipo de asentamiento)
  const cityName = address.city || address.town || address.village ||
    address.hamlet || address.suburb || address.neighbourhood ||
    data.name; // En algunos casos el nombre principal es la ciudad

  // Para región y provincia necesitamos lógica específica por país
  let regionName, countyName;

  // Varios países latinoamericanos usan este patrón
  if (address.country_code === 'pe' || address.country_code === 'cl' ||
    address.country_code === 'ar' || address.country_code === 'co') {
    regionName = address.state;           // Departamento/Provincia/Región 
    countyName = address.region;          // Provincia/Departamento
  }
  // EEUU y otros países con organización similar
  else if (address.country_code === 'us' || address.country_code === 'ca') {
    regionName = address.state;           // Estado/Provincia
    countyName = address.county;          // Condado
  }
  // Europa y general
  else {
    regionName = address.state || address.province || address.region ||
      address.county_division;
    countyName = address.county || address.district || address.municipality;
  }

  // Loguear para análisis y depuración
  console.log(`País detectado: ${countryName} (${address.country_code})`);
  console.log(`Estructura extraída: Región=${regionName}, Provincia=${countyName}, Ciudad=${cityName}`);

  return {
    countryName,
    regionName,
    countyName,
    cityName,
    displayName: data.display_name
  };
} 