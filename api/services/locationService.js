const mongoose = require('mongoose');
const Country = require('../models/Country');
const Region = require('../models/Region');
const County = require('../models/County');
const City = require('../models/City');
const Photo = require('../models/Photo');

/**
 * Actualiza la visibilidad de una ubicación basándose en si tiene fotos asociadas
 * @param {String} locationType - Tipo de ubicación ('country', 'region', 'county', 'city')
 * @param {String} locationId - ID de la ubicación
 * @returns {Promise<Boolean>} - True si hay fotos asociadas (visible=true), false si no (visible=false)
 */
const updateLocationVisibility = async (locationType, locationId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(locationId)) {
      console.error(`ID de ubicación inválido: ${locationId}`);
      return false;
    }

    // Obtener recuento de fotos para esta ubicación
    let photoCount = 0;
    let locationModel;
    let queryField = '';

    switch (locationType) {
      case 'country':
        queryField = 'geocodingDetails.countryId';
        locationModel = Country;
        break;
      case 'region':
        queryField = 'geocodingDetails.regionId';
        locationModel = Region;
        break;
      case 'county':
        queryField = 'geocodingDetails.countyId';
        locationModel = County;
        break;
      case 'city':
        queryField = 'geocodingDetails.cityId';
        locationModel = City;
        break;
      default:
        console.error(`Tipo de ubicación desconocido: ${locationType}`);
        return false;
    }

    // Crear el query para buscar fotos
    const query = {};
    query[queryField] = locationId;

    // Contar fotos
    photoCount = await Photo.countDocuments(query);

    // Actualizar visibilidad basado en el contador
    const shouldBeVisible = photoCount > 0;

    // Buscar y actualizar la ubicación si es necesario
    const location = await locationModel.findById(locationId);

    if (location && location.visible !== shouldBeVisible) {
      location.visible = shouldBeVisible;
      await location.save();
      console.log(`Actualizada visibilidad de ${locationType} ${locationId} a ${shouldBeVisible}`);
    }

    return shouldBeVisible;
  } catch (error) {
    console.error(`Error actualizando visibilidad de ubicación ${locationType} ${locationId}:`, error);
    return false;
  }
};

/**
 * Verifica y actualiza la visibilidad de todas las ubicaciones asociadas a una foto
 * @param {Object} photoData - Objeto con datos de la foto, incluyendo geocodingDetails
 */
const updateLocationVisibilityForPhoto = async (photoData) => {
  if (!photoData || !photoData.geocodingDetails) {
    return;
  }

  const { geocodingDetails } = photoData;

  const promises = [];

  // Verificar cada nivel de ubicación
  if (geocodingDetails.cityId) {
    promises.push(updateLocationVisibility('city', geocodingDetails.cityId));
  }

  if (geocodingDetails.countyId) {
    promises.push(updateLocationVisibility('county', geocodingDetails.countyId));
  }

  if (geocodingDetails.regionId) {
    promises.push(updateLocationVisibility('region', geocodingDetails.regionId));
  }

  if (geocodingDetails.countryId) {
    promises.push(updateLocationVisibility('country', geocodingDetails.countryId));
  }

  await Promise.all(promises);
};

/**
 * Actualiza la visibilidad de ubicaciones después de eliminar una foto
 * @param {String} photoId - ID de la foto eliminada
 */
const updateLocationVisibilityAfterPhotoDeletion = async (photoId) => {
  try {
    // Obtener datos de la foto antes de ser eliminada
    const photo = await Photo.findById(photoId);

    if (!photo) {
      console.log(`La foto ${photoId} ya no existe, no se puede actualizar visibilidad de ubicaciones`);
      return;
    }

    // Guardar los datos relevantes de la foto
    const photoData = {
      geocodingDetails: photo.geocodingDetails || {}
    };

    // Actualizar visibilidad de ubicaciones
    await updateLocationVisibilityForPhoto(photoData);

  } catch (error) {
    console.error(`Error actualizando visibilidad de ubicaciones después de eliminar foto ${photoId}:`, error);
  }
};

module.exports = {
  updateLocationVisibility,
  updateLocationVisibilityForPhoto,
  updateLocationVisibilityAfterPhotoDeletion
}; 