const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Get all expenses
router.get('/', catchAsync(async (req, res, next) => {
  const { page = 1, limit = 50, startDate, endDate, category, shop, paymentMethod } = req.query;
  
  const filter = {};
  
  // Date filter
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else {
    // Default to last 30 days if no date range provided
    filter.date = {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    };
  }
  
  if (category && category !== 'all') filter.category = category;
  if (shop && shop !== 'all') filter.shop = shop;
  if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;

  const expenses = await Expense.find(filter)
    .populate('shop', 'name shopName')
    .sort({ date: -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Expense.countDocuments(filter);

  res.json({
    success: true,
    data: expenses,
    pagination: {
      current: parseInt(page),
      total: Math.ceil(total / limit),
      results: total
    }
  });
}));

// Get single expense
router.get('/:id', catchAsync(async (req, res, next) => {
  const expense = await Expense.findById(req.params.id).populate('shop', 'name shopName');
  
  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  res.json({
    success: true,
    data: expense
  });
}));

// Create new expense
router.post('/', catchAsync(async (req, res, next) => {
  const { 
    category, 
    amount, 
    date, 
    paymentMethod, 
    description, 
    shop, 
    shopName, 
    recordedBy, 
    notes, 
    referenceNumber,
    status 
  } = req.body;

  // Enhanced validation
  if (!category || !amount || !shop) {
    return next(new AppError('Missing required fields: category, amount, and shop are required', 400));
  }

  if (amount <= 0) {
    return next(new AppError('Amount must be greater than 0', 400));
  }

  // Check if shop exists (you might want to add this validation)
  // const shopExists = await Shop.findById(shop);
  // if (!shopExists) {
  //   return next(new AppError('Shop not found', 404));
  // }

  const expenseData = {
    category: category.toLowerCase(),
    amount: parseFloat(amount),
    paymentMethod: (paymentMethod || 'cash').toLowerCase(),
    date: date ? new Date(date) : new Date(),
    description: description || `${category} expense`,
    shop: shop,
    shopName: shopName,
    recordedBy: recordedBy || 'System',
    notes: notes || '',
    referenceNumber: referenceNumber || `EXP-${Date.now().toString().slice(-6)}`,
    status: status || 'completed',
    createdBy: req.user?._id || '65d8f1a9c8b9c4a7e8f3b2a1' // Default for demo
  };

  const expense = await Expense.create(expenseData);

  // Populate the shop info in response
  await expense.populate('shop', 'name shopName');

  res.status(201).json({
    success: true,
    message: 'Expense recorded successfully',
    data: expense
  });
}));

// Update expense
router.put('/:id', catchAsync(async (req, res, next) => {
  const { category, amount, date, paymentMethod, description, shop, notes } = req.body;

  const expense = await Expense.findById(req.params.id);
  
  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  // Update fields
  if (category) expense.category = category.toLowerCase();
  if (amount) expense.amount = parseFloat(amount);
  if (date) expense.date = new Date(date);
  if (paymentMethod) expense.paymentMethod = paymentMethod.toLowerCase();
  if (description) expense.description = description;
  if (shop) expense.shop = shop;
  if (notes !== undefined) expense.notes = notes;

  await expense.save();
  
  // Populate the shop info in response
  await expense.populate('shop', 'name shopName');

  res.json({
    success: true,
    message: 'Expense updated successfully',
    data: expense
  });
}));

// Delete expense
router.delete('/:id', catchAsync(async (req, res, next) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  
  if (!expense) {
    return next(new AppError('Expense not found', 404));
  }

  res.json({
    success: true,
    message: 'Expense deleted successfully'
  });
}));

// Get expense statistics
router.get('/stats/overview', catchAsync(async (req, res, next) => {
  const { startDate, endDate, shop } = req.query;
  
  const filter = {};
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  } else {
    // Default to last 30 days
    filter.date = {
      $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    };
  }
  
  if (shop && shop !== 'all') filter.shop = shop;

  const stats = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalExpenses: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        averageExpense: { $avg: '$amount' },
        minExpense: { $min: '$amount' },
        maxExpense: { $max: '$amount' }
      }
    }
  ]);

  const byCategory = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        average: { $avg: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ]);

  const byPaymentMethod = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        average: { $avg: '$amount' }
      }
    }
  ]);

  const byShop = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$shop',
        count: { $sum: 1 },
        total: { $sum: '$amount' },
        average: { $avg: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ]);

  const recentExpenses = await Expense.find(filter)
    .populate('shop', 'name shopName')
    .sort({ date: -1, createdAt: -1 })
    .limit(5);

  res.json({
    success: true,
    data: {
      overview: stats[0] || { 
        totalExpenses: 0, 
        totalAmount: 0, 
        averageExpense: 0, 
        minExpense: 0, 
        maxExpense: 0 
      },
      byCategory,
      byPaymentMethod,
      byShop,
      recentExpenses
    }
  });
}));

module.exports = router;