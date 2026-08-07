// routes/transactions.js
const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Product = require('../models/products'); 
const Expense = require('../models/Expense');
const { protect, authorize } = require('../middlewares/auth');
const mongoose = require('mongoose');

// Utility function to build date filter
function buildDateFilter(startDate, endDate) {
  if (!startDate && !endDate) return {};
  
  const filter = {};
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    filter.$gte = start;
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.$lte = end;
  }
  
  return filter;
}

// Enhanced error handling middleware
const handleAsyncError = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Common function to enhance transaction data for frontend
function enhanceTransactionData(transaction) {
  const totalCost = transaction.totalCost || 0;
  const totalProfit = transaction.totalProfit || (transaction.totalAmount - totalCost);
  const profitMargin = transaction.profitMargin || (transaction.totalAmount > 0 ? 
    (totalProfit / transaction.totalAmount) * 100 : 0);

  return {
    ...transaction.toObject ? transaction.toObject() : transaction,
    _id: transaction._id,
    transactionNumber: transaction.transactionNumber || transaction._id?.toString().substring(0, 8) || `TXN-${Date.now()}`,
    cashierName: transaction.cashierName || (transaction.cashierId?.name) || 'Unknown Cashier',
    customerName: transaction.customerName || 'Walk-in Customer',
    totalCost,
    totalProfit,
    profitMargin,
    cost: totalCost,
    profit: totalProfit,
    saleDate: transaction.saleDate || transaction.createdAt,
    itemsCount: transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
    items: (transaction.items || []).map(item => {
      const itemCost = (item.costPrice || 0) * (item.quantity || 0);
      const itemProfit = item.profit || ((item.totalPrice || 0) - itemCost);
      const itemProfitMargin = item.profitMargin || ((item.totalPrice || 0) > 0 ? 
        (itemProfit / (item.totalPrice || 0)) * 100 : 0);

      return {
        ...item,
        productName: item.productName || 'Unknown Product',
        quantity: item.quantity || 0,
        price: item.unitPrice || item.price || 0,
        totalPrice: item.totalPrice || 0,
        cost: itemCost,
        profit: itemProfit,
        profitMargin: itemProfitMargin,
        category: item.category || 'Uncategorized',
        barcode: item.barcode || '',
        unitPrice: item.unitPrice || item.price || 0,
        costPrice: item.costPrice || 0
      };
    })
  };
}

// Utility function to get shop ID from request (supports multiple sources)
function getShopId(req) {
  // Priority order: query param > body > user default shop > headers
  return req.query.shop || 
         req.query.shopId || 
         req.body.shop || 
         req.body.shopId || 
         req.user?.shopId || 
         req.headers['x-shop-id'];
}

// ==================== NEW: ALL DATA ENDPOINT ====================

// GET /api/transactions/reports/all-data - Get all data for reports (fallback endpoint)
router.get('/reports/all-data', protect, handleAsyncError(async (req, res) => {
  const { startDate, endDate, shopId } = req.query;
  
  console.log('📊 Fetching all report data...', req.query);

  const filter = { status: 'completed' };
  
  if (startDate && endDate) {
    filter.$or = [
      { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } },
      { saleDate: { $gte: new Date(startDate), $lte: new Date(endDate) } }
    ];
  }
  
  if (shopId && shopId !== 'all') {
    filter.$or = [
      { shop: shopId },
      { shopId: shopId }
    ];
  }

  try {
    const [transactions, shops, cashiers, products, expenses, credits] = await Promise.all([
      Transaction.find(filter).sort({ saleDate: -1 }).lean(),
      require('../models/Shop').find().lean(),
      require('../models/Cashier').find().lean(),
      Product.find().lean(),
      Expense.find().lean(),
      require('../models/Credit').find().lean()
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        shops,
        cashiers,
        products,
        expenses,
        credits,
        summary: {
          totalTransactions: transactions.length,
          totalShops: shops.length,
          totalCashiers: cashiers.length,
          totalProducts: products.length,
          totalExpenses: expenses.length,
          totalCredits: credits.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching all report data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report data',
      error: error.message
    });
  }
}));

