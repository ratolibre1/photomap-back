const statsService = require('../services/statsService');
const { success } = require('../utils/responseFormatter');
const { AppError } = require('../utils/errorHandler');

/**
 * Obtiene estadísticas generales del sistema
 * Solo accesible para administradores
 */
exports.getSystemStats = async (req, res, next) => {
  try {
    const stats = await statsService.getSystemStats();
    return success(res, { stats });
  } catch (err) {
    next(err);
  }
};

/**
 * Obtiene estadísticas del usuario actual
 */
exports.getUserStats = async (req, res, next) => {
  try {
    const stats = await statsService.getUserStats(req.user.id);
    return success(res, { stats });
  } catch (err) {
    next(err);
  }
}; 