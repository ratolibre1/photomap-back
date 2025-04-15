const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const photoSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  originalUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    required: false
  },
  hasValidTimestamp: {
    type: Boolean,
    default: false
  },
  // Location es ahora un campo opcional completo
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: null
    },
    name: {
      type: String,
      default: null
    },
    _id: false
  },
  hasValidCoordinates: {
    type: Boolean,
    default: false
  },
  geocodingStatus: {
    type: String,
    enum: ['pending', 'completed', 'error', 'not_applicable'],
    default: 'not_applicable'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  edited: {
    type: Boolean,
    default: false
  },
  fileHash: String
}, {
  timestamps: true
});

// Índice geoespacial
photoSchema.index({ location: '2dsphere' });

// Índices para búsquedas comunes
photoSchema.index({ title: 'text', description: 'text' });

// Actualizar los índices existentes
photoSchema.index({ 'geocodingDetails.countryId': 1 });
photoSchema.index({ 'geocodingDetails.regionId': 1 });
photoSchema.index({ 'geocodingDetails.countyId': 1 });
photoSchema.index({ 'geocodingDetails.cityId': 1 });

// Agregar hook para debugging y corregir datos
photoSchema.pre('save', function (next) {
  console.log(`Pre-save hook para foto ${this._id}, modificando campos:`, this.modifiedPaths());

  // Si location existe pero no tiene coordinates, eliminar location completamente
  if (this.location && (!this.location.coordinates || this.location.coordinates.length === 0)) {
    console.log('Detectado objeto location inválido, eliminándolo');
    this.location = undefined;
  }

  next();
});

const Photo = mongoose.model('Photo', photoSchema);

module.exports = Photo; 