// GET /api/transactions - Main endpoint for all transactions
router.get('/', protect, handleAsyncError(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    shop,
    shopId, 
    cashierName,
    paymentMethod,
    status = 'completed',
    page = 1,
    limit = 50
  } = req.query;
  
  console.log('📊 Fetching transactions with params:', {
    startDate, endDate, shop, shopId, cashierName, paymentMethod, status, page, limit
  });

  // Build filter
  const filter = { status };
  
  // Shop filter - enhanced to handle both shop and shopId
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
    console.log(`🏪 Filtering by shop: ${finalShopId}`);
  }
  
  // Date filter
  const dateFilter = buildDateFilter(startDate, endDate);
  if (Object.keys(dateFilter).length > 0) {
    filter.$or = [
      { createdAt: dateFilter },
      { saleDate: dateFilter }
    ];
  }
  
  // Other filters
  if (cashierName) filter.cashierName = { $regex: cashierName, $options: 'i' };
  
  // Payment method filter - only cash or mpesa/bank
  if (paymentMethod && paymentMethod !== 'all') {
    if (paymentMethod === 'digital') {
      filter.paymentMethod = { $in: ['mpesa', 'bank'] };
    } else {
      filter.paymentMethod = paymentMethod;
    }
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  console.log('🔍 Final filter:', JSON.stringify(filter, null, 2));

  try {
    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Transaction.countDocuments(filter)
    ]);

    console.log(`✅ Found ${transactions.length} transactions out of ${total} total`);

    // Enhanced transactions for frontend
    const enhancedTransactions = transactions.map(transaction => {
      const totalCost = transaction.totalCost || 0;
      const totalProfit = transaction.totalProfit || (transaction.totalAmount - totalCost);
      const profitMargin = transaction.profitMargin || (transaction.totalAmount > 0 ? 
        (totalProfit / transaction.totalAmount) * 100 : 0);

      return {
        ...transaction,
        transactionNumber: transaction.transactionNumber || transaction._id.toString().substring(0, 8),
        cashierName: transaction.cashierName || 'Unknown Cashier',
        customerName: transaction.customerName || 'Walk-in Customer',
        totalCost,
        totalProfit,
        profitMargin,
        cost: totalCost,
        profit: totalProfit,
        saleDate: transaction.saleDate || transaction.createdAt,
        itemsCount: transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
        items: (transaction.items || []).map(item => {
          const itemCost = (item.costPrice || 0) * (item.quantity || 0);
          const itemProfit = item.profit || ((item.totalPrice || 0) - itemCost);
          const itemProfitMargin = item.profitMargin || ((item.totalPrice || 0) > 0 ? 
            (itemProfit / (item.totalPrice || 0)) * 100 : 0);

          return {
            ...item,
            productName: item.productName || 'Unknown Product',
            quantity: item.quantity || 0,
            price: item.unitPrice || item.price || 0,
            totalPrice: item.totalPrice || 0,
            cost: itemCost,
            profit: itemProfit,
            profitMargin: itemProfitMargin,
            category: item.category || 'Uncategorized',
            barcode: item.barcode || '',
            unitPrice: item.unitPrice || item.price || 0,
            costPrice: item.costPrice || 0
          };
        })
      };
    });

    res.json({
      success: true,
      data: enhancedTransactions,
      pagination: {
        current: pageNum,
        pageSize: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      summary: {
        totalTransactions: total,
        filteredCount: transactions.length,
        totalRevenue: enhancedTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
        totalProfit: enhancedTransactions.reduce((sum, t) => sum + (t.totalProfit || 0), 0),
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
        shop: finalShopId || 'All shops'
      }
    });
  } catch (error) {
    console.error('❌ Database query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions from database',
      error: error.message
    });
  }
}));

// GET /api/transactions/sales/all - Alternative sales endpoint
router.get('/sales/all', protect, handleAsyncError(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    shop,
    shopId,
    paymentMethod,
    status = 'completed'
  } = req.query;
  
  console.log('📈 Fetching sales data with params:', { startDate, endDate, shop, shopId, paymentMethod, status });

  const filter = { status };
  
  // Shop filter - enhanced
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
  }
  
  // Date filter
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    filter.$or = [
      { createdAt: { $gte: start, $lte: end } },
      { saleDate: { $gte: start, $lte: end } }
    ];
  }
  
  // Payment method filter
  if (paymentMethod && paymentMethod !== 'all') {
    if (paymentMethod === 'digital') {
      filter.paymentMethod = { $in: ['mpesa', 'bank'] };
    } else {
      filter.paymentMethod = paymentMethod;
    }
  }

  try {
    const sales = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    console.log(`✅ Found ${sales.length} sales records for shop: ${finalShopId || 'all shops'}`);

    const enhancedSales = sales.map(sale => ({
      ...sale,
      transactionNumber: sale.transactionNumber || sale._id.toString().substring(0, 8),
      cashierName: sale.cashierName || 'Unknown Cashier',
      customerName: sale.customerName || 'Walk-in Customer',
      totalCost: sale.totalCost || 0,
      totalProfit: sale.totalProfit || (sale.totalAmount - (sale.totalCost || 0)),
      profitMargin: sale.profitMargin || (sale.totalAmount > 0 ? 
        ((sale.totalAmount - (sale.totalCost || 0)) / sale.totalAmount * 100) : 0),
      itemsCount: sale.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
      items: (sale.items || []).map(item => ({
        ...item,
        productName: item.productName || 'Unknown Product',
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || item.price || 0,
        totalPrice: item.totalPrice || 0,
        profit: item.profit || (item.totalPrice - (item.costPrice * item.quantity))
      }))
    }));

    res.json({
      success: true,
      data: enhancedSales,
      count: enhancedSales.length,
      summary: {
        totalRevenue: enhancedSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0),
        totalProfit: enhancedSales.reduce((sum, sale) => sum + (sale.totalProfit || 0), 0),
        totalTransactions: enhancedSales.length,
        shop: finalShopId || 'All shops'
      }
    });
  } catch (error) {
    console.error('❌ Fetch sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales data',
      error: error.message
    });
  }
}));

