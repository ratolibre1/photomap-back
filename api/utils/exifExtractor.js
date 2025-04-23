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

    // Información adicional para depuración
    console.log('Metadata del archivo:', JSON.stringify({
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      hasExif: !!metadata.exif,
      hasIptc: !!metadata.iptc,
      hasXmp: !!metadata.xmp
    }));

    // Si hay datos EXIF, procesarlos
    let exifData = {};

    if (metadata.exif) {
      try {
        const exif = ExifReader(metadata.exif);
        console.log('EXIF data completo:', JSON.stringify(exif));

        // Extraer información relevante
        if (exif.exif) {
          // Extraer fecha de captura
          let captureDate = null;
          if (exif.exif.DateTimeOriginal) {
            try {
              // Imprimir el valor para depuración
              console.log('DateTimeOriginal encontrado:', exif.exif.DateTimeOriginal, typeof exif.exif.DateTimeOriginal);

              // Si es un objeto Date, usarlo directamente
              if (exif.exif.DateTimeOriginal instanceof Date) {
                captureDate = exif.exif.DateTimeOriginal;
                console.log('DateTimeOriginal es un objeto Date:', captureDate);
              }
              // Si es un timestamp numérico
              else if (typeof exif.exif.DateTimeOriginal === 'number') {
                captureDate = new Date(exif.exif.DateTimeOriginal);
                console.log('DateTimeOriginal es numérico, convertido a Date:', captureDate);
              }
              // Si es un string (formato común YYYY:MM:DD HH:MM:SS)
              else if (typeof exif.exif.DateTimeOriginal === 'string') {
                const dateStr = exif.exif.DateTimeOriginal;
                console.log('Procesando fecha en formato string:', dateStr);

                let dateFormats = [
                  // Intentar varios formatos en orden:
                  // 1. Intentar convertir YYYY:MM:DD HH:MM:SS a YYYY-MM-DD HH:MM:SS
                  () => {
                    const formatted = dateStr.replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
                    console.log('Intento 1 - Formato YYYY-MM-DD HH:MM:SS:', formatted);
                    return new Date(formatted);
                  },
                  // 2. Usar el formato como está
                  () => {
                    console.log('Intento 2 - Usar formato original');
                    return new Date(dateStr);
                  },
                  // 3. Procesar manualmente si tiene formato YYYY:MM:DD HH:MM:SS
                  () => {
                    if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
                      console.log('Intento 3 - Procesando manualmente YYYY:MM:DD HH:MM:SS');
                      const [datePart, timePart] = dateStr.split(' ');
                      const [year, month, day] = datePart.split(':').map(Number);
                      const [hour, minute, second] = timePart.split(':').map(Number);
                      return new Date(year, month - 1, day, hour, minute, second);
                    }
                    return null;
                  }
                ];

                // Intentar cada formato hasta encontrar uno válido
                for (const formatFn of dateFormats) {
                  captureDate = formatFn();
                  const isValid = captureDate instanceof Date && !isNaN(captureDate.getTime());
                  console.log('Resultado de intento:', captureDate, 'Es válido:', isValid);

                  if (isValid) {
                    console.log('✅ Se encontró un formato válido para la fecha:', captureDate);
                    break;
                  }
                  captureDate = null;
                }
              }
              // Para otros casos, usar valor como está
              else if (exif.exif.DateTimeOriginal) {
                captureDate = new Date(exif.exif.DateTimeOriginal);
                console.log('Otro formato de DateTimeOriginal, convertido a Date:', captureDate);
              }

              if (captureDate && !isNaN(captureDate.getTime())) {
                console.log('✅ Fecha extraída del EXIF válida:', captureDate);
              } else {
                console.log('❌ No se pudo interpretar la fecha:', exif.exif.DateTimeOriginal);
                captureDate = null;
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

        // Extrae coordenadas tanto de GPS EXIF como de XMP
        exifData.coordinates = extractCoordinates(exif, metadata);

        // Log adicional para depuración
        console.log('✅ Resultado final de extracción de EXIF:', JSON.stringify({
          hasCaptureDate: !!exifData.captureDate,
          captureDate: exifData.captureDate,
          isValidDate: exifData.captureDate instanceof Date && !isNaN(exifData.captureDate.getTime()),
          hasCoordinates: !!exifData.coordinates,
          coordinates: exifData.coordinates
        }));
      } catch (err) {
        console.error('Error parsing EXIF data:', err);
      }
    }

    // Si no hay coordenadas en EXIF, intentar extraer de XMP
    if (!exifData.coordinates && metadata.xmp) {
      try {
        exifData.coordinates = extractCoordinatesFromXMP(metadata.xmp.toString());
      } catch (xmpErr) {
        console.error('Error extracting coordinates from XMP:', xmpErr);
      }
    }

    return exifData;
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {};
  }
};

/**
 * Extrae coordenadas de datos EXIF y/o XMP
 * @param {Object} exif - Datos EXIF procesados
 * @param {Object} metadata - Metadatos de sharp
 * @returns {Object|null} Coordenadas {lat, lon} o null
 */
function extractCoordinates(exif, metadata) {
  // Primero intentar extraer del GPS EXIF
  if (exif && exif.gps) {
    try {
      console.log('GPS Data completo:', JSON.stringify(exif.gps));

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

        console.log('Coordenadas extraídas de EXIF GPS:', { lat: latitude, lon: longitude });
        return { lat: latitude, lon: longitude };
      }
    } catch (gpsErr) {
      console.error('Error procesando coordenadas GPS EXIF:', gpsErr);
    }
  }

  // Si llegamos aquí, no se pudo extraer de EXIF GPS
  return null;
}

