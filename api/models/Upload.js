const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const uploadSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: String, // Para ZIP, o null para carga simple
  fileSize: Number,
  uploadType: {
    type: String,
    enum: ['zip', 'multiple'],
    required: true
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  photos: [{
    photoId: { type: Schema.Types.ObjectId, ref: 'Photo' },
    fileName: String,
    status: {
      type: String,
      enum: ['processed', 'duplicate', 'error'],
      required: true
    },
    errorMessage: String
  }],
  stats: {
    processed: Number,
    duplicates: Number,
    errors: Number,
    totalPhotos: Number
  },
  errorMessage: String,
  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  processingTimeMs: Number
}, {
  timestamps: true
});

// Índice para búsquedas por usuario
uploadSchema.index({ userId: 1, createdAt: -1 });

const Upload = mongoose.model('Upload', uploadSchema);

module.exports = Upload; 