// GET /api/transactions/:id - Get single transaction
router.get('/:id', protect, handleAsyncError(async (req, res) => {
  const { id } = req.params;
  
  console.log(`📄 Fetching transaction: ${id}`);

  try {
    const transaction = await Transaction.findById(id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const enhancedTransaction = enhanceTransactionData(transaction);
    
    res.json({
      success: true,
      data: enhancedTransaction
    });
  } catch (error) {
    console.error(`❌ Error fetching transaction ${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
}));

// POST /api/transactions - Create new transaction (ENHANCED SHOP HANDLING & PRODUCT REDUCTION)
router.post('/', protect, authorize('cashier', 'admin', 'manager'), handleAsyncError(async (req, res) => {
  console.log('🆕 Creating new transaction with product reduction:', req.body);

  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const {
        saleType = 'retail',
        status = 'completed',
        paymentMethod,
        totalAmount,
        amountPaid,
        changeGiven = 0,
        subtotal,
        taxAmount = 0,
        discountAmount = 0,
        items,
        customerName = 'Walk-in Customer',
        customerPhone = '',
        shop,
        shopId,
        shopName,
        cashierId,
        cashierName,
        saleDate,
        notes = '',
        transactionNumber
      } = req.body;

      // ENHANCED SHOP VALIDATION - Support both shop and shopId
      const finalShopId = shopId || shop;
      const finalShopName = shopName || `Shop ${finalShopId}`;

      if (!finalShopId) {
        return res.status(400).json({
          success: false,
          message: 'Shop information is required. Provide either shop or shopId'
        });
      }

      // Enhanced validation
      const validationErrors = [];
      if (!paymentMethod) validationErrors.push('Payment method is required');
      if (!['cash', 'mpesa', 'bank', 'card'].includes(paymentMethod.toLowerCase())) {
        validationErrors.push('Payment method must be cash, mpesa, bank, or card');
      }
      if (!totalAmount || totalAmount <= 0) validationErrors.push('Valid total amount is required');
      if (!items || !Array.isArray(items) || items.length === 0) validationErrors.push('Transaction items are required');
      if (!cashierId || !cashierName) validationErrors.push('Cashier information is required');

      if (validationErrors.length > 0) {
        console.log('❌ Validation errors:', validationErrors);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }

      // Process items and calculate totals WITH STOCK REDUCTION
      let calculatedTotalAmount = 0;
      let calculatedTotalCost = 0;
      let calculatedTotalProfit = 0;
      const transactionItems = [];
      const stockUpdates = [];

      // Get all products in single query for stock validation
      const productIds = items.map(item => item.productId).filter(id => id);
      const products = productIds.length > 0 ? 
        await Product.find({ _id: { $in: productIds } }).session(session) : [];
      const productMap = new Map(products.map(p => [p._id.toString(), p]));

      console.log(`📦 Processing ${items.length} items for stock reduction`);

      for (const item of items) {
        const product = productMap.get(item.productId?.toString());
        
        if (!product) {
          throw new Error(`Product not found with ID: ${item.productId}`);
        }

        const itemQuantity = item.quantity || 1;
        const currentStock = product.currentStock || 0;

        // Validate stock for completed transactions
        if (status === 'completed' && currentStock < itemQuantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${currentStock}, Requested: ${itemQuantity}`);
        }

        // Calculate pricing
        const itemPrice = item.unitPrice || item.price || product.minSellingPrice || product.sellingPrice || 0;
        const itemCostPrice = product.buyingPrice || 0;
        const itemTotalPrice = item.totalPrice || (itemPrice * itemQuantity);
        const itemCost = itemCostPrice * itemQuantity;
        const itemProfit = itemTotalPrice - itemCost;
        
        calculatedTotalAmount += itemTotalPrice;
        calculatedTotalCost += itemCost;
        calculatedTotalProfit += itemProfit;

        transactionItems.push({
          productId: item.productId,
          productName: item.productName || product.name,
          category: item.category || product.category || 'Uncategorized',
          barcode: item.barcode || product.barcode || '',
          quantity: itemQuantity,
          unitPrice: itemPrice,
          price: itemPrice, // Include both unitPrice and price for compatibility
          totalPrice: itemTotalPrice,
          costPrice: itemCostPrice,
          profit: itemProfit,
          profitMargin: itemTotalPrice > 0 ? (itemProfit / itemTotalPrice) * 100 : 0
        });

        // REDUCE PRODUCT STOCK - Only for completed transactions
        if (status === 'completed') {
          const newStock = Math.max(0, currentStock - itemQuantity);
          
          // Update product stock in database
          await Product.findByIdAndUpdate(
            item.productId,
            { 
              currentStock: newStock,
              $push: {
                stockHistory: {
                  date: new Date(),
                  type: 'sale',
                  quantity: -itemQuantity,
                  newStock: newStock,
                  reference: `Transaction: ${transactionNumber || 'pending'}`,
                  shop: finalShopId,
                  cashier: cashierName
                }
              },
              lastSold: new Date()
            },
            { session }
          );

          stockUpdates.push({
            productId: item.productId,
            productName: product.name,
            oldStock: currentStock,
            newStock: newStock,
            quantitySold: itemQuantity
          });
          
          console.log(`📦 Stock reduced for ${product.name}: ${currentStock} -> ${newStock}`);
        }
      }

      // Use provided totals or calculated ones
      const finalTotalAmount = totalAmount || calculatedTotalAmount;
      const finalTotalCost = totalCost || calculatedTotalCost;
      const finalTotalProfit = totalProfit || calculatedTotalProfit;
      const profitMargin = finalTotalAmount > 0 ? (finalTotalProfit / finalTotalAmount) * 100 : 0;

      // Generate transaction number if not provided
      const finalTransactionNumber = transactionNumber || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Create transaction with enhanced shop data
      const transaction = new Transaction({
        saleType,
        status,
        paymentMethod: paymentMethod.toLowerCase(),
        totalAmount: finalTotalAmount,
        amountPaid: amountPaid || finalTotalAmount,
        changeGiven,
        subtotal: subtotal || finalTotalAmount,
        taxAmount,
        discountAmount,
        items: transactionItems,
        customerName,
        customerPhone,
        shop: finalShopId, // Store shop ID
        shopName: finalShopName, // Store shop name for display
        cashierId,
        cashierName,
        saleDate: saleDate ? new Date(saleDate) : new Date(),
        notes,
        transactionNumber: finalTransactionNumber,
        receiptNumber: `RCP-${Date.now()}`,
        totalCost: finalTotalCost,
        totalProfit: finalTotalProfit,
        profitMargin,
        createdBy: req.user?.id || 'system'
      });

      await transaction.save({ session });

      console.log('✅ Transaction created successfully for shop:', finalShopName);
      console.log('💰 Transaction totals:', {
        totalAmount: finalTotalAmount,
        totalCost: finalTotalCost,
        totalProfit: finalTotalProfit,
        profitMargin: profitMargin.toFixed(2) + '%',
        itemsCount: transactionItems.length,
        shop: finalShopName
      });

      console.log('📊 Stock updates:', stockUpdates);

      // Populate and return enhanced transaction
      const populatedTransaction = await Transaction.findById(transaction._id)
        .populate('cashierId', 'name email')
        .populate('items.productId', 'name category buyingPrice barcode currentStock')
        .session(session);

      const enhancedTransaction = {
        ...populatedTransaction.toObject(),
        transactionNumber: populatedTransaction.transactionNumber,
        cashierName: populatedTransaction.cashierName || 'Unknown Cashier',
        customerName: populatedTransaction.customerName || 'Walk-in Customer',
        totalCost: populatedTransaction.totalCost || finalTotalCost,
        totalProfit: populatedTransaction.totalProfit || finalTotalProfit,
        profitMargin: populatedTransaction.profitMargin || profitMargin,
        cost: populatedTransaction.totalCost || finalTotalCost,
        profit: populatedTransaction.totalProfit || finalTotalProfit,
        saleDate: populatedTransaction.saleDate || populatedTransaction.createdAt,
        itemsCount: populatedTransaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
        items: (populatedTransaction.items || []).map(item => {
          const itemCost = (item.costPrice || 0) * (item.quantity || 0);
          const itemProfit = item.profit || ((item.totalPrice || 0) - itemCost);
          const itemProfitMargin = item.profitMargin || ((item.totalPrice || 0) > 0 ? 
            (itemProfit / (item.totalPrice || 0)) * 100 : 0);

          return {
            ...item,
            productName: item.productName || 'Unknown Product',
            quantity: item.quantity || 0,
            price: item.unitPrice || item.price || 0,
            totalPrice: item.totalPrice || 0,
            cost: itemCost,
            profit: itemProfit,
            profitMargin: itemProfitMargin,
            category: item.category || 'Uncategorized',
            barcode: item.barcode || '',
            unitPrice: item.unitPrice || item.price || 0,
            costPrice: item.costPrice || 0
          };
        })
      };

      res.status(201).json({
        success: true,
        message: 'Transaction completed successfully',
        data: enhancedTransaction,
        shopInfo: {
          id: finalShopId,
          name: finalShopName
        },
        stockUpdate: {
          productsUpdated: stockUpdates.length,
          updates: stockUpdates,
          message: 'Product stock reduced successfully'
        },
        summary: {
          transactionNumber: finalTransactionNumber,
          totalAmount: finalTotalAmount,
          totalItems: transactionItems.reduce((sum, item) => sum + (item.quantity || 0), 0),
          paymentMethod: paymentMethod,
          timestamp: new Date().toISOString()
        }
      });
    });
  } catch (error) {
    console.error('❌ Transaction creation error:', error);
    
    // Specific error handling for stock issues
    if (error.message.includes('Insufficient stock')) {
      return res.status(400).json({
        success: false,
        message: 'Stock validation failed',
        error: error.message,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    if (error.message.includes('Product not found')) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: error.message,
        code: 'PRODUCT_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to process transaction',
      error: error.message,
      code: 'TRANSACTION_FAILED'
    });
  } finally {
    session.endSession();
  }
}));

