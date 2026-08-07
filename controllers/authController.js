const Cashier = require('../models/Cashier');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const validator = require('validator');

// @desc    Register new cashier
// @route   POST /api/v1/cashiers
// @access  Private/Admin
exports.registerCashier = catchAsync(async (req, res, next) => {
  const { name, email, password, club } = req.body;

  // Validate input
  if (!name || !name.trim()) {
    return next(new AppError('Name is required', 400));
  }

  if (!email || !validator.isEmail(email)) {
    return next(new AppError('Please provide a valid email', 400));
  }

  if (!password || password.length < 8) {
    return next(new AppError('Password must be at least 8 characters', 400));
  }

  // Check for existing cashier
  const existingCashier = await Cashier.findOne({ email });
  if (existingCashier) {
    return next(new AppError('Email already in use', 400));
  }

  // Create new cashier
  const cashier = await Cashier.create({
    name: name.trim(),
    email: email.toLowerCase(),
    password,
    role: 'cashier',
    club,
    status: 'active' // Default status
  });

  // Remove password from output
  cashier.password = undefined;

  res.status(201).json({
    status: 'success',
    data: {
      cashier
    }
  });
});

// @desc    Get all cashiers
// @route   GET /api/v1/cashiers
// @access  Private/Admin
exports.getAllCashiers = catchAsync(async (req, res, next) => {
  // Add filtering/pagination if needed
  const cashiers = await Cashier.find().select('-password');
  
  res.status(200).json({
    status: 'success',
    results: cashiers.length,
    data: {
      cashiers
    }
  });
});

// @desc    Get single cashier
// @route   GET /api/v1/cashiers/:id
// @access  Private/Admin
exports.getCashier = catchAsync(async (req, res, next) => {
  const cashier = await Cashier.findById(req.params.id).select('-password');
  
  if (!cashier) {
    return next(new AppError('No cashier found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      cashier
    }
  });
});

// @desc    Update cashier
// @route   PATCH /api/v1/cashiers/:id
// @access  Private/Admin
exports.updateCashier = catchAsync(async (req, res, next) => {
  // Filter allowed fields to update
  const allowedUpdates = ['name', 'email', 'status', 'club'];
  const updates = Object.keys(req.body);
  
  const isValidOperation = updates.every(update => 
    allowedUpdates.includes(update)
  );

  if (!isValidOperation) {
    return next(new AppError('Invalid updates!', 400));
  }

  // Handle email uniqueness if email is being updated
  if (req.body.email) {
    const existingCashier = await Cashier.findOne({ 
      email: req.body.email.toLowerCase(),
      _id: { $ne: req.params.id }
    });
    
    if (existingCashier) {
      return next(new AppError('Email already in use', 400));
    }
  }

  const cashier = await Cashier.findByIdAndUpdate(
    req.params.id,
    req.body,
    { 
      new: true,
      runValidators: true
    }
  ).select('-password');

  if (!cashier) {
    return next(new AppError('No cashier found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      cashier
    }
  });
});

// @desc    Delete cashier
// @route   DELETE /api/v1/cashiers/:id
// @access  Private/Admin
exports.deleteCashier = catchAsync(async (req, res, next) => {
  const cashier = await Cashier.findByIdAndDelete(req.params.id);

  if (!cashier) {
    return next(new AppError('No cashier found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});