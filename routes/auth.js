const express = require('express');
const asyncHandler = require('../middlewares/async');
const { protect, authorize } = require('../middlewares/auth');
const Cashier = require('../models/Cashier');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Main login endpoint - handles both admin and cashier logins
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check if email and password exist
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  console.log('🔐 Login attempt for:', email);

  // First, check if it's an admin
  let user = await Admin.findOne({ email: email.toLowerCase() });
  let userRole = 'admin';

  if (!user) {
    // If not admin, check for cashier
    user = await Cashier.findOne({ email: email.toLowerCase() }).select('+password');
    userRole = 'cashier';
  }

  if (!user) {
    console.log('❌ User not found:', email);
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password'
    });
  }

  // Verify password
  let isPasswordValid = false;
  
  if (userRole === 'admin') {
    // For admin, check against environment variable or stored hash
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    isPasswordValid = password === adminPassword;
    
    // If admin has a password hash, use bcrypt
    if (user.password) {
      isPasswordValid = await bcrypt.compare(password, user.password);
    }
  } else {
    // For cashier, always use bcrypt
    isPasswordValid = await bcrypt.compare(password, user.password);
  }

  if (!isPasswordValid) {
    console.log('❌ Invalid password for:', email);
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password'
    });
  }

  // Check if user is active
  if (user.status !== 'active') {
    console.log('❌ Account deactivated:', email);
    return res.status(401).json({
      success: false,
      message: 'Your account has been deactivated'
    });
  }

  // Remove password from output
  if (user.password) {
    user.password = undefined;
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Create user response object
  const userResponse = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: userRole,
    status: user.status,
    lastLogin: user.lastLogin
  };

  // Add role-specific fields
  if (userRole === 'cashier') {
    userResponse.phone = user.phone;
    userResponse.club = user.club;
  }

  console.log('✅ Login successful:', email, 'Role:', userRole);

  // Set session if available
  if (req.session) {
    req.session.user = userResponse;
    console.log('✅ Session created for user:', email);
  }

  res.status(200).json({
    success: true,
    user: userResponse,
    message: `${userRole.charAt(0).toUpperCase() + userRole.slice(1)} login successful`
  });
}));

// Cashier-specific login endpoint
router.post('/cashier/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password'
    });
  }

  console.log('🔐 Cashier login attempt for:', email);

  const cashier = await Cashier.findOne({ email: email.toLowerCase() }).select('+password');
  
  if (!cashier || !(await bcrypt.compare(password, cashier.password))) {
    console.log('❌ Invalid cashier credentials:', email);
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password'
    });
  }

  if (cashier.status !== 'active') {
    console.log('❌ Cashier account deactivated:', email);
    return res.status(401).json({
      success: false,
      message: 'Your account has been deactivated'
    });
  }

  // Remove password from output
  cashier.password = undefined;

  // Update last login
  cashier.lastLogin = new Date();
  await cashier.save({ validateBeforeSave: false });

  const cashierResponse = {
    _id: cashier._id,
    name: cashier.name,
    email: cashier.email,
    phone: cashier.phone,
    club: cashier.club,
    role: 'cashier',
    status: cashier.status,
    lastLogin: cashier.lastLogin
  };

  // Set session if available
  if (req.session) {
    req.session.user = cashierResponse;
  }

  console.log('✅ Cashier login successful:', email);

  res.status(200).json({
    success: true,
    user: cashierResponse,
    message: 'Cashier login successful'
  });
}));

// Register new cashier (admin only)
router.post('/register', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { name, email, password, phone, club } = req.body;

  // Validation
  if (!name || !email || !password || !phone) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, phone, and password are required'
    });
  }

  // Check if cashier already exists
  const existingCashier = await Cashier.findOne({ 
    $or: [{ email: email.toLowerCase() }, { phone }] 
  });
  
  if (existingCashier) {
    return res.status(400).json({
      success: false,
      message: 'Cashier with this email or phone already exists'
    });
  }

  // Create new cashier
  const cashier = await Cashier.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    phone: phone.trim(),
    club: club || '',
    role: 'cashier',
    status: 'active'
  });

  // Remove password from output
  cashier.password = undefined;

  console.log('✅ New cashier registered:', email);

  res.status(201).json({
    success: true,
    message: 'Cashier created successfully',
    user: {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone,
      club: cashier.club,
      role: cashier.role,
      status: cashier.status
    }
  });
}));

// Logout endpoint
router.post('/logout', asyncHandler(async (req, res) => {
  // Clear session if exists
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout session error:', err);
      }
    });
  }

  console.log('✅ User logged out');

  res.status(200).json({
    success: true,
    message: 'Logout successful'
  });
}));

// Get current user profile
router.get('/me', protect, asyncHandler(async (req, res) => {
  let userData;
  
  if (req.user.role === 'admin') {
    userData = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: 'admin',
      status: 'active',
      lastLogin: req.user.lastLogin
    };
  } else {
    const cashier = await Cashier.findById(req.user._id);
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    userData = {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone,
      club: cashier.club,
      role: cashier.role,
      status: cashier.status,
      lastLogin: cashier.lastLogin
    };
  }

  res.status(200).json({
    success: true,
    user: userData
  });
}));

// Check authentication status
router.get('/check', asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Authentication service is running',
    timestamp: new Date().toISOString(),
    authType: 'session-based'
  });
}));

// Simple health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auth service healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;