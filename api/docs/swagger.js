const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Definición Swagger
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Photomap API',
      version: '1.0.0',
      description: 'API para la aplicación Photomap',
    },
    servers: [
      {
        url: 'http://localhost:4567',
        description: 'Servidor de desarrollo',
      },
    ],
  },
  apis: ['./api/routes/*.js', './api/models/*.js'], // Archivos a escanear
};

const specs = swaggerJsdoc(options);

module.exports = { specs, swaggerUi }; 