// PATCH /api/transactions/:id/status - Update transaction status
router.patch('/:id/status', protect, authorize('admin', 'manager'), handleAsyncError(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  console.log(`🔄 Updating transaction ${id} status to: ${status}`);

  if (!['completed', 'pending', 'cancelled', 'refunded'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Must be: completed, pending, cancelled, or refunded'
    });
  }

  try {
    const transaction = await Transaction.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const enhancedTransaction = enhanceTransactionData(transaction);

    res.json({
      success: true,
      message: `Transaction status updated to ${status}`,
      data: enhancedTransaction
    });
  } catch (error) {
    console.error(`❌ Error updating transaction ${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction',
      error: error.message
    });
  }
}));

// DELETE /api/transactions/:id - Delete transaction (admin only)
router.delete('/:id', protect, authorize('admin'), handleAsyncError(async (req, res) => {
  const { id } = req.params;

  console.log(`🗑️ Deleting transaction: ${id}`);

  try {
    const transaction = await Transaction.findByIdAndDelete(id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      message: 'Transaction deleted successfully',
      data: { id }
    });
  } catch (error) {
    console.error(`❌ Error deleting transaction ${id}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete transaction',
      error: error.message
    });
  }
}));

// GET /api/transactions/stats/summary - Get transaction statistics (ENHANCED SHOP FILTER)
router.get('/stats/summary', protect, handleAsyncError(async (req, res) => {
  const { startDate, endDate, shop, shopId } = req.query;

  console.log('📈 Fetching transaction statistics:', { startDate, endDate, shop, shopId });

  const filter = { status: 'completed' };
  
  // Enhanced shop filtering
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
  }
  
  // Date filter
  const dateFilter = buildDateFilter(startDate, endDate);
  if (Object.keys(dateFilter).length > 0) {
    filter.$or = [
      { createdAt: dateFilter },
      { saleDate: dateFilter }
    ];
  }

  try {
    const stats = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          totalCost: { $sum: '$totalCost' },
          totalProfit: { $sum: '$totalProfit' },
          averageTransaction: { $avg: '$totalAmount' },
          itemsSold: { $sum: { $sum: '$items.quantity' } }
        }
      }
    ]);

    const paymentStats = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          totalProfit: { $sum: '$totalProfit' }
        }
      }
    ]);

    const result = stats[0] || {
      totalTransactions: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      averageTransaction: 0,
      itemsSold: 0
    };

    result.paymentMethods = paymentStats.map(p => ({
      method: p._id,
      count: p.count,
      totalAmount: p.totalAmount,
      totalProfit: p.totalProfit,
      percentage: result.totalRevenue > 0 ? (p.totalAmount / result.totalRevenue) * 100 : 0
    }));

    result.profitMargin = result.totalRevenue > 0 ? (result.totalProfit / result.totalRevenue) * 100 : 0;
    result.shop = finalShopId || 'All shops';

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error fetching transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction statistics',
      error: error.message
    });
  }
}));

