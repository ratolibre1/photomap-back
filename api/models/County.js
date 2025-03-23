const mongoose = require('mongoose');

const countySchema = new mongoose.Schema({
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
countySchema.index({ name: 1, regionId: 1 }, { unique: true });
countySchema.index({ regionId: 1 });
countySchema.index({ countryId: 1 });

const County = mongoose.model('County', countySchema);
module.exports = County; 