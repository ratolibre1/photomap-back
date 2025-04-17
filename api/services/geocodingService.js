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
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 5000; // 5 segundos de timeout
  const RETRY_DELAY_MS = 2000; // 2 segundos entre reintentos

  // Función para esperar un tiempo determinado
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      console.log(`Intento ${attempt}/${MAX_RETRIES} de geocodificación para coordenadas [${coordinates[0]}, ${coordinates[1]}]`);

      // Volver al formato JSON estándar con timeout
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coordinates[0]}&lon=${coordinates[1]}&zoom=10`,
        {
          headers: {
            'User-Agent': 'PhotoMap App (desarrollo/testing)'
          },
          timeout: TIMEOUT_MS // Agregamos timeout para evitar esperas indefinidas
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
      lastError = error;
      console.error(`Error en intento ${attempt} de reverseGeocode para coordenadas ${coordinates}:`, error.message);

      // Si no es el último intento, esperar antes del siguiente
      if (attempt < MAX_RETRIES) {
        console.log(`Esperando ${RETRY_DELAY_MS / 1000} segundos antes del siguiente intento...`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // Si llegamos aquí, fallaron todos los intentos
  console.error(`Fallaron todos los intentos (${MAX_RETRIES}) de geocodificación. Último error:`, lastError);

  // Devolver un objeto de resultado con información mínima para no romper el flujo
  return {
    displayName: `${coordinates[0]}, ${coordinates[1]}`,
    raw: {},
    error: {
      message: lastError?.message || 'Error desconocido en geocodificación',
      code: lastError?.code || 'UNKNOWN_ERROR'
    }
  };
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

    // Si no se fuerza, solo procesar las pendientes/error
    if (!options.force) {
      filter.$or = [
        { geocodingStatus: { $in: ['pending', 'error'] } },
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
        // Marcar como en procesamiento temporal
        photo.geocodingStatus = 'pending';
        await photo.save();

        // Obtener coordenadas de la foto
        const [lng, lat] = photo.location.coordinates;

        console.log(`Procesando foto ${photo._id} con coordenadas: [${lat}, ${lng}]`);
        console.log(`Usuario de la foto: ${photo.userId}`);

        // Realizar geocodificación inversa
        const geocodeResult = await exports.reverseGeocode([lat, lng], photo);

        // Verificar si hay error en la respuesta (ahora reverseGeocode no lanza excepciones, devuelve un objeto con error)
        if (geocodeResult.error) {
          console.warn(`Advertencia: Geocodificación con errores para foto ${photo._id}: ${geocodeResult.error.message}`);

          // Aunque hubo error, guardamos lo que obtuvimos para no perderlo
          const geocodingDetails = {
            displayName: geocodeResult.displayName || `${lat}, ${lng}`,
            countryId: null,
            regionId: null,
            countyId: null,
            cityId: null,
            updatedAt: new Date(),
            geocodingError: geocodeResult.error.message
          };

          // Actualizar la foto con la información limitada y marcar como procesada con advertencia
          await Photo.findByIdAndUpdate(
            photo._id,
            {
              $set: {
                geocodingDetails: geocodingDetails,
                geocodingStatus: 'completed_with_errors' // Nuevo estado para indicar que se procesó pero con errores
              }
            },
            { new: true }
          );

          errors++;
          continue;
        }

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

        // Asegurarse de que el objeto geocodingDetails sea válido
        console.log('Objeto geocodingDetails completo:', JSON.stringify(geocodingDetails));

        // Guardar usando findByIdAndUpdate para evitar problemas con pre-save hooks
        const updatedPhoto = await Photo.findByIdAndUpdate(
          photo._id,
          {
            $set: {
              geocodingDetails: geocodingDetails,
              geocodingStatus: 'completed'
            }
          },
          { new: true }
        );

        if (!updatedPhoto) {
          console.error(`❌ Error: No se pudo actualizar la foto ${photo._id}`);
          errors++;
          continue;
        }

        // Verificar que se guardó correctamente
        const savedPhoto = await Photo.findById(photo._id);
        console.log('GeocodingDetails GUARDADOS:', JSON.stringify(savedPhoto.geocodingDetails));
        if (!savedPhoto.geocodingDetails) {
          console.error(`❌ Error: geocodingDetails no se guardó en la foto ${photo._id}`);
          photo.geocodingStatus = 'error';
          await Photo.findByIdAndUpdate(photo._id, { geocodingStatus: 'error' });
          errors++;
          continue;
        }

        processed++;
      } catch (error) {
        console.error(`Error geocodificando foto ${photo._id}:`, error);
        photo.geocodingStatus = 'error';
        await Photo.findByIdAndUpdate(photo._id, { geocodingStatus: 'error' });
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
  console.log('Respuesta de Nominatim:', JSON.stringify(data));

  // Caso especial: si ya recibimos un objeto pre-procesado con los campos que necesitamos
  if (data.country && (data.region || data.state) && data.county && (data.city || data.town || data.village)) {
    console.log('Detectada respuesta pre-procesada, usando directamente');
    return {
      countryName: data.country || 'Desconocido',
      regionName: data.region || data.state || 'Desconocido',
      countyName: data.county || 'Desconocido',
      cityName: data.city || data.town || data.village || 'Desconocido',
      displayName: data.displayName || `${data.city || data.town || ''}, ${data.county || ''}, ${data.region || data.state || ''}, ${data.country || ''}`
    };
  }

  // 1. Primero detectar qué formato tenemos
  if (data.type === 'FeatureCollection' && data.features && data.features.length > 0) {
    const geocoding = data.features[0]?.properties?.geocoding;
    if (geocoding) {
      console.log('Procesando respuesta GeoCodeJSON');
      return {
        countryName: geocoding.country || 'Desconocido',
        regionName: geocoding.state || geocoding.admin?.level4 || 'Desconocido',
        countyName: geocoding.county || geocoding.admin?.level6 || 'Desconocido',
        cityName: geocoding.name || geocoding.admin?.level8 || 'Desconocido',
        displayName: geocoding.label || 'Ubicación desconocida'
      };
    }
  }

  // 2. Formato JSON estándar con enfoque universal
  console.log('Procesando respuesta JSON estándar Nominatim');
  const address = data.address || {};

  // Primero obtener todos los campos disponibles para analizar
  console.log('Campos disponibles en respuesta:', Object.keys(address));

  // Extraer país (casi siempre igual en todos lados)
  const countryName = address.country || 'Desconocido';

  // Enfoque universal: recopilar todos los posibles niveles administrativos
  const adminLevels = [];

  // Recopilar todos los campos que parecen ser divisiones administrativas
  for (const key in address) {
    if (key.startsWith('state') ||
      key.startsWith('region') ||
      key.startsWith('province') ||
      key.startsWith('county') ||
      key.startsWith('municipality') ||
      key.startsWith('city') ||
      key.startsWith('town') ||
      key.startsWith('village') ||
      key.startsWith('hamlet') ||
      key.startsWith('district') ||
      key.startsWith('locality') ||
      key.startsWith('suburb')) {

      adminLevels.push({
        name: address[key],
        type: key
      });
    }
  }

  console.log('Niveles administrativos encontrados:', adminLevels);

  // Ordenar por nivel jerárquico aproximado (más grande a más pequeño)
  const hierarchy = [
    'state', 'region', 'province',  // Nivel 1 (Regiones/Estados)
    'county', 'district',           // Nivel 2 (Provincias/Condados)
    'municipality', 'locality',     // Nivel 3 (Municipios)
    'city', 'town', 'village', 'hamlet', 'suburb' // Nivel 4 (Ciudades/Localidades)
  ];

  // Ordenar los niveles según la jerarquía
  adminLevels.sort((a, b) => {
    const aIndex = hierarchy.findIndex(prefix => a.type.startsWith(prefix));
    const bIndex = hierarchy.findIndex(prefix => b.type.startsWith(prefix));
    return aIndex - bIndex;
  });

  console.log('Niveles ordenados jerárquicamente:', adminLevels);

  // Extraer valores según su nivel
  let regionName = 'Desconocido';
  let countyName = 'Desconocido';
  let cityName = 'Desconocido';

  // Buscar el primer nivel (región)
  const regionLevel = adminLevels.find(level =>
    level.type.startsWith('state') ||
    level.type.startsWith('region') ||
    level.type.startsWith('province'));

  if (regionLevel) {
    regionName = regionLevel.name;
  }

  // Buscar el segundo nivel (provincia/condado)
  const countyLevel = adminLevels.find(level =>
    level.type.startsWith('county') ||
    level.type.startsWith('district'));

  if (countyLevel) {
    countyName = countyLevel.name;
  }

  // Buscar el tercer/cuarto nivel (ciudad/localidad)
  const cityLevel = adminLevels.find(level =>
    level.type.startsWith('city') ||
    level.type.startsWith('town') ||
    level.type.startsWith('village') ||
    level.type.startsWith('hamlet') ||
    level.type.startsWith('suburb') ||
    level.type.startsWith('municipality'));

  if (cityLevel) {
    cityName = cityLevel.name;
  }

  // Fallbacks para asegurar que siempre tenemos datos
  if (regionName === 'Desconocido' && countyName !== 'Desconocido') {
    regionName = `Región de ${countyName}`;
  }

  if (countyName === 'Desconocido' && cityName !== 'Desconocido') {
    countyName = `Provincia de ${cityName}`;
  }

  if (cityName === 'Desconocido') {
    // Usar el nombre principal si está disponible
    cityName = data.name || 'Ubicación desconocida';
  }

  console.log(`Estructura extraída final: País=${countryName}, Región=${regionName}, Provincia=${countyName}, Ciudad=${cityName}`);

  return {
    countryName,
    regionName,
    countyName,
    cityName,
    displayName: data.display_name || 'Ubicación desconocida'
  };
}

/**
 * Procesa la geocodificación de una foto
 * @param {String} photoId - ID de la foto a procesar
 * @returns {Promise<Boolean>} - Resultado de la operación
 */
exports.processPhotoGeocoding = async (photoId) => {
  try {
    console.log(`Procesando geocodificación para foto: ${photoId}`);

    // Buscar la foto por ID
    const photo = await Photo.findById(photoId);

    if (!photo) {
      console.error(`No se encontró la foto con ID: ${photoId}`);
      return false;
    }

    // Verificar que tenga coordenadas válidas
    if (!photo.hasValidCoordinates || !photo.location || !photo.location.coordinates) {
      console.error(`La foto ${photoId} no tiene coordenadas válidas`);
      await Photo.findByIdAndUpdate(photoId, { geocodingStatus: 'error' });
      return false;
    }

    // Extraer coordenadas (formato [lon, lat] en MongoDB)
    const [lon, lat] = photo.location.coordinates;

    // Actualizar estado a "processing"
    await Photo.findByIdAndUpdate(photoId, { geocodingStatus: 'pending' });

    // Obtener información de ubicación mediante Nominatim
    const locationInfo = await exports.getLocationInfo(lat, lon);

    if (!locationInfo) {
      console.error(`No se pudo obtener información de ubicación para foto ${photoId}`);
      await Photo.findByIdAndUpdate(photoId, { geocodingStatus: 'error' });
      return false;
    }

    console.log('Información de ubicación obtenida:', JSON.stringify(locationInfo));

    // Extraer información directamente del resultado (sin parseLocationFromNominatim)
    const countryName = locationInfo.country || 'Desconocido';
    const regionName = locationInfo.region || 'Desconocido';
    const countyName = locationInfo.county || 'Desconocido';
    const cityName = locationInfo.city || 'Desconocido';
    const displayName = locationInfo.displayName || `${cityName}, ${countyName}, ${regionName}, ${countryName}`;

    console.log(`Datos extraídos: País=${countryName}, Región=${regionName}, Provincia=${countyName}, Ciudad=${cityName}`);

    // Crear o encontrar registros en la base de datos
    const country = await findOrCreateCountry(countryName, photo.userId);

    let region = null;
    if (country && country._id) {
      region = await findOrCreateRegion(regionName, country._id, photo.userId);
    }

    let county = null;
    if (region && region._id && country && country._id) {
      county = await findOrCreateCounty(countyName, region._id, country._id, photo.userId);
    }

    let city = null;
    if (county && county._id && region && region._id && country && country._id) {
      city = await findOrCreateCity(cityName, county._id, region._id, country._id, photo.userId);
    }

    // Preparar datos para actualizar la foto
    const geocodingDetails = {
      country: country ? {
        id: country._id,
        name: country.name
      } : null,
      region: region ? {
        id: region._id,
        name: region.name
      } : null,
      county: county ? {
        id: county._id,
        name: county.name
      } : null,
      city: city ? {
        id: city._id,
        name: city.name
      } : null,
      displayName: displayName
    };

    console.log(`Detalles de geocodificación para foto ${photoId}:`, JSON.stringify(geocodingDetails));

    // Actualizar foto con los detalles de ubicación y cambiar estado a "completed"
    await Photo.findByIdAndUpdate(photoId, {
      'geocodingStatus': 'completed',
      'location.name': displayName,
      'geocodingDetails': geocodingDetails
    });

    console.log(`Geocodificación completada con éxito para foto ${photoId}`);
    return true;
  } catch (error) {
    console.error(`Error procesando geocodificación para foto ${photoId}:`, error);
    // Actualizar estado en caso de error
    try {
      await Photo.findByIdAndUpdate(photoId, { geocodingStatus: 'error' });
    } catch (updateError) {
      console.error(`Error adicional al actualizar estado de geocodificación:`, updateError);
    }
    return false;
  }
}; 