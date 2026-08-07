const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const productController = require('../controllers/productController');

// Make sure ALL these routes exist
router.get('/', protect, productController.getAllProducts);
router.get('/active', protect, productController.getActiveProducts);
router.get('/low-stock', protect, productController.getLowStockProducts);
router.get('/shop/:shop', protect, productController.getProductsByShop);
router.get('/:id', protect, productController.getProduct);
router.post('/', protect, authorize('admin', 'manager'), productController.createProduct);

// ✅ CRITICAL: These two routes must exist
router.put('/:id', protect, authorize('admin', 'manager', 'cashier'), productController.updateProduct);
router.patch('/bulk-stock', protect, authorize('admin', 'manager', 'cashier'), productController.bulkUpdateStock);

router.delete('/:id', protect, authorize('admin', 'manager'), productController.deleteProduct);

module.exports = router;