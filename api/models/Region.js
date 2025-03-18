const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  countryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Country',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Índices para búsquedas comunes
regionSchema.index({ name: 1, countryId: 1 }, { unique: true });
regionSchema.index({ countryId: 1 });

const Region = mongoose.model('Region', regionSchema);
module.exports = Region; 