// createAdminUser.js - FIXED VERSION
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'MONGODB_URI=mongodb+srv://kinyuastanzo6759_db_user:Y9P9gdROuewvBmq8@cluster0.4rtcx4y.mongodb.net/?appName=Cluster0');
    console.log('✅ Connected to MongoDB');
    // MONGODB_URI=mongodb+srv://kinyuastanzo6759_db_user:Y9P9gdROuewvBmq8@cluster0.4rtcx4y.mongodb.net/?appName=Cluster0
    // FIXED PATH: Go up one level to backend root, then into models
    const User = require('../models/User');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'davidwgrey14@gmail.com'});
    if (existingAdmin) {
      console.log('⚠️ Admin user already exists');
      console.log('📧 Existing user:', existingAdmin.email);
      await mongoose.disconnect();
      return;
    }
    
    // Create new admin user
    const adminUser = new User({
      email:  'davidwgrey14@gmail.com',
      password: await bcrypt.hash('admin123', 12),
      name: 'System Administrator',
      role: 'admin',
      createdAt: new Date()
    });

    await adminUser.save();
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: davidwgrey14@gmail.com');
    console.log('🔑 Password: Eliud342*#');
    console.log('💡 Please change these credentials after login!');
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser();