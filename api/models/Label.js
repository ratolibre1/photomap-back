const mongoose = require('mongoose');

const labelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  // Campos adicionales que podrían ser útiles
  color: String,
  textColor: String,
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Índice compuesto para garantizar nombres únicos dentro de una categoría
labelSchema.index({ name: 1, categoryId: 1 }, { unique: true });

module.exports = mongoose.model('Label', labelSchema); 