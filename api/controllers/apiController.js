const { success } = require('../utils/responseFormatter');

// Controlador para la ruta de prueba
exports.test = (req, res) => {
  return success(res, { mensaje: 'API funcionando correctamente ✅' });
};

// Controlador para recibir datos
exports.recibirDatos = (req, res) => {
  const datos = req.body;
  return success(res, {
    mensaje: 'Datos recibidos correctamente 👍',
    datos: datos
  });
}; 