const express = require('express');
const asyncHandler = require('../middlewares/async');
const { protect, authorize } = require('../middlewares/auth');
const router = express.Router();

// Protected report routes
router.get('/sales', protect, authorize('admin'), asyncHandler(async (req, res) => {
  // Sales report logic
}));

router.get('/transactions', protect, authorize('admin'), asyncHandler(async (req, res) => {
  // Transactions report logic
}));

module.exports = router;