const express = require('express');
const router = express.Router();
const apiRoutes = require('./api');
const userRoutes = require('./userRoutes');
const categoryRoutes = require('./categoryRoutes');
const labelRoutes = require('./labelRoutes');
const photoRoutes = require('./photoRoutes');
const statsRoutes = require('./statsRoutes');
const locationRoutes = require('./locationRoutes');
const uploadRoutes = require('./uploadRoutes');
const adminRoutes = require('./adminRoutes');

// Agrupar todas las rutas
router.use('/api', apiRoutes);
router.use('/users', userRoutes);
router.use('/categories', categoryRoutes);
router.use('/labels', labelRoutes);
router.use('/photos', photoRoutes);
router.use('/stats', statsRoutes);
router.use('/location', locationRoutes);
router.use('/upload', uploadRoutes);
router.use('/admin', adminRoutes);

// Eliminar rutas de autenticación de Google
// router.get('/auth/google', photosController.authGoogle);
// router.get('/auth/google/callback', photosController.handleCallback);

// Eliminar rutas protegidas de Google Photos
// router.use('/photos/google', protect, googlePhotosRoutes);

module.exports = router; 