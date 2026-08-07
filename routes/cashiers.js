const express = require('express');
const router = express.Router();
const Cashier = require('../models/Cashier');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Load environment variables properly
require('dotenv').config();

// Validate JWT secret exists
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined.');
  process.exit(1);
}

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign(
    { id, role: 'cashier' }, 
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

// GET all cashiers
router.get('/', catchAsync(async (req, res, next) => {
  const cashiers = await Cashier.find({}).select('-password');
  res.status(200).json({
    success: true,
    count: cashiers.length,
    data: cashiers
  });
}));

// POST /cashiers - Register new cashier (ADMIN ONLY)
router.post('/', catchAsync(async (req, res, next) => {
  const { name, email, password, phone, club } = req.body;
  
  // Validation - REMOVE phone from required fields
  if (!name || !email || !password) {
    return next(new AppError('Name, email, and password are required', 400));
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.toLowerCase())) {
    return next(new AppError('Please provide a valid email address', 400));
  }

  // Check if cashier already exists (only check email since phone is optional)
  const existingCashier = await Cashier.findOne({ 
    email: email.toLowerCase() 
  });
  
  if (existingCashier) {
    return next(new AppError('Cashier with this email already exists', 400));
  }

  // Create new cashier
  const cashier = await Cashier.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    phone: phone ? phone.trim() : '', // Handle optional phone
    club: club || '',
    role: 'cashier',
    status: 'active'
  });

  // Generate token (optional for admin-created accounts)
  const token = generateToken(cashier._id);

  res.status(201).json({
    success: true,
    message: 'Cashier created successfully',
    data: {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone,
      club: cashier.club,
      role: cashier.role,
      status: cashier.status
    },
    token
  });
}));

// PATCH /cashiers/:id - Update cashier
router.patch('/:id', catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, email, phone, club, status } = req.body;

  if (!name || !email) {
    return next(new AppError('Name and email are required', 400));
  }

  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.toLowerCase())) {
    return next(new AppError('Please provide a valid email address', 400));
  }

  // Check if email already exists for other cashiers
  const existingCashier = await Cashier.findOne({
    $and: [
      { _id: { $ne: id } },
      { email: email.toLowerCase() }
    ]
  });

  if (existingCashier) {
    return next(new AppError('Email already in use by another cashier', 400));
  }

  const cashier = await Cashier.findByIdAndUpdate(
    id,
    { 
      name: name.trim(), 
      email: email.toLowerCase().trim(), 
      phone: phone ? phone.trim() : '',
      club: club || '',
      status: status || 'active'
    },
    { new: true, runValidators: true }
  ).select('-password');

  if (!cashier) {
    return next(new AppError('Cashier not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Cashier updated successfully',
    data: cashier
  });
}));

// DELETE /cashiers/:id - Delete cashier
router.delete('/:id', catchAsync(async (req, res, next) => {
  const { id } = req.params;
  
  const cashier = await Cashier.findByIdAndDelete(id);

  if (!cashier) {
    return next(new AppError('Cashier not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Cashier deleted successfully'
  });
}));

// Cashier login - FIXED VERSION
router.post('/login', catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  console.log('Login attempt:', { email: email?.toLowerCase() });
  
  if (!email || !password) {
    console.log('Missing email or password');
    return next(new AppError('Email and password are required', 400));
  }

  // Find cashier by email only (since phone is optional now)
  const cashier = await Cashier.findOne({
    email: email.toLowerCase().trim(),
    status: 'active'
  }).select('+password');
  
  console.log('Found cashier:', cashier ? cashier.email : 'None');
  
  if (!cashier) {
    console.log('No active cashier found with email:', email);
    return next(new AppError('Invalid credentials or inactive account', 401));
  }

  // Use the verifyPassword method from the model
  const isMatch = await cashier.verifyPassword(password);
  console.log('Password match:', isMatch);
  
  if (!isMatch) {
    console.log('Password does not match for:', cashier.email);
    return next(new AppError('Invalid credentials', 401));
  }

  // Update last login
  cashier.lastLogin = Date.now();
  await cashier.save({ validateBeforeSave: false });

  // Generate token
  const token = generateToken(cashier._id);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      phone: cashier.phone,
      club: cashier.club,
      role: cashier.role,
      status: cashier.status,
      lastLogin: cashier.lastLogin
    },
    token
  });
}));

module.exports = router;