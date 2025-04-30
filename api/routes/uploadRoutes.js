const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middlewares/auth');

// Configurar multer para almacenar los archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, '../../temp');
    // Crear el directorio si no existe
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log(`Directorio temporal creado: ${tempDir}`);
      } catch (err) {
        console.error(`Error al crear directorio temporal: ${err.message}`);
      }
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    cb(null, `photos-zip-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 1000 // 1000 MB límite
  },
  fileFilter: function (req, file, cb) {
    // Solo permitir ZIPs
    if (file.mimetype === 'application/zip' ||
      file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos ZIP'), false);
    }
  }
});

/**
 * Ruta: POST /api/upload/zip
 * Descripción: Procesa un archivo ZIP con fotos y las sube a la plataforma
 * Parámetros:
 *   - photoZip: Archivo ZIP con fotos (campo de archivo)
 *   - isPublic: (opcional) 'true' para hacer todas las fotos públicas, 'false' o ausente para privadas
 *   - labels: (opcional) Array o string separado por comas con IDs de etiquetas a aplicar a todas las fotos
 * Autenticación: Requiere token de usuario válido
 */
router.post('/zip',
  protect,
  upload.single('photoZip'),
  uploadController.processPhotoZip
);

/**
 * Ruta: GET /api/upload/history
 * Descripción: Obtiene el historial de cargas del usuario
 * Autenticación: Requiere token de usuario válido
 */
router.get('/history', protect, uploadController.getUploadHistory);

/**
 * Ruta: GET /api/upload/:id
 * Descripción: Obtiene detalles de una carga específica
 * Autenticación: Requiere token de usuario válido
 */
router.get('/:id', protect, uploadController.getUploadDetails);

module.exports = router; 