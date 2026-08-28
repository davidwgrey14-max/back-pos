const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

// ==================== CORS CONFIGURATION FOR VERCEL ====================

/**
 * Allowed origins for CORS
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'https://pos-frontend-psi-teal.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);




// ==================== CORS MIDDLEWARE - VERCEL COMPATIBLE ====================

/**
 * Custom CORS middleware that works with Vercel serverless functions
 */
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Log for debugging
  console.log(`📨 ${req.method} ${req.url}`);
  console.log(`🔗 Origin: ${origin || 'No origin'}`);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    // Set CORS headers for preflight
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (process.env.NODE_ENV === 'development') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-API-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // End preflight request successfully
    return res.status(204).end();
  }
  
  // Set CORS headers for actual requests
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  next();
};

// Apply CORS middleware FIRST
app.use(corsMiddleware);

// ==================== JSON PARSER ====================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Add these route handlers before the 404 handler

// ==================== PRODUCT ROUTES ====================
app.get('/api/products', async (req, res) => {
  try {
    if (!models.Product) models = createModels();
    const products = await models.Product.find().populate('shop', 'name location').sort({ createdAt: -1 });
    res.json({ success: true, data: products, count: products.length });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const product = new models.Product(req.body);
    await product.save();
    res.status(201).json({ success: true, data: product, message: 'Product created successfully' });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const product = await models.Product.findByIdAndUpdate(
      req.params.id, 
      { ...req.body, updatedAt: new Date() }, 
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await models.Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
});

// ==================== EXPENSE ROUTES ====================
app.get('/api/expenses', async (req, res) => {
  try {
    if (!models.Expense) models = createModels();
    const { startDate, endDate, shopId } = req.query;
    let filter = {};
    if (startDate && endDate) {
      filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (shopId && shopId !== 'all') {
      filter.$or = [{ shop: shopId }, { shopId: shopId }];
    }
    const expenses = await models.Expense.find(filter).populate('shop', 'name location').sort({ date: -1 });
    res.json({ success: true, data: expenses, count: expenses.length });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch expenses', error: error.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const expense = new models.Expense(req.body);
    await expense.save();
    res.status(201).json({ success: true, data: expense, message: 'Expense created successfully' });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({ success: false, message: 'Failed to create expense', error: error.message });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await models.Expense.findByIdAndUpdate(
      req.params.id, 
      { ...req.body, updatedAt: new Date() }, 
      { new: true, runValidators: true }
    );
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, data: expense, message: 'Expense updated successfully' });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ success: false, message: 'Failed to update expense', error: error.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await models.Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ success: false, message: 'Failed to delete expense', error: error.message });
  }
});

// ==================== CREDIT ROUTES ====================
app.get('/api/credits', async (req, res) => {
  try {
    if (!models.Credit) models = createModels();
    const { startDate, endDate, shopId, status } = req.query;
    let filter = {};
    if (startDate && endDate) {
      filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (shopId && shopId !== 'all') {
      filter.$or = [{ shop: shopId }, { shopId: shopId }];
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    const credits = await models.Credit.find(filter)
      .populate('transactionId', 'totalAmount saleDate transactionNumber')
      .populate('shop', 'name location')
      .populate('cashierId', 'name email')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: credits, count: credits.length });
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch credits', error: error.message });
  }
});

app.get('/api/credits/:id', async (req, res) => {
  try {
    const credit = await models.Credit.findById(req.params.id)
      .populate('transactionId', 'totalAmount saleDate transactionNumber items')
      .populate('shop', 'name location')
      .populate('cashierId', 'name email');
    if (!credit) return res.status(404).json({ success: false, message: 'Credit not found' });
    res.json({ success: true, data: credit });
  } catch (error) {
    console.error('Error fetching credit:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch credit', error: error.message });
  }
});

app.post('/api/credits', async (req, res) => {
  try {
    const credit = new models.Credit(req.body);
    await credit.save();
    res.status(201).json({ success: true, data: credit, message: 'Credit created successfully' });
  } catch (error) {
    console.error('Error creating credit:', error);
    res.status(500).json({ success: false, message: 'Failed to create credit', error: error.message });
  }
});

app.put('/api/credits/:id', async (req, res) => {
  try {
    const credit = await models.Credit.findByIdAndUpdate(
      req.params.id, 
      { ...req.body, updatedAt: new Date() }, 
      { new: true, runValidators: true }
    );
    if (!credit) return res.status(404).json({ success: false, message: 'Credit not found' });
    res.json({ success: true, data: credit, message: 'Credit updated successfully' });
  } catch (error) {
    console.error('Error updating credit:', error);
    res.status(500).json({ success: false, message: 'Failed to update credit', error: error.message });
  }
});

