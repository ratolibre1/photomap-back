const Photo = require('../models/Photo');
const mongoose = require('mongoose');
const s3Service = require('./s3Service');
const imageService = require('./imageService');
const { AppError } = require('../utils/errorHandler');

/**
 * Procesa una imagen y verifica duplicados
 * @param {Buffer} imageBuffer - Buffer de la imagen
 * @param {String} fileName - Nombre del archivo
 * @param {String} userId - ID del usuario
 * @param {Object} options - Opciones adicionales (etiquetas, título, descripción, etc)
 * @returns {Promise<Object>} - Resultado con foto procesada, duplicado, estadísticas, etc
 */
exports.processPhoto = async (imageBuffer, fileName, userId, options = {}) => {
  try {
    console.log('Procesando foto:', fileName);

    // Resultado para devolver
    const result = {
      processed: false,
      duplicate: false,
      existingPhotoId: null,
      existingPhotoUrl: null,
      hasLocation: false,
      hasTimestamp: false,
      photo: null,
      error: null
    };

    // Procesar imagen con imageService
    const processedImage = await imageService.processImage(imageBuffer, fileName);
    console.log('Imagen procesada. Hash:', processedImage.fileHash);

    // Verificar duplicados
    if (processedImage.fileHash) {
      console.log(`Verificando duplicados para hash: ${processedImage.fileHash}`);

      const existingPhoto = await Photo.findOne({
        fileHash: processedImage.fileHash,
        userId: userId
      });

      if (existingPhoto) {
        console.log('¡Foto duplicada encontrada!', {
          existingPhotoId: existingPhoto._id,
          existingPhotoUrl: existingPhoto.thumbnailUrl
        });

        // Eliminar archivos temporales que se hayan subido a S3
        try {
          if (processedImage.originalUrl) {
            const originalKey = new URL(processedImage.originalUrl).pathname.substring(1);
            console.log('Eliminando archivo original duplicado:', originalKey);
            await s3Service.deleteObject(originalKey);
          }
          if (processedImage.thumbnailUrl) {
            const thumbnailKey = new URL(processedImage.thumbnailUrl).pathname.substring(1);
            console.log('Eliminando thumbnail duplicado:', thumbnailKey);
            await s3Service.deleteObject(thumbnailKey);
          }
        } catch (deleteError) {
          console.error('Error eliminando archivos duplicados de S3:', deleteError);
        }

        // Marcar como duplicado y devolver info
        result.duplicate = true;
        result.existingPhotoId = existingPhoto._id;
        result.existingPhotoUrl = existingPhoto.thumbnailUrl;
        result.photo = existingPhoto;
        result.hasLocation = existingPhoto.hasValidCoordinates;
        result.hasTimestamp = existingPhoto.hasValidTimestamp;
        result.title = existingPhoto.title;
        result.originalUrl = existingPhoto.originalUrl;
        return result;
      } else {
        console.log('No se encontraron duplicados');
      }
    } else {
      console.warn('¡Advertencia! No se generó hash para la imagen');
    }

    // Preparar datos básicos de la foto sin el campo location
    const photoData = {
      userId: userId,
      title: options.title || fileName,
      description: options.description || '',
      originalUrl: processedImage.originalUrl,
      thumbnailUrl: processedImage.thumbnailUrl,
      timestamp: processedImage.metadata?.captureDate || null,
      hasValidTimestamp: processedImage.metadata?.captureDate instanceof Date && !isNaN(processedImage.metadata.captureDate.getTime()),
      hasValidCoordinates: false,
      geocodingStatus: 'not_applicable',
      reviewed: false,
      isPublic: options.isPublic === true || options.isPublic === 'true' ? true : false,
      location: undefined, // Explícitamente definido como undefined
      fileHash: processedImage.fileHash // Guardamos el hash para futuras validaciones
    };

    // Procesar etiquetas (labels) si vienen como opción
    if (options.labels) {
      console.log('Procesando etiquetas:', options.labels);

      try {
        // Convertir a array si viene como string JSON
        let labelsArray = options.labels;
        if (typeof labelsArray === 'string') {
          try {
            labelsArray = JSON.parse(labelsArray);
          } catch (e) {
            // Si no es JSON válido, intentar separar por comas
            labelsArray = labelsArray.split(',');
          }
        }

        // Asegurarse de que sea un array
        if (!Array.isArray(labelsArray)) {
          labelsArray = [labelsArray];
        }

        // Filtrar para tener solo IDs válidos
        const validLabels = labelsArray.filter(labelId =>
          mongoose.Types.ObjectId.isValid(labelId)
        );

        console.log('Etiquetas válidas para nueva foto:', validLabels);
        photoData.labels = validLabels;
      } catch (error) {
        console.error('Error procesando etiquetas:', error);
      }
    }

    // Procesar coordenadas EXIF si existen
    if (processedImage.metadata?.coordinates) {
      // Validar si las coordenadas están como array
      if (Array.isArray(processedImage.metadata.coordinates) &&
        processedImage.metadata.coordinates.length === 2 &&
        !isNaN(processedImage.metadata.coordinates[0]) &&
        !isNaN(processedImage.metadata.coordinates[1])) {

        console.log('¡Coordenadas en formato array válidas encontradas!', processedImage.metadata.coordinates);

        // Solo agregamos location si hay coordenadas válidas
        photoData.location = {
          type: 'Point',
          coordinates: processedImage.metadata.coordinates,
          name: null
        };
        photoData.hasValidCoordinates = true;
        photoData.geocodingStatus = 'pending';
        result.hasLocation = true;
      }
      // Validar si están como objeto lat/lon
      else if (processedImage.metadata.coordinates.lat !== undefined &&
        processedImage.metadata.coordinates.lon !== undefined &&
        !isNaN(processedImage.metadata.coordinates.lat) &&
        !isNaN(processedImage.metadata.coordinates.lon)) {

        console.log('¡Coordenadas en formato {lat,lon} válidas encontradas!', processedImage.metadata.coordinates);

        // Convertir a formato GeoJSON [lon, lat]
        const coordinates = [
          processedImage.metadata.coordinates.lon,
          processedImage.metadata.coordinates.lat
        ];

        photoData.location = {
          type: 'Point',
          coordinates: coordinates,
          name: null
        };
        photoData.hasValidCoordinates = true;
        photoData.geocodingStatus = 'pending';
        result.hasLocation = true;
      }
      else {
        console.log('Coordenadas encontradas pero con formato inválido:', processedImage.metadata.coordinates);
      }
    } else {
      console.log('No se encontraron coordenadas en la imagen');
    }

    console.log('Datos de foto a guardar:', JSON.stringify(photoData, null, 2));

    // Eliminar el campo location si está indefinido
    if (photoData.location === undefined) {
      delete photoData.location;
    }

    // Actualizar resultado con info de timestamp
    result.hasTimestamp = photoData.hasValidTimestamp;

    // Guardar en la base de datos
    const photo = await Photo.create(photoData);
    result.photo = photo;
    result.processed = true;

    return result;
  } catch (error) {
    console.error('Error procesando foto:', error);
    return {
      processed: false,
      duplicate: false,
      error: error.message || 'Error desconocido al procesar la foto'
    };
  }
};

