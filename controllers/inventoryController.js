// src/controllers/inventoryController.js
const Product = require('../models/products');
const Transaction = require('../models/Transaction');

// Get all inventory with advanced filtering
exports.getInventory = async (req, res, next) => {
  try {
    const { 
      search, 
      category, 
      shop, 
      lowStock, 
      outOfStock,
      page = 1, 
      limit = 10 
    } = req.query;

    let query = { isActive: true };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Shop filter
    if (shop) {
      query.shop = shop;
    }

    // Stock status filters
    if (lowStock === 'true') {
      query.stock = { $lte: '$minStockLevel', $gt: 0 };
    }

    if (outOfStock === 'true') {
      query.stock = 0;
    }

    const skip = (page - 1) * limit;

    const [inventory, total] = await Promise.all([
      Product.find(query)
        .select('-__v')
        .sort({ stock: 1, name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Product.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: inventory,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// Update stock manually
exports.updateStock = async (req, res, next) => {
  try {
    const { productId, quantity, reason, notes } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and quantity are required'
      });
    }

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.updateStock(quantity);

    // Log the stock adjustment
    await Transaction.create({
      type: 'stock_adjustment',
      products: [{
        product: productId,
        quantity: Math.abs(quantity),
        price: product.buyingPrice
      }],
      totalAmount: 0,
      paymentMethod: 'system',
      status: 'completed',
      notes: notes || `Stock ${quantity > 0 ? 'added' : 'removed'}: ${reason || 'Manual adjustment'}`,
      createdBy: req.user.id
    });

    res.status(200).json({
      success: true,
      data: product,
      message: `Stock updated successfully. New stock: ${product.stock}`
    });
  } catch (err) {
    next(err);
  }
};

// Bulk stock update for sales
exports.bulkUpdateStock = async (products) => {
  try {
    const updateOperations = products.map(async (item) => {
      const product = await Product.findById(item.product);
      if (product) {
        await product.updateStock(-item.quantity);
        return { productId: item.product, success: true };
      }
      return { productId: item.product, success: false, error: 'Product not found' };
    });

    return await Promise.all(updateOperations);
  } catch (error) {
    throw new Error(`Bulk stock update failed: ${error.message}`);
  }
};

// Get inventory statistics
exports.getInventoryStats = async (req, res, next) => {
  try {
    const [totalProducts, lowStockCount, outOfStockCount, categories] = await Promise.all([
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ stock: { $lte: '$minStockLevel', $gt: 0 }, isActive: true }),
      Product.countDocuments({ stock: 0, isActive: true }),
      Product.distinct('category', { isActive: true })
    ]);

    // Get total inventory value
    const inventoryValue = await Product.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalValue: { $sum: { $multiply: ['$stock', '$buyingPrice'] } }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        lowStockCount,
        outOfStockCount,
        categories,
        totalInventoryValue: inventoryValue[0]?.totalValue || 0,
        stockHealth: totalProducts > 0 ? 
          ((totalProducts - lowStockCount - outOfStockCount) / totalProducts * 100).toFixed(1) : 0
      }
    });
  } catch (err) {
    next(err);
  }
};

// Restock products
exports.restockProducts = async (req, res, next) => {
  try {
    const { restockItems } = req.body;

    if (!Array.isArray(restockItems) || restockItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Restock items array is required'
      });
    }

    const results = await Promise.all(
      restockItems.map(async (item) => {
        try {
          const product = await Product.findById(item.productId);
          if (!product) {
            return { productId: item.productId, success: false, error: 'Product not found' };
          }

          await product.updateStock(item.quantity);
          
          return { 
            productId: item.productId, 
            success: true, 
            newStock: product.stock,
            productName: product.name 
          };
        } catch (error) {
          return { productId: item.productId, success: false, error: error.message };
        }
      })
    );

    res.status(200).json({
      success: true,
      data: results,
      message: 'Restock operation completed'
    });
  } catch (err) {
    next(err);
  }
};