app.delete('/api/credits/:id', async (req, res) => {
  try {
    const credit = await models.Credit.findByIdAndDelete(req.params.id);
    if (!credit) return res.status(404).json({ success: false, message: 'Credit not found' });
    res.json({ success: true, message: 'Credit deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit:', error);
    res.status(500).json({ success: false, message: 'Failed to delete credit', error: error.message });
  }
});

app.get('/api/credits/:id/payments', async (req, res) => {
  try {
    const credit = await models.Credit.findById(req.params.id).select('paymentHistory');
    if (!credit) return res.status(404).json({ success: false, message: 'Credit not found' });
    res.json({ success: true, data: credit.paymentHistory || [] });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch payment history', error: error.message });
  }
});

app.post('/api/credits/:id/payments', async (req, res) => {
  try {
    const { amount, paymentMethod, recordedBy, cashierName, notes } = req.body;
    const credit = await models.Credit.findById(req.params.id);
    if (!credit) return res.status(404).json({ success: false, message: 'Credit not found' });

    const payment = {
      amount: Number(amount),
      paymentDate: new Date(),
      paymentMethod: paymentMethod || 'cash',
      recordedBy: recordedBy || 'System',
      cashierName: cashierName || recordedBy || 'System',
      notes: notes || ''
    };

    if (!credit.paymentHistory) credit.paymentHistory = [];
    credit.paymentHistory.push(payment);
    
    credit.amountPaid = (credit.amountPaid || 0) + Number(amount);
    credit.balanceDue = credit.totalAmount - credit.amountPaid;
    credit.status = credit.balanceDue <= 0 ? 'paid' : (credit.amountPaid > 0 ? 'partially_paid' : 'pending');
    credit.updatedAt = new Date();

    await credit.save();

    // Also update the related transaction
    if (credit.transactionId) {
      await models.Transaction.findByIdAndUpdate(credit.transactionId, {
        amountPaid: credit.amountPaid,
        outstandingRevenue: credit.balanceDue,
        creditStatus: credit.status,
        recognizedRevenue: credit.amountPaid,
        updatedAt: new Date()
      });
    }

    res.json({ success: true, data: credit, message: 'Payment recorded successfully' });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ success: false, message: 'Failed to record payment', error: error.message });
  }
});

app.get('/api/credits/stats', async (req, res) => {
  try {
    const { shopId } = req.query;
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [{ shop: shopId }, { shopId: shopId }];
    }
    
    const credits = await models.Credit.find(filter);
    const totalCredits = credits.length;
    const totalAmount = credits.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
    const totalPaid = credits.reduce((sum, c) => sum + (c.amountPaid || 0), 0);
    const totalOutstanding = credits.reduce((sum, c) => sum + (c.balanceDue || 0), 0);
    const overdueCount = credits.filter(c => c.status === 'overdue').length;

    res.json({ 
      success: true, 
      data: {
        totalCredits,
        totalAmount,
        totalPaid,
        totalOutstanding,
        overdueCount,
        collectionRate: totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0
      }
    });
  } catch (error) {
    console.error('Error fetching credit stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch credit stats', error: error.message });
  }
});

// ==================== TRANSACTION ROUTES ====================
app.get('/api/transactions', async (req, res) => {
  try {
    if (!models.Transaction) models = createModels();
    const { startDate, endDate, shopId, cashierId, paymentMethod, status, limit = 100 } = req.query;
    
    let filter = {};
    if (startDate && endDate) {
      filter.saleDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (shopId && shopId !== 'all') {
      filter.$or = [{ shop: shopId }, { shopId: shopId }];
    }
    if (cashierId) filter.cashierId = cashierId;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (status) filter.status = status;

    const transactions = await models.Transaction.find(filter)
      .populate('shop', 'name location')
      .populate('cashierId', 'name email')
      .populate('items.productId', 'name buyingPrice')
      .sort({ saleDate: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: transactions, count: transactions.length });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
  }
});

app.get('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await models.Transaction.findById(req.params.id)
      .populate('shop', 'name location')
      .populate('cashierId', 'name email')
      .populate('items.productId', 'name buyingPrice');
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction', error: error.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const transaction = new models.Transaction(req.body);
    await transaction.save();
    res.status(201).json({ success: true, data: transaction, message: 'Transaction created successfully' });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to create transaction', error: error.message });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await models.Transaction.findByIdAndUpdate(
      req.params.id, 
      { ...req.body, updatedAt: new Date() }, 
      { new: true, runValidators: true }
    );
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, data: transaction, message: 'Transaction updated successfully' });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to update transaction', error: error.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await models.Transaction.findByIdAndDelete(req.params.id);
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ success: false, message: 'Failed to delete transaction', error: error.message });
  }
});

