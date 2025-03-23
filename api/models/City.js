const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
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
  regionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Region',
    required: true
  },
  countyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'County',
    required: true
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

// Índices para búsquedas
citySchema.index({ name: 1, countyId: 1 }, { unique: true });
citySchema.index({ countyId: 1 });
citySchema.index({ regionId: 1 });
citySchema.index({ countryId: 1 });

const City = mongoose.model('City', citySchema);
module.exports = City; 