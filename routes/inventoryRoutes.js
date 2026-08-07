// src/routes/inventoryRoutes.js
const express = require('express');
const { protect, authorize } = require('../middlewares/auth');
const {
  getInventory,
  updateStock,
  getInventoryStats,
  restockProducts
} = require('../controllers/inventoryController');

const router = express.Router();

// Public stats (could be protected if needed)
router.get('/stats', getInventoryStats);

// Protected routes
router.use(protect);

router.route('/')
  .get(authorize('admin', 'manager', 'cashier'), getInventory);

router.route('/restock')
  .post(authorize('admin', 'manager'), restockProducts);

router.route('/update-stock')
  .post(authorize('admin', 'manager'), updateStock);

// Advanced inventory management routes
router.get('/low-stock', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const lowStockProducts = await Product.getLowStock();
    res.status(200).json({
      success: true,
      data: lowStockProducts
    });
  } catch (err) {
    next(err);
  }
});

router.get('/out-of-stock', authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const outOfStockProducts = await Product.getOutOfStock();
    res.status(200).json({
      success: true,
      data: outOfStockProducts
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;