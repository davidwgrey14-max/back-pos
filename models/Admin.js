const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    default: 'davidwgrey14@gmail.com'
  },
  password: { 
    type: String, 
    required: true
  },
  name: {
    type: String,
    default: 'Administrator'
  },
  role: {
    type: String,
    default: 'admin'
  },
  status: {
    type: String,
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  }
});

// Hash password before saving
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
adminSchema.methods.correctPassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update last login
adminSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Static method to get or create admin account
adminSchema.statics.getAdminAccount = async function() {
  const adminEmail = 'davidwgrey14@gmail.com';
  const adminPassword = 'Eliud342*#';
  
  let admin = await this.findOne({ email: adminEmail });
  
  if (!admin) {
    console.log('👤 Creating new admin account...');
    
    // Create admin with plain password - it will be hashed by pre-save hook
    admin = new this({
      email: adminEmail,
      password: adminPassword,
      name: 'Administrator',
      role: 'admin',
      status: 'active'
    });
    
    await admin.save();
    console.log('✅ Admin account created successfully');
  } else {
    console.log('✅ Admin account found:', admin.email);
  }
  
  return admin;
};

// Method to get safe user data (without password)
adminSchema.methods.toSafeObject = function() {
  const admin = this.toObject();
  delete admin.password;
  return admin;
};

module.exports = mongoose.model('Admin', adminSchema);