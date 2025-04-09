const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Por favor ingresa tu nombre'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Por favor ingresa tu email'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Por favor ingresa tu contraseña'],
    minlength: 6,
    select: false // No mostrar password en las consultas
  },
  biography: {
    type: String,
    default: '',
    trim: true,
    maxlength: [3000, 'La biografía no puede tener más de 3000 caracteres']
  },
  profilePhoto: {
    key: String,       // S3 key
    url: String,       // URL completa
    updatedAt: Date    // Fecha de última actualización
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  active: {
    type: Boolean,
    default: true
  },
  preferredLanguage: {
    type: String,
    enum: ['es', 'en', 'es-CL', 'en-US'], // Códigos ISO 639-1 (opcionalmente con región)
    default: 'es-CL'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  googleTokens: {
    access_token: String,
    refresh_token: String,
    scope: String,
    token_type: String,
    expiry_date: Number
  }
}, {
  timestamps: true,
  versionKey: false
});

// Encriptar contraseña antes de guardar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Comparar contraseñas
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 