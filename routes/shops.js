const express = require('express');
const router = express.Router();
const Shop = require('../models/shop');
const Transaction = require('../models/Transaction');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// @desc    Get all shops
// @route   GET /api/shops
// @access  Public
router.get('/', catchAsync(async (req, res, next) => {
  const shops = await Shop.find().sort({ name: 1 });

  res.status(200).json({
    success: true,
    count: shops.length,
    data: shops
  });
}));

// @desc    Create new shop
// @route   POST /api/shops
// @access  Private/Admin
router.post('/', catchAsync(async (req, res, next) => {
  const { name, location, description } = req.body;

  if (!name) {
    return next(new AppError('Shop name is required', 400));
  }

  // Check if shop already exists
  const existingShop = await Shop.findOne({ 
    name: { $regex: new RegExp(`^${name}$`, 'i') } 
  });

  if (existingShop) {
    return next(new AppError('Shop already exists', 400));
  }

  const shop = await Shop.create({
    name: name.trim(),
    location: location || '',
    description: description || ''
  });

  res.status(201).json({
    success: true,
    data: shop,
    message: 'Shop created successfully'
  });
}));

// @desc    Update shop
// @route   PUT /api/shops/:id
// @access  Private/Admin
router.put('/:id', catchAsync(async (req, res, next) => {
  const shop = await Shop.findByIdAndUpdate(
    req.params.id,
    req.body,
    { 
      new: true,
      runValidators: true
    }
  );

  if (!shop) {
    return next(new AppError('Shop not found', 404));
  }

  res.status(200).json({
    success: true,
    data: shop,
    message: 'Shop updated successfully'
  });
}));

// @desc    Delete shop
// @route   DELETE /api/shops/:id
// @access  Private/Admin
router.delete('/:id', catchAsync(async (req, res, next) => {
  const shop = await Shop.findByIdAndDelete(req.params.id);

  if (!shop) {
    return next(new AppError('Shop not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Shop deleted successfully'
  });
}));

module.exports = router;