const Product = require('../models/products');
const Shop = require('../models/shop');
const asyncHandler = require('../middlewares/async');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose');

// @desc    Create new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = asyncHandler(async (req, res, next) => {
  const { 
    name, 
    buyingPrice, 
    minSellingPrice, 
    shop, // Shop ID
    shopName // Shop name from frontend
  } = req.body;

  console.log('🛒 CREATE PRODUCT REQUEST BODY:', req.body);

  // Check for required fields
  if (!name || !buyingPrice || !minSellingPrice || !shop) {
    return next(new ErrorResponse('Name, buying price, selling price, and shop are required', 400));
  }

  // Validate that selling price is not less than buying price
  if (minSellingPrice < buyingPrice) {
    return next(new ErrorResponse('Selling price cannot be less than buying price', 400));
  }

  // ✅ CRITICAL: Always fetch shop name from database using shop ID
  let finalShopName = shopName;
  
  try {
    console.log('🔍 Looking up shop with ID:', shop);
    const shopData = await Shop.findById(shop);
    
    if (!shopData) {
      console.error('❌ Shop not found with ID:', shop);
      return next(new ErrorResponse('Shop not found', 404));
    }
    
    // ✅ USE THE SHOP NAME FROM DATABASE
    finalShopName = shopData.name;
    console.log('✅ Found shop:', finalShopName, 'for ID:', shop);
    
  } catch (error) {
    console.error('❌ Error fetching shop:', error);
    return next(new ErrorResponse('Invalid shop ID', 400));
  }

  // ✅ Create product with VERIFIED shop name
  const productData = {
    name: name.trim(),
    category: req.body.category ? req.body.category.trim() : 'General',
    buyingPrice: Number(buyingPrice),
    minSellingPrice: Number(minSellingPrice),
    currentStock: Number(req.body.currentStock) || 0,
    minStockLevel: Number(req.body.minStockLevel) || 5,
    shop: shop, // Shop ID
    shopName: finalShopName, // ✅ VERIFIED shop name
    description: req.body.description || '',
    supplier: req.body.supplier || '',
    unit: req.body.unit || 'pcs',
    reorderPoint: Number(req.body.reorderPoint) || 10
  };

  console.log('📦 FINAL PRODUCT DATA TO SAVE:', {
    name: productData.name,
    shopId: productData.shop,
    shopName: productData.shopName,
    category: productData.category
  });

  try {
    const product = await Product.create(productData);
    
    console.log('✅ PRODUCT CREATED SUCCESSFULLY:', {
      _id: product._id,
      name: product.name,
      shop: product.shop,
      shopName: product.shopName
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    console.error('❌ ERROR CREATING PRODUCT:', error);
    return next(new ErrorResponse('Failed to create product: ' + error.message, 500));
  }
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin/Manager/Cashier
const updateProduct = asyncHandler(async (req, res, next) => {
  console.log('🔄 UPDATE PRODUCT REQUEST:', {
    id: req.params.id,
    body: req.body
  });

  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // ✅ UPDATE SHOP NAME IF SHOP ID CHANGES
  if (req.body.shop && req.body.shop !== product.shop.toString()) {
    console.log('🔄 Shop ID changed, fetching new shop name...');
    
    try {
      const shopData = await Shop.findById(req.body.shop);
      if (!shopData) {
        return next(new ErrorResponse('Shop not found', 404));
      }
      
      // ✅ UPDATE SHOP NAME
      req.body.shopName = shopData.name;
      console.log('✅ Updated shop name to:', shopData.name, 'for shop ID:', req.body.shop);
      
    } catch (error) {
      console.error('❌ Error fetching shop during update:', error);
      return next(new ErrorResponse('Invalid shop ID', 400));
    }
  }

  // Update fields
  const updateFields = [
    'name', 'category', 'buyingPrice', 'minSellingPrice', 
    'currentStock', 'minStockLevel', 'shop', 'shopName', 
    'barcode', 'supplier', 'description', 'unit', 'reorderPoint'
  ];

  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  // Validate selling price
  if (product.minSellingPrice < product.buyingPrice) {
    return next(new ErrorResponse('Selling price cannot be less than buying price', 400));
  }

  try {
    await product.save();
    
    console.log('✅ PRODUCT UPDATED SUCCESSFULLY:', {
      _id: product._id,
      name: product.name,
      shop: product.shop,
      shopName: product.shopName
    });

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('❌ ERROR UPDATING PRODUCT:', error);
    return next(new ErrorResponse('Failed to update product: ' + error.message, 500));
  }
});

// @desc    Get all products with advanced filtering
// @route   GET /api/products
// @access  Private
const getAllProducts = asyncHandler(async (req, res, next) => {
  const { 
    shop, 
    category, 
    lowStock, 
    search, 
    page = 1, 
    limit = 20,
    sortBy = 'name',
    sortOrder = 'asc'
  } = req.query;
  
  // Build filter object
  let filter = { isActive: true };
  
  if (shop) filter.shop = shop;
  if (category) filter.category = category;
  
  // Low stock filter
  if (lowStock === 'true') {
    filter.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
  }
  
  // Search across multiple fields
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
      { supplier: { $regex: search, $options: 'i' } },
      { shopName: { $regex: search, $options: 'i' } }
    ];
  }

  // Validate and parse pagination parameters
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  
  // Build sort object
  const sortOptions = {};
  const validSortFields = ['name', 'category', 'currentStock', 'buyingPrice', 'minSellingPrice', 'createdAt', 'shopName'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
  sortOptions[sortField] = sortOrder === 'desc' ? -1 : 1;

  const products = await Product.find(filter)
    .sort(sortOptions)
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .select('-__v');

  const total = await Product.countDocuments(filter);

  // ✅ DEBUG: Check if products have shopName
  console.log(`📊 Found ${products.length} products`);
  products.forEach(p => {
    console.log(`   - ${p.name}: shop=${p.shop}, shopName=${p.shopName || 'MISSING'}`);
  });

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    data: products,
    pagination: {
      current: pageNum,
      totalPages: Math.ceil(total / limitNum),
      limit: limitNum,
      hasNext: pageNum < Math.ceil(total / limitNum),
      hasPrev: pageNum > 1
    }
  });
});

