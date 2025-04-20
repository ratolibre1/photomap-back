const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const multer = require('multer');
const path = require('path');
const { protect } = require('../middlewares/auth');

// Configurar multer para almacenar los archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../temp'));
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
 * Autenticación: Requiere token de usuario válido
 */
router.post('/zip',
  protect,
  upload.single('photoZip'),
  uploadController.processPhotoZip
);

module.exports = router; 