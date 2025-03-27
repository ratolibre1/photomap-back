const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  originalUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: false
    }
  },
  // Flag para indicar si la foto tiene coordenadas válidas
  hasValidCoordinates: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    required: true
  },
  labels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Label'
  }],
  metadata: {
    camera: String,
    lens: String,
    aperture: String,
    shutterSpeed: String,
    iso: Number,
    dimensions: {
      width: Number,
      height: Number
    },
    fileSize: Number,
    fileType: String
  },
  isPublic: {
    type: Boolean,
    default: true // true = public, false = private
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  geocodingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  geocodingDetails: {
    displayName: String,
    countryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Country'
    },
    regionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region'
    },
    countyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'County'
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'City'
    },
    updatedAt: Date
  },
  reviewed: {
    type: Boolean,
    default: false
  },
  fileHash: {
    type: String,
    index: true  // Agregar índice para búsquedas rápidas
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Índice para búsquedas geoespaciales
photoSchema.index({ location: '2dsphere' });

// Índices para búsquedas comunes
photoSchema.index({ labels: 1 });
photoSchema.index({ timestamp: 1 });

// Agregar índices para búsquedas por región
photoSchema.index({ 'geocodingDetails.country': 1 });
photoSchema.index({ 'geocodingDetails.region': 1 });
photoSchema.index({ 'geocodingDetails.city': 1 });

// Agregar después de los otros índices
photoSchema.index({ title: 'text', description: 'text' });

// Actualizar los índices existentes
photoSchema.index({ 'geocodingDetails.countryId': 1 });
photoSchema.index({ 'geocodingDetails.regionId': 1 });
photoSchema.index({ 'geocodingDetails.countyId': 1 });
photoSchema.index({ 'geocodingDetails.cityId': 1 });

// Agregar hook para debugging
photoSchema.pre('save', function (next) {
  console.log(`Pre-save hook para foto ${this._id}, modificando campos:`, this.modifiedPaths());
  next();
});

const Photo = mongoose.model('Photo', photoSchema);

module.exports = Photo; 