const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * @route GET /images/proxy
 * @desc Actúa como proxy para imágenes de S3, evitando problemas de CORS
 * @access Público
 */
router.get('/proxy', async (req, res) => {
  try {
    // Obtén la URL original de la imagen desde el query parameter
    const imageUrl = req.query.url;

    if (!imageUrl) {
      return res.status(400).send('URL de imagen requerida');
    }

    // Validación básica para asegurarse que solo accede a S3
    if (!imageUrl.includes('amazonaws.com')) {
      return res.status(403).send('Solo se permiten imágenes de S3');
    }

    console.log(`Proxy solicitado para: ${imageUrl}`);

    // Obtén la imagen desde S3
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream' // Importante: usar stream para no cargar toda la imagen en memoria
    });

    // Configura los headers de la respuesta
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas

    // Para el debugging
    console.log(`Enviando imagen con tipo: ${response.headers['content-type']}`);

    // Transmite la imagen al cliente
    response.data.pipe(res);
  } catch (error) {
    console.error('Error al obtener imagen:', error);
    res.status(500).send('Error al obtener la imagen');
  }
});

module.exports = router;
