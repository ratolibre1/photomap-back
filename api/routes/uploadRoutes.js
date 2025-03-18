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
    cb(null, `takeout-${Date.now()}${path.extname(file.originalname)}`);
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

// Rutas
router.post('/zip',
  protect,
  upload.single('takeoutZip'),
  uploadController.processTakeoutZip
);

module.exports = router; 