// Other controller functions remain the same...
const getActiveProducts = asyncHandler(async (req, res, next) => {
  const { shop } = req.query;
  
  if (!shop) {
    return next(new ErrorResponse('Shop parameter is required', 400));
  }

  const products = await Product.find({ 
    shop, 
    isActive: true,
    currentStock: { $gt: 0 }
  })
  .select('name category buyingPrice minSellingPrice currentStock barcode supplier shopName')
  .sort({ name: 1 });

  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

const getLowStockProducts = asyncHandler(async (req, res, next) => {
  const { shop, criticalOnly = 'false' } = req.query;
  
  let filter = { 
    isActive: true,
    $expr: { $lte: ['$currentStock', '$minStockLevel'] }
  };
  
  if (shop) filter.shop = shop;
  
  if (criticalOnly === 'true') {
    filter.currentStock = { $lte: 0 };
  }

  const products = await Product.find(filter)
    .sort({ currentStock: 1 })
    .select('name category currentStock minStockLevel buyingPrice minSellingPrice shop shopName');

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
    criticalCount: products.filter(p => p.currentStock <= 0).length
  });
});

const getProductsByShop = asyncHandler(async (req, res, next) => {
  const { category, inStock = 'true' } = req.query;
  
  let filter = { 
    shop: req.params.shop, 
    isActive: true 
  };
  
  if (category) filter.category = category;
  if (inStock === 'true') filter.currentStock = { $gt: 0 };

  const products = await Product.find(filter)
    .sort({ name: 1 })
    .select('-__v');

  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});

const getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id).select('-__v');

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

const bulkUpdateStock = asyncHandler(async (req, res, next) => {
  const { updates } = req.body;
  
  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return next(new ErrorResponse('Updates array with at least one item is required', 400));
  }

  for (const update of updates) {
    if (!update.productId || typeof update.quantity !== 'number') {
      return next(new ErrorResponse('Each update must contain productId and quantity', 400));
    }
    
    if (update.quantity === 0) {
      return next(new ErrorResponse('Quantity cannot be zero', 400));
    }
  }

  const bulkOps = updates.map(update => ({
    updateOne: {
      filter: { 
        _id: update.productId, 
        isActive: true 
      },
      update: { 
        $inc: { currentStock: update.quantity },
        $set: { 
          lastRestocked: new Date(),
          updatedAt: new Date()
        }
      }
    }
  }));

  const result = await Product.bulkWrite(bulkOps);

  res.status(200).json({
    success: true,
    message: `Stock updated for ${result.modifiedCount} products`,
    modifiedCount: result.modifiedCount
  });
});

const deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  product.isActive = false;
  product.deletedAt = new Date();
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Product deleted successfully',
    data: {}
  });
});

module.exports = {
  getAllProducts,
  getActiveProducts,
  getLowStockProducts,
  getProductsByShop,
  getProduct,
  createProduct,
  updateProduct,
  bulkUpdateStock,
  deleteProduct
};