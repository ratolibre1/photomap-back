const backgroundService = require('../services/backgroundService');

async function runWorker() {
  console.log('Iniciando worker de geocodificación...');
  try {
    const result = await backgroundService.processGeocodingQueue(50);
    console.log('Worker completado:', result);
  } catch (error) {
    console.error('Error en worker:', error);
  }

  // Ejecutar de nuevo en 5 minutos
  setTimeout(runWorker, 5 * 60 * 1000);
}

// Iniciar el worker
runWorker(); 