// GET /api/transactions/comprehensive/data - Consolidated data endpoint (ENHANCED SHOP FILTER)
router.get('/comprehensive/data', protect, handleAsyncError(async (req, res) => {
  const { startDate, endDate, shop, shopId, paymentMethod } = req.query;
  
  console.log('📊 Fetching comprehensive transaction data:', { startDate, endDate, shop, shopId, paymentMethod });

  const transactionFilter = { status: 'completed' };
  const expenseFilter = {};
  
  // Enhanced shop filtering
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    transactionFilter.shop = finalShopId;
    expenseFilter.shop = finalShopId;
  }
  
  // Date filter
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    transactionFilter.$or = [
      { createdAt: { $gte: start, $lte: end } },
      { saleDate: { $gte: start, $lte: end } }
    ];
    
    expenseFilter.date = { $gte: start, $lte: end };
  }
  
  // Payment method filter
  if (paymentMethod && paymentMethod !== 'all') {
    if (paymentMethod === 'digital') {
      transactionFilter.paymentMethod = { $in: ['mpesa', 'bank'] };
    } else {
      transactionFilter.paymentMethod = paymentMethod;
    }
  }

  try {
    const [transactions, expenses, products] = await Promise.all([
      Transaction.find(transactionFilter)
        .populate('items.productId', 'name category buyingPrice barcode')
        .sort({ saleDate: -1 })
        .lean(),
      Expense.find(expenseFilter).lean(),
      Product.find({}).select('name buyingPrice category barcode currentStock').lean()
    ]);

    console.log(`✅ Comprehensive data fetched for shop ${finalShopId || 'all shops'}:`, {
      transactions: transactions.length,
      expenses: expenses.length,
      products: products.length
    });

    // Enhanced transactions for frontend
    const enhancedTransactions = transactions.map(transaction => {
      const totalCost = transaction.totalCost || 0;
      const totalProfit = transaction.totalProfit || (transaction.totalAmount - totalCost);
      const profitMargin = transaction.profitMargin || (transaction.totalAmount > 0 ? 
        (totalProfit / transaction.totalAmount) * 100 : 0);

      return {
        ...transaction,
        transactionNumber: transaction.transactionNumber || transaction._id.toString().substring(0, 8),
        cashierName: transaction.cashierName || 'Unknown Cashier',
        customerName: transaction.customerName || 'Walk-in Customer',
        totalCost,
        totalProfit,
        profitMargin,
        cost: totalCost,
        profit: totalProfit,
        saleDate: transaction.saleDate || transaction.createdAt,
        itemsCount: transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
        items: (transaction.items || []).map(item => {
          const itemCost = (item.costPrice || 0) * (item.quantity || 0);
          const itemProfit = item.profit || ((item.totalPrice || 0) - itemCost);
          const itemProfitMargin = item.profitMargin || ((item.totalPrice || 0) > 0 ? 
            (itemProfit / (item.totalPrice || 0)) * 100 : 0);

          return {
            ...item,
            productName: item.productName || 'Unknown Product',
            quantity: item.quantity || 0,
            price: item.unitPrice || item.price || 0,
            totalPrice: item.totalPrice || 0,
            cost: itemCost,
            profit: itemProfit,
            profitMargin: itemProfitMargin,
            category: item.category || 'Uncategorized',
            barcode: item.barcode || '',
            unitPrice: item.unitPrice || item.price || 0,
            costPrice: item.costPrice || 0
          };
        })
      };
    });

    res.json({
      success: true,
      data: {
        transactions: enhancedTransactions,
        expenses,
        products
      },
      summary: {
        totalTransactions: transactions.length,
        totalExpenses: expenses.length,
        totalProducts: products.length,
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All time',
        shop: finalShopId || 'All shops'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching comprehensive data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comprehensive data',
      error: error.message
    });
  }
}));

