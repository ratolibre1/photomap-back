const mongoose = require('mongoose');

const publicMapSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  // Filtros guardados
  filters: {
    labels: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Label'
    }],
    startDate: Date,
    endDate: Date,
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
    near: {
      lat: Number,
      lng: Number,
      distance: Number // en metros
    },
    searchText: String,
    isPublic: {
      type: Boolean,
      default: true
    }
  },
  // Opciones de visualización
  displayOptions: {
    sortBy: {
      type: String,
      enum: ['timestamp', 'distance', 'title'],
      default: 'timestamp'
    },
    sortDirection: {
      type: String,
      enum: ['asc', 'desc'],
      default: 'desc'
    },
    limit: {
      type: Number,
      default: 100
    }
  },
  // Paleta de colores preferida para la visualización
  colorPalette: {
    type: String,
    default: 'default', // Paleta predeterminada
    trim: true
  },
  // Preferencia de idioma del usuario al crear el mapa
  language: {
    type: String,
    default: 'es', // Idioma español por defecto
    enum: ['es', 'en'], // Idiomas soportados
    required: true
  },
  // El usuario creador del mapa
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // El mapa está público o privado (antes isActive)
  isPublic: {
    type: Boolean,
    default: true
  },
  // Identificador único para compartir
  shareId: {
    type: String,
    unique: true,
    required: true
  },
  // Estadísticas de uso
  stats: {
    viewCount: {
      type: Number,
      default: 0
    },
    lastViewed: Date,
    // Registro de IPs de visitantes con su timestamp
    visitors: [{
      ip: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  }
}, {
  timestamps: true
});

// Índices para búsquedas comunes
publicMapSchema.index({ userId: 1 });
publicMapSchema.index({ shareId: 1 }, { unique: true });
publicMapSchema.index({ title: 'text', description: 'text' });
publicMapSchema.index({ isPublic: 1 });

const PublicMap = mongoose.model('PublicMap', publicMapSchema);

module.exports = PublicMap; 