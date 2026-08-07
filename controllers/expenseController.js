const Expense = require('../models/Expense');
const asyncHandler = require('../middlewares/async');

// @desc    Get all expenses
// @route   GET /api/expenses
// @access  Private
exports.getExpenses = asyncHandler(async (req, res) => {
  const { startDate, endDate, shop, category, page = 1, limit = 20 } = req.query;
  
  let filter = {};
  
  if (startDate && endDate) {
    filter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  if (shop) filter.shop = shop;
  if (category) filter.category = category;

  const expenses = await Expense.find(filter)
    .sort({ date: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Expense.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: expenses.length,
    total,
    data: expenses
  });
});

// @desc    Get expense statistics
// @route   GET /api/expenses/stats
// @access  Private
exports.getExpenseStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, shop } = req.query;
  
  let match = {};
  
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  if (shop) match.shop = shop;

  const stats = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const categoryStats = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);

  const result = stats[0] || {
    totalAmount: 0,
    count: 0
  };

  res.status(200).json({
    success: true,
    data: {
      overview: result,
      categories: categoryStats
    }
  });
});

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
exports.createExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.create(req.body);

  res.status(201).json({
    success: true,
    data: expense
  });
});