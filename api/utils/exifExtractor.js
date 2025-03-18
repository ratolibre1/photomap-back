const ExifReader = require('exif-reader');
const sharp = require('sharp');

/**
 * Extrae metadatos EXIF de una imagen
 * @param {Buffer} imageBuffer - Buffer de la imagen
 * @returns {Object} Metadatos extraídos
 */
exports.extractExifData = async (imageBuffer) => {
  try {
    // Leer metadatos con sharp
    const metadata = await sharp(imageBuffer).metadata();

    // Si hay datos EXIF, procesarlos
    let exifData = {};
    if (metadata.exif) {
      try {
        const exif = ExifReader(metadata.exif);

        // Extraer información relevante
        if (exif.exif) {
          // Extraer fecha de captura
          let captureDate = null;
          if (exif.exif.DateTimeOriginal) {
            try {
              // Imprimir el valor para depuración
              console.log('DateTimeOriginal:', exif.exif.DateTimeOriginal, typeof exif.exif.DateTimeOriginal);

              // Si es un objeto Date, usarlo directamente
              if (exif.exif.DateTimeOriginal instanceof Date) {
                captureDate = exif.exif.DateTimeOriginal;
              }
              // Si es un timestamp numérico
              else if (typeof exif.exif.DateTimeOriginal === 'number') {
                captureDate = new Date(exif.exif.DateTimeOriginal);
              }
              // Para otros casos, usar la fecha predeterminada
              else {
                captureDate = null;
              }

              if (captureDate) {
                console.log('Fecha extraída del EXIF:', captureDate);
              }
            } catch (dateErr) {
              console.error('Error parsing EXIF date:', dateErr);
              captureDate = null;
            }
          }

          exifData = {
            camera: exif.image?.Make ? `${exif.image.Make} ${exif.image.Model}` : undefined,
            lens: exif.exif.LensModel,
            aperture: exif.exif.FNumber ? `f/${exif.exif.FNumber}` : undefined,
            shutterSpeed: exif.exif.ExposureTime ? `${exif.exif.ExposureTime}s` : undefined,
            iso: exif.exif.ISO,
            captureDate: captureDate // Añadir la fecha de captura
          };
        }

        // Extraer coordenadas GPS si existen
        if (exif.gps) {
          try {
            // Imprimir valores GPS para depuración
            console.log('GPS Data:', {
              lat: exif.gps.GPSLatitude,
              lng: exif.gps.GPSLongitude,
              latRef: exif.gps.GPSLatitudeRef,
              lngRef: exif.gps.GPSLongitudeRef,
              types: {
                lat: typeof exif.gps.GPSLatitude,
                lng: typeof exif.gps.GPSLongitude
              }
            });

            let latitude = null;
            let longitude = null;

            // Manejar diferentes formatos de coordenadas
            // 1. Si es un número, usarlo directamente
            if (typeof exif.gps.GPSLatitude === 'number') {
              latitude = exif.gps.GPSLatitude;
            }
            // 2. Si es una cadena, convertirla a número con parseFloat para mantener decimales
            else if (typeof exif.gps.GPSLatitude === 'string') {
              latitude = parseFloat(exif.gps.GPSLatitude);
            }
            // 3. Si es un array (formato DMS: grados, minutos, segundos), convertirlo
            else if (Array.isArray(exif.gps.GPSLatitude)) {
              const [degrees, minutes, seconds] = exif.gps.GPSLatitude;
              latitude = degrees + (minutes / 60) + (seconds / 3600);
            }

            // Mismo proceso para longitud
            if (typeof exif.gps.GPSLongitude === 'number') {
              longitude = exif.gps.GPSLongitude;
            }
            else if (typeof exif.gps.GPSLongitude === 'string') {
              longitude = parseFloat(exif.gps.GPSLongitude);
            }
            else if (Array.isArray(exif.gps.GPSLongitude)) {
              const [degrees, minutes, seconds] = exif.gps.GPSLongitude;
              longitude = degrees + (minutes / 60) + (seconds / 3600);
            }

            // Aplicar referencia (N/S, E/W) si las coordenadas son válidas
            if (latitude !== null && longitude !== null &&
              !isNaN(latitude) && !isNaN(longitude)) {

              // Aplicar referencia
              if (exif.gps.GPSLatitudeRef === 'S') latitude = -Math.abs(latitude);
              if (exif.gps.GPSLongitudeRef === 'W') longitude = -Math.abs(longitude);

              exifData.coordinates = [longitude, latitude];
              console.log('Coordenadas extraídas con precisión decimal:', exifData.coordinates);
            }
          } catch (gpsErr) {
            console.error('Error procesando coordenadas GPS:', gpsErr);
          }
        }
      } catch (err) {
        console.error('Error parsing EXIF data:', err);
      }
    }

    return exifData;
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {};
  }
}; 