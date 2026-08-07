// routes/transactions.js
const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Product = require('../models/products'); 
const Expense = require('../models/Expense'); // Added missing import
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

// GET /api/transactions - Main endpoint for all transactions
router.get('/', protect, handleAsyncError(async (req, res) => {
  const { 
    startDate, 
    endDate, 
    shop, 
    cashierName,
    paymentMethod,
    status = 'completed',
    page = 1,
    limit = 50
  } = req.query;
  
  console.log('📊 Fetching transactions with params:', {
    startDate, endDate, shop, cashierName, paymentMethod, status, page, limit
  });

  // Build filter
  const filter = { status };
  
  // Date filter
  const dateFilter = buildDateFilter(startDate, endDate);
  if (Object.keys(dateFilter).length > 0) {
    filter.$or = [
      { createdAt: dateFilter },
      { saleDate: dateFilter }
    ];
  }
  
  // Other filters
  if (shop && shop !== 'all') filter.shop = shop;
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
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All time'
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
    paymentMethod,
    status = 'completed'
  } = req.query;
  
  console.log('📈 Fetching sales data with params:', { startDate, endDate, shop, paymentMethod, status });

  const filter = { status };
  
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
  
  // Shop filter
  if (shop && shop !== 'all') filter.shop = shop;
  
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

    console.log(`✅ Found ${sales.length} sales records`);

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
        totalTransactions: enhancedSales.length
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

// POST /api/transactions - Create new transaction
router.post('/', protect, authorize('cashier', 'admin', 'manager'), handleAsyncError(async (req, res) => {
  console.log('🆕 Creating new transaction:', req.body);

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
        cashierId,
        cashierName,
        saleDate,
        notes = '',
        transactionNumber
      } = req.body;

      // Enhanced validation
      const validationErrors = [];
      if (!paymentMethod) validationErrors.push('Payment method is required');
      if (!['cash', 'mpesa', 'bank'].includes(paymentMethod)) {
        validationErrors.push('Payment method must be cash, mpesa, or bank');
      }
      if (!totalAmount || totalAmount <= 0) validationErrors.push('Valid total amount is required');
      if (!items || !Array.isArray(items) || items.length === 0) validationErrors.push('Transaction items are required');
      if (!shop) validationErrors.push('Shop information is required');
      if (!cashierId || !cashierName) validationErrors.push('Cashier information is required');

      if (validationErrors.length > 0) {
        console.log('❌ Validation errors:', validationErrors);
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }

      // Process items and calculate totals
      let totalCost = 0;
      let totalProfit = 0;
      const transactionItems = [];

      // Get all products in single query
      const productIds = items.map(item => item.productId).filter(id => id);
      const products = productIds.length > 0 ? 
        await Product.find({ _id: { $in: productIds } }).session(session) : [];
      const productMap = new Map(products.map(p => [p._id.toString(), p]));

      for (const item of items) {
        const product = productMap.get(item.productId?.toString());
        
        let actualUnitPrice = item.unitPrice || 0;
        let itemCost = 0;

        if (product) {
          actualUnitPrice = item.unitPrice || product.minSellingPrice || product.sellingPrice || 0;
          itemCost = (product.buyingPrice || 0) * (item.quantity || 1);

          // Validate stock for completed transactions
          if (status === 'completed' && product.currentStock < (item.quantity || 1)) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${product.currentStock}, Requested: ${item.quantity}`);
          }

          // Update stock for completed transactions
          if (status === 'completed') {
            product.currentStock -= (item.quantity || 1);
            await product.save({ session });
          }
        }

        const itemTotalPrice = item.totalPrice || (actualUnitPrice * (item.quantity || 1));
        const itemProfit = itemTotalPrice - itemCost;
        
        totalCost += itemCost;
        totalProfit += itemProfit;

        transactionItems.push({
          productId: item.productId,
          productName: item.productName || product?.name || 'Unknown Product',
          category: item.category || product?.category || 'Uncategorized',
          barcode: item.barcode || product?.barcode || '',
          quantity: item.quantity || 1,
          unitPrice: actualUnitPrice,
          totalPrice: itemTotalPrice,
          costPrice: product?.buyingPrice || 0,
          profit: itemProfit,
          profitMargin: itemTotalPrice > 0 ? (itemProfit / itemTotalPrice) * 100 : 0
        });
      }

      const profitMargin = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;

      // Create transaction
      const transaction = new Transaction({
        saleType,
        status,
        paymentMethod: paymentMethod.toLowerCase(),
        totalAmount,
        amountPaid: amountPaid || totalAmount,
        changeGiven,
        subtotal: subtotal || totalAmount,
        taxAmount,
        discountAmount,
        items: transactionItems,
        customerName,
        customerPhone,
        shop,
        cashierId,
        cashierName,
        saleDate: saleDate ? new Date(saleDate) : new Date(),
        notes,
        transactionNumber: transactionNumber || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        totalCost,
        totalProfit,
        profitMargin,
        createdBy: req.user.id
      });

      await transaction.save({ session });

      console.log('✅ Transaction created successfully:', transaction._id);

      // Return enhanced transaction
      const enhancedTransaction = enhanceTransactionData(transaction);

      res.status(201).json({
        success: true,
        message: 'Transaction completed successfully',
        data: enhancedTransaction
      });
    });
  } catch (error) {
    console.error('❌ Transaction creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process transaction',
      error: error.message
    });
  } finally {
    session.endSession();
  }
}));

// PATCH /api/transactions/:id - Update transaction status
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

// GET /api/transactions/stats/summary - Get transaction statistics
router.get('/stats/summary', protect, handleAsyncError(async (req, res) => {
  const { startDate, endDate, shop } = req.query;

  console.log('📈 Fetching transaction statistics:', { startDate, endDate, shop });

  const filter = { status: 'completed' };
  
  // Date filter
  const dateFilter = buildDateFilter(startDate, endDate);
  if (Object.keys(dateFilter).length > 0) {
    filter.$or = [
      { createdAt: dateFilter },
      { saleDate: dateFilter }
    ];
  }
  
  // Shop filter
  if (shop && shop !== 'all') filter.shop = shop;

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

// GET /api/transactions/comprehensive/data - Consolidated data endpoint
router.get('/comprehensive/data', protect, handleAsyncError(async (req, res) => {
  const { startDate, endDate, shop, paymentMethod } = req.query;
  
  console.log('📊 Fetching comprehensive transaction data:', { startDate, endDate, shop, paymentMethod });

  const transactionFilter = { status: 'completed' };
  const expenseFilter = {};
  
  // Date filter - FIXED: Use proper date range without $or
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
  
  // Shop filter
  if (shop && shop !== 'all') {
    transactionFilter.shop = shop;
    expenseFilter.shop = shop;
  }
  
  // Payment method filter - FIXED: Consistent digital payment handling
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

    console.log(`✅ Comprehensive data fetched:`, {
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
        dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'All time'
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
  const { startDate, endDate, shop } = req.query;

  console.log('📈 Fetching comprehensive stats:', { startDate, endDate, shop });

  const filter = { status: 'completed' };

  // FIXED: Proper date filtering
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

  if (shop && shop !== 'all') filter.shop = shop;

  try {
    const transactions = await Transaction.find(filter)
      .populate('items.productId')
      .lean();

    console.log(`📊 Processing ${transactions.length} transactions for stats`);

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
        profitMargin
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

// Health check endpoint
router.get('/health/check', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Transactions API is working',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/transactions - Get all transactions',
      'GET /api/transactions/sales/all - Get sales data',
      'GET /api/transactions/:id - Get single transaction',
      'POST /api/transactions - Create transaction',
      'PATCH /api/transactions/:id/status - Update status',
      'DELETE /api/transactions/:id - Delete transaction',
      'GET /api/transactions/stats/summary - Get statistics',
      'GET /api/transactions/comprehensive/data - Get comprehensive data',
      'GET /api/transactions/stats/comprehensive - Get comprehensive stats'
    ]
  });
});

module.exports = router;