// GET /api/transactions/stats/comprehensive - Ensure this matches frontend expectation
router.get('/stats/comprehensive', protect, handleAsyncError(async (req, res) => {
  const { startDate, endDate, shop, shopId } = req.query;

  console.log('📈 Fetching comprehensive stats:', { startDate, endDate, shop, shopId });

  const filter = { status: 'completed' };

  // Enhanced shop filtering
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
  }

  // Date filtering
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    filter.$or = [
      { createdAt: { $gte: start, $lte: end } },
      { saleDate: { $gte: start, $lte: end } }
    ];
  }

  try {
    const transactions = await Transaction.find(filter)
      .populate('items.productId')
      .lean();

    console.log(`📊 Processing ${transactions.length} transactions for stats in shop: ${finalShopId || 'all shops'}`);

    // Calculate comprehensive stats
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalCost = transactions.reduce((sum, t) => sum + (t.totalCost || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const totalTransactions = transactions.length;
    const totalItemsSold = transactions.reduce((sum, t) => 
      sum + (t.items ? t.items.reduce((itemSum, item) => itemSum + (item.quantity || 1), 0) : 0), 0);
    
    const averageTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Payment method breakdown
    const paymentMethodStats = transactions.reduce((acc, t) => {
      const method = t.paymentMethod || 'cash';
      if (!acc[method]) {
        acc[method] = { totalAmount: 0, count: 0, totalProfit: 0 };
      }
      acc[method].totalAmount += t.totalAmount || 0;
      acc[method].totalProfit += t.totalProfit || 0;
      acc[method].count += 1;
      return acc;
    }, {});

    const stats = {
      overview: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalTransactions,
        totalItemsSold,
        averageTransactionValue,
        profitMargin,
        shop: finalShopId || 'All shops'
      },
      paymentMethodStats: Object.entries(paymentMethodStats).map(([method, data]) => ({
        method,
        totalAmount: data.totalAmount,
        count: data.count,
        totalProfit: data.totalProfit,
        percentage: totalRevenue > 0 ? (data.totalAmount / totalRevenue) * 100 : 0,
        profitMargin: data.totalAmount > 0 ? (data.totalProfit / data.totalAmount) * 100 : 0
      })),
      totalTransactions: transactions.length
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error in comprehensive stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch comprehensive stats',
      error: error.message
    });
  }
}));

