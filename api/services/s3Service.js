const AWS = require('aws-sdk');
const {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_BUCKET_NAME
} = require('../../config/env');

// Configurar AWS
AWS.config.update({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION
});

const s3 = new AWS.S3();

/**
 * Sube un archivo a S3
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {String} fileName - Nombre del archivo en S3
 * @param {String} contentType - Tipo MIME del archivo
 * @returns {Promise<String>} URL del archivo subido
 */
exports.uploadFile = async (fileBuffer, fileName, contentType) => {
  const params = {
    Bucket: AWS_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType
  };

  try {
    const result = await s3.upload(params).promise();
    return result.Location; // URL del archivo subido
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

/**
 * Elimina un archivo de S3
 * @param {String} fileUrl - URL completa del archivo
 * @returns {Promise<void>}
 */
exports.deleteFileFromS3 = async (fileUrl) => {
  try {
    // Verificar que la URL sea válida
    if (!fileUrl || typeof fileUrl !== 'string') {
      console.error('URL inválida para eliminar:', fileUrl);
      return; // No intentar eliminar si la URL no es válida
    }

    console.log('Intentando eliminar archivo:', fileUrl);

    // Extraer la clave del archivo de la URL
    // La URL típica de S3 es: https://bucket-name.s3.region.amazonaws.com/key
    // O: https://s3.region.amazonaws.com/bucket-name/key
    let key;

    try {
      const url = new URL(fileUrl);
      const pathname = url.pathname;

      // Si la URL incluye el nombre del bucket en el dominio
      if (url.hostname.includes(AWS_BUCKET_NAME)) {
        // La ruta comienza con '/'
        key = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      }
      // Si la URL tiene el formato s3.region.amazonaws.com/bucket-name/key
      else if (pathname.includes(AWS_BUCKET_NAME)) {
        const bucketPrefix = `/${AWS_BUCKET_NAME}/`;
        const keyStartIndex = pathname.indexOf(bucketPrefix) + bucketPrefix.length;
        key = pathname.substring(keyStartIndex);
      }
      // Último recurso: intentar extraer todo después del último '/'
      else {
        const parts = pathname.split('/');
        key = parts[parts.length - 1];
      }

      console.log('Clave extraída:', key);
    } catch (urlError) {
      console.error('Error al parsear URL:', urlError);
      // Intento alternativo: extraer todo después del nombre del bucket
      const bucketIndex = fileUrl.indexOf(AWS_BUCKET_NAME);
      if (bucketIndex !== -1) {
        key = fileUrl.substring(bucketIndex + AWS_BUCKET_NAME.length + 1);
        console.log('Clave extraída (método alternativo):', key);
      } else {
        throw new Error('No se pudo extraer la clave del archivo de la URL');
      }
    }

    // Verificar que se haya extraído una clave válida
    if (!key) {
      throw new Error('No se pudo extraer la clave del archivo de la URL');
    }

    const params = {
      Bucket: AWS_BUCKET_NAME,
      Key: key
    };

    console.log('Parámetros para deleteObject:', params);
    await s3.deleteObject(params).promise();
    console.log('Archivo eliminado correctamente');
  } catch (error) {
    console.error('Error al eliminar archivo de S3:', error);
    throw error;
  }
};

/**
 * Sube un buffer a S3
 */
exports.uploadBuffer = async ({ Buffer, Key, ContentType }) => {
  const params = {
    Bucket: AWS_BUCKET_NAME,
    Key,
    Body: Buffer,
    ContentType
  };

  const result = await s3.upload(params).promise();
  return result;
};

/**
 * Elimina un objeto de S3
 * @param {string} key - Clave del objeto a eliminar
 * @returns {Promise<Object>} - Resultado de la operación
 */
exports.deleteObject = async (key) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key
  };

  try {
    const result = await s3.deleteObject(params).promise();
    console.log(`Objeto eliminado de S3: ${key}`);
    return result;
  } catch (error) {
    console.error(`Error al eliminar objeto de S3 (${key}):`, error);
    throw error;
  }
};

/**
 * Elimina múltiples objetos de S3 en un solo lote
 * @param {Array<string>} keys - Array de claves a eliminar
 * @returns {Promise<Object>} - Resultado de la operación
 */
exports.deleteMultipleObjects = async (keys) => {
  if (!keys || keys.length === 0) {
    return { Deleted: [] };
  }

  const params = {
    Bucket: AWS_BUCKET_NAME,
    Delete: {
      Objects: keys.map(Key => ({ Key })),
      Quiet: false
    }
  };

  try {
    const result = await s3.deleteObjects(params).promise();
    console.log(`Eliminados ${result.Deleted?.length || 0} objetos de S3 en lote`);
    return result;
  } catch (error) {
    console.error(`Error al eliminar objetos en lote de S3:`, error);
    throw error;
  }
};