/**
 * Procesa múltiples fotos y genera estadísticas
 * @param {Array} photoInfos - Array de objetos {buffer, fileName, options}
 * @param {String} userId - ID del usuario
 * @returns {Promise<Object>} - Estadísticas y resultados
 */
exports.processMultiplePhotos = async (photoInfos, userId) => {
  // Separamos fotos en categorías para ordenarlas después
  const processedPhotos = [];
  const duplicatePhotos = [];
  const errorPhotos = [];

  const stats = {
    processed: 0,
    duplicates: 0,
    withLocation: 0,
    withoutLocation: 0,
    withTimestamp: 0,
    withoutTimestamp: 0,
    errors: 0,
    photos: [] // Este array lo llenaremos al final con el orden adecuado
  };

  // Tratar cada foto individualmente pero usando options específicas
  for (let i = 0; i < photoInfos.length; i++) {
    const info = photoInfos[i];
    try {
      // Si es una sola foto, usar title y description directamente
      // Si son múltiples fotos, solo usar title y description si no hay índices
      const options = { ...(info.options || {}) };

      // Si hay un title pero son múltiples fotos, añadir índice a menos que sea una foto única
      if (options.title && photoInfos.length > 1) {
        // Solo agregar sufijo numérico si hay más de una foto
        options.title = `${options.title} ${i + 1}`;
      }

      const result = await this.processPhoto(
        info.buffer,
        info.fileName,
        userId,
        options
      );

      if (result.error) {
        stats.errors++;
        errorPhotos.push({
          title: info.fileName,
          error: result.error
        });
        continue;
      }

      if (result.duplicate) {
        stats.duplicates++;
        const duplicatePhotoInfo = {
          id: result.existingPhotoId,
          title: result.title || info.fileName,
          fileName: info.fileName,
          duplicate: true,
          existingPhotoId: result.existingPhotoId,
          existingPhotoUrl: result.existingPhotoUrl,
          originalUrl: result.originalUrl,
          thumbnailUrl: result.existingPhotoUrl,
          hasLocation: result.hasLocation,
          hasTimestamp: result.hasTimestamp
        };

        // Incluir coordenadas si existen y hasLocation es true
        if (result.hasLocation && result.photo && result.photo.location && result.photo.location.coordinates) {
          duplicatePhotoInfo.coordinates = result.photo.location.coordinates;
        }

        // Incluir timestamp si existe y hasTimestamp es true
        if (result.hasTimestamp && result.photo && result.photo.timestamp) {
          duplicatePhotoInfo.timestamp = result.photo.timestamp;
        }

        duplicatePhotos.push(duplicatePhotoInfo);
      } else if (result.processed) {
        stats.processed++;

        // Actualizar contadores
        if (result.hasLocation) {
          stats.withLocation++;
        } else {
          stats.withoutLocation++;
        }

        if (result.hasTimestamp) {
          stats.withTimestamp++;
        } else {
          stats.withoutTimestamp++;
        }

        // Crear objeto base para la foto
        const photoInfo = {
          id: result.photo.id,
          title: result.photo.title,
          fileName: info.fileName,
          hasLocation: result.hasLocation,
          hasTimestamp: result.hasTimestamp
        };

        // Incluir coordenadas si existen
        if (result.hasLocation && result.photo.location && result.photo.location.coordinates) {
          photoInfo.coordinates = result.photo.location.coordinates;
        }

        // Incluir timestamp si existe
        if (result.hasTimestamp && result.photo.timestamp) {
          photoInfo.timestamp = result.photo.timestamp;
        }

        // Incluir URLs de la foto
        photoInfo.thumbnailUrl = result.photo.thumbnailUrl;
        photoInfo.originalUrl = result.photo.originalUrl;

        // Añadir a lista de procesadas
        processedPhotos.push(photoInfo);
      }
    } catch (err) {
      console.error('Error procesando foto:', err);
      stats.errors++;
      errorPhotos.push({
        title: info.fileName,
        fileName: info.fileName,
        error: err.message || 'Error desconocido'
      });
    }
  }

  // Ordenar resultados: primero procesadas, luego duplicadas, finalmente errores
  stats.photos = [
    ...processedPhotos,
    ...duplicatePhotos,
    ...errorPhotos
  ];

  return {
    message: `Procesamiento completado. Se procesaron ${stats.processed} fotos, ${stats.duplicates} duplicados, ${stats.errors} errores.`,
    stats
  };
}; 