/**
 * Extrae coordenadas de XMP metadata
 * @param {String} xmpData - Datos XMP como string
 * @returns {Object|null} Coordenadas {lat, lon} o null
 */
function extractCoordinatesFromXMP(xmpData) {
  try {
    if (!xmpData) return null;

    console.log('Intentando extraer coordenadas de XMP...');

    // Buscar coordenadas en formato estándar (puede variar según la cámara)
    // Ejemplo: <GPSLatitude>33,2,48N</GPSLatitude>
    const latRegex = /<(GPSLatitude|exif:GPSLatitude)>(.*?)<\/(GPSLatitude|exif:GPSLatitude)>/i;
    const lonRegex = /<(GPSLongitude|exif:GPSLongitude)>(.*?)<\/(GPSLongitude|exif:GPSLongitude)>/i;

    // O formato con referencia separada
    const latRefRegex = /<(GPSLatitudeRef|exif:GPSLatitudeRef)>(.*?)<\/(GPSLatitudeRef|exif:GPSLatitudeRef)>/i;
    const lonRefRegex = /<(GPSLongitudeRef|exif:GPSLongitudeRef)>(.*?)<\/(GPSLongitudeRef|exif:GPSLongitudeRef)>/i;

    // O en formato de Google (decimal directo)
    const googleLatRegex = /<(google:latitude|rdf:latitude)>(.*?)<\/(google:latitude|rdf:latitude)>/i;
    const googleLonRegex = /<(google:longitude|rdf:longitude)>(.*?)<\/(google:longitude|rdf:longitude)>/i;

    // Buscar DMS directo con notación cardinal
    const dmsRegex = /(\d+)°\s*(\d+)'\s*(\d+(?:\.\d+)?)"\s*([NSEW])/gi;
    const dmsMatches = [...xmpData.matchAll(dmsRegex)];

    if (dmsMatches.length >= 2) {
      const coords = dmsMatches.map(match => {
        const degrees = parseFloat(match[1]);
        const minutes = parseFloat(match[2]);
        const seconds = parseFloat(match[3]);
        const direction = match[4].toUpperCase();

        let decimal = degrees + (minutes / 60) + (seconds / 3600);
        if (direction === 'S' || direction === 'W' || direction === 'O') {
          decimal = -decimal;
        }

        return decimal;
      });

      console.log('Coordenadas extraídas de XMP (DMS):', { lat: coords[0], lon: coords[1] });
      return { lat: coords[0], lon: coords[1] };
    }

    // Intentar los otros patrones...
    // (implementa las otras alternativas según sea necesario)

    return null;
  } catch (err) {
    console.error('Error al extraer coordenadas de XMP:', err);
    return null;
  }
} 