// NEW: Enhanced cashier daily stats endpoint
router.get('/stats/cashier-daily', protect, authorize('cashier', 'admin', 'manager'), handleAsyncError(async (req, res) => {
  const { 
    date = new Date().toISOString().split('T')[0],
    cashierId,
    cashierName,
    shop,
    shopId
  } = req.query;

  console.log('👤 Fetching cashier daily stats:', { date, cashierId, cashierName, shop, shopId });

  const filter = { 
    status: 'completed',
    saleDate: {
      $gte: new Date(date + 'T00:00:00.000Z'),
      $lte: new Date(date + 'T23:59:59.999Z')
    }
  };

  // Enhanced shop filtering
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
  }

  // Cashier filter - support both ID and name
  if (cashierId) {
    filter.cashierId = cashierId;
  } else if (cashierName) {
    filter.cashierName = { $regex: cashierName, $options: 'i' };
  } else {
    // Default to current user if no cashier specified
    filter.cashierId = req.user.id;
  }

  try {
    const transactions = await Transaction.find(filter)
      .populate('items.productId', 'name category')
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📊 Found ${transactions.length} transactions for cashier stats`);

    // Calculate comprehensive cashier stats
    const totalSales = transactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const totalTransactions = transactions.length;
    const totalItemsSold = transactions.reduce((sum, t) => 
      sum + (t.items ? t.items.reduce((itemSum, item) => itemSum + (item.quantity || 1), 0) : 0), 0);
    
    const totalCost = transactions.reduce((sum, t) => sum + (t.totalCost || 0), 0);
    const totalProfit = totalSales - totalCost;
    const averageTransaction = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

    // Payment method breakdown
    const paymentBreakdown = transactions.reduce((acc, t) => {
      const method = t.paymentMethod || 'cash';
      if (!acc[method]) {
        acc[method] = { count: 0, amount: 0 };
      }
      acc[method].count += 1;
      acc[method].amount += t.totalAmount || 0;
      return acc;
    }, {});

    // Top selling products
    const productSales = {};
    transactions.forEach(transaction => {
      transaction.items?.forEach(item => {
        const productId = item.productId?._id || item.productId;
        const productName = item.productName || 'Unknown Product';
        const key = productId ? productId.toString() : productName;
        
        if (!productSales[key]) {
          productSales[key] = {
            productId,
            productName,
            quantity: 0,
            revenue: 0,
            profit: 0
          };
        }
        
        productSales[key].quantity += item.quantity || 0;
        productSales[key].revenue += item.totalPrice || 0;
        productSales[key].profit += (item.totalPrice || 0) - ((item.costPrice || 0) * (item.quantity || 0));
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const stats = {
      date,
      cashier: {
        id: cashierId || req.user.id,
        name: cashierName || req.user.name || 'Current User'
      },
      shop: finalShopId || 'All shops',
      overview: {
        totalSales,
        totalTransactions,
        totalItemsSold,
        totalCost,
        totalProfit,
        averageTransaction,
        profitMargin: Number(profitMargin.toFixed(2)),
        startTime: transactions[transactions.length - 1]?.createdAt,
        endTime: transactions[0]?.createdAt
      },
      paymentBreakdown: Object.entries(paymentBreakdown).map(([method, data]) => ({
        method,
        transactions: data.count,
        amount: data.amount,
        percentage: totalSales > 0 ? (data.amount / totalSales) * 100 : 0
      })),
      topProducts,
      transactions: transactions.map(t => ({
        id: t._id,
        transactionNumber: t.transactionNumber,
        time: t.createdAt,
        totalAmount: t.totalAmount,
        paymentMethod: t.paymentMethod,
        itemsCount: t.items?.length || 0
      }))
    };

    res.json({
      success: true,
      data: stats,
      summary: {
        message: `Daily stats for ${stats.cashier.name} on ${date}`,
        performance: totalProfit > 0 ? 'Good' : totalSales > 0 ? 'Moderate' : 'No sales',
        rating: totalTransactions >= 20 ? 'Excellent' : totalTransactions >= 10 ? 'Good' : totalTransactions >= 5 ? 'Average' : 'Low'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching cashier daily stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashier daily statistics',
      error: error.message
    });
  }
}));

// NEW: Enhanced daily sales stats endpoint
router.get('/stats/daily-sales', protect, authorize('cashier', 'admin', 'manager'), handleAsyncError(async (req, res) => {
  const { 
    startDate = new Date().toISOString().split('T')[0],
    endDate = new Date().toISOString().split('T')[0],
    shop,
    shopId,
    groupBy = 'day' // day, week, month
  } = req.query;

  console.log('📅 Fetching daily sales stats:', { startDate, endDate, shop, shopId, groupBy });

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const filter = { 
    status: 'completed',
    $or: [
      { createdAt: { $gte: start, $lte: end } },
      { saleDate: { $gte: start, $lte: end } }
    ]
  };

  // Enhanced shop filtering
  const finalShopId = shopId || shop || getShopId(req);
  if (finalShopId && finalShopId !== 'all') {
    filter.shop = finalShopId;
  }

  try {
    const transactions = await Transaction.find(filter)
      .populate('items.productId', 'name category')
      .populate('cashierId', 'name email')
      .sort({ saleDate: 1 })
      .lean();

    console.log(`📈 Processing ${transactions.length} transactions for daily sales stats`);

    // Group transactions by date
    const salesByDate = {};
    const cashierPerformance = {};
    const productPerformance = {};

    transactions.forEach(transaction => {
      const saleDate = new Date(transaction.saleDate || transaction.createdAt);
      const dateKey = saleDate.toISOString().split('T')[0];
      
      // Initialize date entry
      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = {
          date: dateKey,
          totalSales: 0,
          totalTransactions: 0,
          totalItems: 0,
          totalCost: 0,
          totalProfit: 0,
          averageTransaction: 0,
          cashiers: new Set(),
          paymentMethods: {}
        };
      }

      const dateData = salesByDate[dateKey];
      
      // Update date totals
      dateData.totalSales += transaction.totalAmount || 0;
      dateData.totalTransactions += 1;
      dateData.totalItems += transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      dateData.totalCost += transaction.totalCost || 0;
      dateData.totalProfit += transaction.totalProfit || 0;
      
      // Track cashiers
      if (transaction.cashierName) {
        dateData.cashiers.add(transaction.cashierName);
      }
      
      // Track payment methods
      const paymentMethod = transaction.paymentMethod || 'cash';
      dateData.paymentMethods[paymentMethod] = (dateData.paymentMethods[paymentMethod] || 0) + 1;

      // Cashier performance
      const cashierKey = transaction.cashierName || 'Unknown';
      if (!cashierPerformance[cashierKey]) {
        cashierPerformance[cashierKey] = {
          name: cashierKey,
          totalSales: 0,
          totalTransactions: 0,
          totalItems: 0,
          totalProfit: 0
        };
      }
      cashierPerformance[cashierKey].totalSales += transaction.totalAmount || 0;
      cashierPerformance[cashierKey].totalTransactions += 1;
      cashierPerformance[cashierKey].totalItems += transaction.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      cashierPerformance[cashierKey].totalProfit += transaction.totalProfit || 0;

      // Product performance
      transaction.items?.forEach(item => {
        const productId = item.productId?._id || item.productId;
        const productName = item.productName || 'Unknown Product';
        const key = productId ? productId.toString() : productName;
        
        if (!productPerformance[key]) {
          productPerformance[key] = {
            productId,
            productName,
            category: item.category || 'Uncategorized',
            totalSold: 0,
            totalRevenue: 0,
            totalProfit: 0
          };
        }
        
        productPerformance[key].totalSold += item.quantity || 0;
        productPerformance[key].totalRevenue += item.totalPrice || 0;
        productPerformance[key].totalProfit += (item.totalPrice || 0) - ((item.costPrice || 0) * (item.quantity || 0));
      });
    });

    // Calculate averages and format date data
    const dailySales = Object.values(salesByDate).map(dateData => ({
      ...dateData,
      averageTransaction: dateData.totalTransactions > 0 ? dateData.totalSales / dateData.totalTransactions : 0,
      profitMargin: dateData.totalSales > 0 ? (dateData.totalProfit / dateData.totalSales) * 100 : 0,
      uniqueCashiers: dateData.cashiers.size,
      paymentMethods: Object.entries(dateData.paymentMethods).map(([method, count]) => ({
        method,
        count,
        percentage: (count / dateData.totalTransactions) * 100
      }))
    }));

    // Format cashier performance
    const topCashiers = Object.values(cashierPerformance)
      .map(cashier => ({
        ...cashier,
        averageSale: cashier.totalTransactions > 0 ? cashier.totalSales / cashier.totalTransactions : 0,
        profitMargin: cashier.totalSales > 0 ? (cashier.totalProfit / cashier.totalSales) * 100 : 0
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    // Format product performance
    const topProducts = Object.values(productPerformance)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);

    // Overall summary
    const totalSummary = dailySales.reduce((summary, day) => ({
      totalSales: summary.totalSales + day.totalSales,
      totalTransactions: summary.totalTransactions + day.totalTransactions,
      totalItems: summary.totalItems + day.totalItems,
      totalCost: summary.totalCost + day.totalCost,
      totalProfit: summary.totalProfit + day.totalProfit
    }), { totalSales: 0, totalTransactions: 0, totalItems: 0, totalCost: 0, totalProfit: 0 });

    totalSummary.averageTransaction = totalSummary.totalTransactions > 0 ? totalSummary.totalSales / totalSummary.totalTransactions : 0;
    totalSummary.profitMargin = totalSummary.totalSales > 0 ? (totalSummary.totalProfit / totalSummary.totalSales) * 100 : 0;
    totalSummary.averageItemsPerTransaction = totalSummary.totalTransactions > 0 ? totalSummary.totalItems / totalSummary.totalTransactions : 0;

    const stats = {
      dateRange: {
        start: startDate,
        end: endDate,
        days: dailySales.length
      },
      shop: finalShopId || 'All shops',
      summary: totalSummary,
      dailySales,
      topCashiers: topCashiers.slice(0, 10),
      topProducts,
      trends: {
        bestDay: dailySales.length > 0 ? 
          dailySales.reduce((best, day) => day.totalSales > best.totalSales ? day : best) : null,
        worstDay: dailySales.length > 0 ? 
          dailySales.reduce((worst, day) => day.totalSales < worst.totalSales ? day : worst) : null,
        growthRate: dailySales.length > 1 ? 
          ((dailySales[dailySales.length - 1].totalSales - dailySales[0].totalSales) / dailySales[0].totalSales) * 100 : 0
      }
    };

    res.json({
      success: true,
      data: stats,
      analytics: {
        message: `Sales analysis for ${startDate} to ${endDate}`,
        performance: totalSummary.profitMargin > 20 ? 'Excellent' : totalSummary.profitMargin > 10 ? 'Good' : 'Needs Improvement',
        recommendation: totalSummary.averageTransaction < 50 ? 'Consider upselling strategies' : 'Maintain current performance'
      }
    });
  } catch (error) {
    console.error('❌ Error fetching daily sales stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch daily sales statistics',
      error: error.message
    });
  }
}));

// Health check endpoint with shop info
router.get('/health/check', protect, (req, res) => {
  const shopId = getShopId(req);
  
  res.json({
    success: true,
    message: 'Transactions API is working',
    timestamp: new Date().toISOString(),
    shop: shopId || 'Not specified',
    endpoints: [
      'GET /api/transactions - Get all transactions',
      'GET /api/transactions/sales/all - Get sales data',
      'GET /api/transactions/:id - Get single transaction',
      'POST /api/transactions - Create transaction',
      'PATCH /api/transactions/:id/status - Update status',
      'DELETE /api/transactions/:id - Delete transaction',
      'GET /api/transactions/stats/summary - Get statistics',
      'GET /api/transactions/comprehensive/data - Get comprehensive data',
      'GET /api/transactions/stats/comprehensive - Get comprehensive stats',
      'GET /api/transactions/stats/cashier-daily - Get cashier daily stats',
      'GET /api/transactions/stats/daily-sales - Get daily sales stats',
      'GET /api/transactions/reports/all-data - Get all report data (NEW)'
    ]
  });
});

module.exports = router;