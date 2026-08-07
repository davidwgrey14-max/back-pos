const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    default: 'admin',
    enum: ['admin', 'user'] // adjust roles as needed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Optional: Add index for better performance
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);