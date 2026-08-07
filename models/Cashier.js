const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const cashierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/\S+@\S+\.\S+/, 'Please use a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String,
    // REMOVE required: true to make it optional
    match: [/^\+?[0-9\s\-\(\)]{10,}$/, 'Please use a valid phone number'],
    trim: true,
    default: '' // Add default empty string
  },
  club: {
    type: String,
    trim: true,
    default: ''
  },
  role: {
    type: String,
    enum: ['cashier'],
    default: 'cashier'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

// Password hashing middleware
cashierSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

// Password verification method
cashierSchema.methods.verifyPassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Index for better query performance
cashierSchema.index({ email: 1 });
cashierSchema.index({ phone: 1 });
cashierSchema.index({ status: 1 });

// Virtual for cashier's full info (without password)
cashierSchema.virtual('profile').get(function() {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    club: this.club,
    role: this.role,
    status: this.status,
    lastLogin: this.lastLogin,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
});

// Static method to find by email or phone
cashierSchema.statics.findByEmailOrPhone = function(identifier) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase().trim() },
      { phone: identifier.trim() }
    ]
  });
};

// Check if model already exists to prevent OverwriteModelError
const Cashier = mongoose.models.Cashier || mongoose.model('Cashier', cashierSchema);

module.exports = Cashier;