// ==================== TRANSACTION METRICS ROUTE ====================
app.get('/api/transactions/metrics', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;
    
    let filter = {};
    if (startDate && endDate) {
      filter.saleDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (shopId && shopId !== 'all') {
      filter.$or = [{ shop: shopId }, { shopId: shopId }];
    }

    const transactions = await models.Transaction.find(filter);
    const products = await models.Product.find({});
    
    let totalRevenue = 0;
    let totalCash = 0;
    let totalMpesaBank = 0;
    let totalItemsSold = 0;
    let totalCost = 0;
    let creditSales = 0;
    let nonCreditSales = 0;
    let totalCreditGiven = 0;
    let recognizedCreditRevenue = 0;
    let outstandingCredit = 0;

    transactions.forEach(t => {
      const amount = t.totalAmount || 0;
      totalRevenue += amount;
      totalItemsSold += t.itemsCount || 0;
      
      // Calculate cost
      if (t.cost) {
        totalCost += t.cost;
      } else if (t.items && t.items.length > 0) {
        t.items.forEach(item => {
          totalCost += (item.buyingPrice || 0) * (item.quantity || 1);
        });
      }

      // Payment split
      if (t.paymentSplit) {
        totalCash += t.paymentSplit.cash || 0;
        totalMpesaBank += t.paymentSplit.bank_mpesa || 0;
      } else if (t.paymentMethod === 'cash') {
        totalCash += amount;
      } else if (['mpesa', 'bank', 'card'].includes(t.paymentMethod)) {
        totalMpesaBank += amount;
      }

      // Credit handling
      if (t.isCreditTransaction) {
        creditSales += amount;
        totalCreditGiven += amount;
        recognizedCreditRevenue += t.recognizedRevenue || 0;
        outstandingCredit += t.outstandingRevenue || 0;
      } else {
        nonCreditSales += amount;
      }
    });

    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const creditCollectionRate = totalCreditGiven > 0 ? (recognizedCreditRevenue / totalCreditGiven) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalSales: transactions.length,
        totalTransactions: transactions.length,
        totalCash,
        totalMpesaBank,
        totalItemsSold,
        costOfGoodsSold: totalCost,
        grossProfit,
        netProfit: grossProfit,
        profitMargin,
        creditSales,
        nonCreditSales,
        totalCreditGiven,
        recognizedCreditRevenue,
        outstandingCredit,
        creditCollectionRate,
        averageTransactionValue: transactions.length > 0 ? totalRevenue / transactions.length : 0
      }
    });
  } catch (error) {
    console.error('Error fetching transaction metrics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch metrics', error: error.message });
  }
});

// ==================== TRANSACTION COMBINED ROUTE ====================
app.get('/api/transactions/combined', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;
    
    // Set timeout for this heavy operation
    req.setTimeout(30000);
    res.setTimeout(30000);

    const [transactions, shops, cashiers, products, expenses, credits] = await Promise.all([
      models.Transaction.find(startDate && endDate ? { saleDate: { $gte: new Date(startDate), $lte: new Date(endDate) } } : {})
        .populate('shop', 'name location')
        .populate('cashierId', 'name email')
        .sort({ saleDate: -1 })
        .lean(),
      models.Shop.find({}).lean(),
      models.Cashier.find({}).lean(),
      models.Product.find({}).lean(),
      models.Expense.find(startDate && endDate ? { date: { $gte: new Date(startDate), $lte: new Date(endDate) } } : {}).lean(),
      models.Credit.find(startDate && endDate ? { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } : {}).lean()
    ]);

    // Process transactions with CalculationUtils
    const processedData = await CalculationUtils.processComprehensiveData(
      { transactions, shops, cashiers, products, expenses, credits },
      shopId || 'all'
    );

    res.json({
      success: true,
      ...processedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching combined data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch combined data', 
      error: error.message 
    });
  }
});

// ==================== LOGOUT ROUTE ====================
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    if (req.session) {
      req.session.isActive = false;
      req.session.logoutReason = 'manual';
      await req.session.save();
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Failed to logout', error: error.message });
  }
});

// ==================== SESSION REFRESH ROUTE ====================
app.post('/api/auth/refresh-session', authMiddleware, async (req, res) => {
  try {
    const newToken = generateAuthToken(req.user._id, req.user.email, req.user.role);
    
    if (req.session) {
      req.session.token = newToken;
      req.session.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      req.session.lastActivity = new Date();
      await req.session.save();
    }
    
    res.json({ 
      success: true, 
      token: newToken,
      sessionTimeout: 5,
      message: 'Session refreshed successfully' 
    });
  } catch (error) {
    console.error('Session refresh error:', error);
    res.status(500).json({ success: false, message: 'Failed to refresh session', error: error.message });
  }
});
// ==================== ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ==================== SERVER START ====================

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║           🚀 SERVER STARTED               ║
╠═══════════════════════════════════════════╣
║ Port:          ${PORT.padEnd(20)}║
║ Environment:   ${(process.env.NODE_ENV || 'development').padEnd(20)}║
║ Allowed Origins: ${ALLOWED_ORIGINS.length > 0 ? 'Configured' : 'None'.padEnd(20)}║
╚═══════════════════════════════════════════╝
    `);
    console.log(`📋 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close(() => process.exit(0));
  });
}

module.exports = app;