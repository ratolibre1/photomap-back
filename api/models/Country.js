const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Índice para búsquedas por nombre
countrySchema.index({ name: 1 });

// Índice compuesto para garantizar nombres únicos por usuario
countrySchema.index({ name: 1, userId: 1 }, { unique: true });

const Country = mongoose.model('Country', countrySchema);
module.exports = Country; 