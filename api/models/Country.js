const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  code: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Índice para búsquedas por nombre
countrySchema.index({ name: 1 });

const Country = mongoose.model('Country', countrySchema);
module.exports = Country; 