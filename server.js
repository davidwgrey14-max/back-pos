// server.js - Serverless Optimized for Vercel
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const responseTime = require('response-time');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// ==================== CACHED CONNECTION FOR SERVERLESS ====================
let cachedDb = null;
let models = {};
let emailTransporter = null;

// ==================== PERFORMANCE OPTIMIZATIONS ====================
app.use(responseTime());
mongoose.set('debug', false);

app.use('/api/transactions/combined', (req, res, next) => {
  req.setTimeout(30000);
  res.setTimeout(30000);
  next();
});

// ==================== ENHANCED MODELS ====================

const createModels = () => {
  console.log('🔧 Creating enhanced models...');
 
  // Product Schema
  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'Uncategorized' },
    buyingPrice: { type: Number, default: 0 },
    minSellingPrice: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    minStockLevel: { type: Number, default: 5 },
    barcode: String,
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    description: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Shop Schema
  const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: String,
    manager: String,
    contact: String,
    email: String,
    type: { type: String, default: 'retail' },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Cashier Schema
  const cashierSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    password: String,
    role: { type: String, default: 'cashier' },
    status: { type: String, default: 'active' },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName: String,
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Expense Schema
  const expenseSchema = new mongoose.Schema({
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'General' },
    date: { type: Date, default: Date.now },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    recordedBy: String,
    paymentMethod: { type: String, default: 'cash' },
    referenceNumber: String,
    notes: String,
    status: { type: String, default: 'completed' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Transaction Schema
  const transactionSchema = new mongoose.Schema({
    transactionNumber: { type: String, required: true, unique: true },
    totalAmount: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    items: [{
      productName: String,
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantity: { type: Number, default: 1 },
      price: Number,
      totalPrice: Number,
      buyingPrice: Number,
      cost: Number,
      profit: Number,
      profitMargin: Number
    }],
    itemsCount: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'cash' },
    customerName: { type: String, default: 'Walk-in Customer' },
    customerPhone: String,
    cashierName: String,
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier' },
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    saleDate: { type: Date, default: Date.now },
    status: { type: String, default: 'completed' },
    isCreditTransaction: { type: Boolean, default: false },
    creditStatus: { type: String, enum: ['pending', 'partially_paid', 'paid', 'overdue'] },
    recognizedRevenue: { type: Number, default: 0 },
    outstandingRevenue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    dueDate: Date,
    creditShopName: String,
    creditShopId: String,
    shopClassification: String,
    paymentSplit: {
      cash: { type: Number, default: 0 },
      bank_mpesa: { type: Number, default: 0 },
      credit: { type: Number, default: 0 }
    },
    immediateRevenue: { type: Number, default: 0 },
    upfrontPaymentAmount: { type: Number, default: 0 },
    upfrontPaymentMethod: String,
    upfrontPaymentSplit: {
      cash: { type: Number, default: 0 },
      bank_mpesa: { type: Number, default: 0 }
    },
    isCreditPayment: { type: Boolean, default: false },
    originalCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Credit Schema
  const creditSchema = new mongoose.Schema({
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    customerName: { type: String, required: true },
    customerPhone: String,
    customerEmail: String,
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, default: 'pending', enum: ['pending', 'partially_paid', 'paid', 'overdue'] },
    paymentHistory: [{
      amount: Number,
      paymentDate: { type: Date, default: Date.now },
      paymentMethod: String,
      recordedBy: String,
      cashierName: String,
      notes: String
    }],
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopId: String,
    shopName: String,
    creditShopName: String,
    creditShopId: String,
    shopClassification: String,
    cashierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashier' },
    cashierName: String,
    recordedBy: String,
    notes: String,
    upfrontPaymentAmount: { type: Number, default: 0 },
    upfrontPaymentMethod: String,
    upfrontPaymentSplit: {
      cash: { type: Number, default: 0 },
      bank_mpesa: { type: Number, default: 0 }
    },
    immediateRevenue: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // User Schema
  const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // Secure Code Schema
  const secureCodeSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    used: { type: Boolean, default: false }
  });

  secureCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const models = {
    Product: mongoose.models.Product || mongoose.model('Product', productSchema),
    Shop: mongoose.models.Shop || mongoose.model('Shop', shopSchema),
    Cashier: mongoose.models.Cashier || mongoose.model('Cashier', cashierSchema),
    Expense: mongoose.models.Expense || mongoose.model('Expense', expenseSchema),
    Transaction: mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema),
    Credit: mongoose.models.Credit || mongoose.model('Credit', creditSchema),
    User: mongoose.models.User || mongoose.model('User', userSchema),
    SecureCode: mongoose.models.SecureCode || mongoose.model('SecureCode', secureCodeSchema)
  };

  console.log('✅ All enhanced models created successfully');
  return models;
};

// ==================== SERVERLESS DATABASE CONNECTION ====================

const connectDB = async () => {
  try {
    // Use cached connection if available
    if (cachedDb && mongoose.connection.readyState === 1) {
      console.log('✅ Using cached database connection');
      return cachedDb;
    }

    const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/Eliud_db';
    
    console.log('🔗 Connecting to MongoDB (serverless mode)...');

    const connectionOptions = {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      retryWrites: true,
      retryReads: true,
      bufferCommands: true, // Important for serverless
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 30000
    };

    // Set up connection events
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    const conn = await mongoose.connect(connectionString, connectionOptions);
    cachedDb = conn;
    
    // Initialize models
    models = createModels();
    
    console.log('🎉 Database initialization completed successfully');
    return conn;
    
  } catch (error) {
    console.error(`❌ Database connection error: ${error.message}`);
    throw error;
  }
};

// ==================== EMAIL CONFIGURATION ====================

const createEmailTransporter = () => {
  try {
    const emailUser = process.env.EMAIL_USER || 'davidwgrey14@gmail.com';
    const emailPass = process.env.EMAIL_PASSWORD || 'your-gmail-password';

    if (!emailUser || !emailPass) {
      throw new Error('Email credentials not configured');
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      debug: false,
      logger: false
    });

    return transporter;
  } catch (error) {
    console.error('❌ Error creating email transporter:', error.message);
    return null;
  }
};

const initializeEmail = async () => {
  try {
    emailTransporter = createEmailTransporter();
    if (emailTransporter) {
      await emailTransporter.verify();
      console.log('✅ Email transporter is ready and verified');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    return false;
  }
};

// ==================== MIDDLEWARE - Database Connection ====================

// Middleware to ensure database connection for each request
const ensureDbConnection = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('🔄 Connecting to database for request:', req.path);
      await connectDB();
      
      // Initialize email after connection
      if (!emailTransporter) {
        await initializeEmail();
      }
    }
    next();
  } catch (error) {
    console.error('❌ Database connection middleware error:', error);
    res.status(503).json({
      success: false,
      message: 'Database temporarily unavailable',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Apply to all API routes
app.use('/api', ensureDbConnection);

// ==================== MIDDLEWARE SETUP ====================

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
});

app.use(compression());

app.use(cors({
  origin: ['http://localhost:3000', 'https://pos-frontend-psi-teal.vercel.app'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.options('*', cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many authentication attempts' }
});

const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many email requests' }
});

app.use('/api/auth/request-code', emailLimiter);
app.use('/api/auth/verify-code', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// ==================== CALCULATION UTILITIES ====================

const CalculationUtils = {
  safeNumber: (value, defaultValue = 0) => {
    if (value === null || value === undefined || value === '') return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  },

  formatCurrency: (amount) => {
    const value = CalculationUtils.safeNumber(amount);
    return `KES ${value.toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  },

  calculateProfit: (revenue, cost) => {
    return CalculationUtils.safeNumber(revenue) - CalculationUtils.safeNumber(cost);
  },

  calculateProfitMargin: (revenue, profit) => {
    const safeRevenue = CalculationUtils.safeNumber(revenue);
    const safeProfit = CalculationUtils.safeNumber(profit);
    return safeRevenue > 0 ? (safeProfit / safeRevenue) * 100 : 0;
  },

  calculateCOGS: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      const cost = CalculationUtils.safeNumber(transaction.cost);
      return sum + cost;
    }, 0);
  },

  calculateRevenue: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      if (transaction.isCreditPayment) {
        return sum + CalculationUtils.safeNumber(transaction.totalAmount);
      }
      return sum + CalculationUtils.safeNumber(transaction.recognizedRevenue || transaction.immediateRevenue || transaction.totalAmount);
    }, 0);
  },

  calculateCostFromItems: async (transaction, products = []) => {
    try {
      if (transaction.cost && CalculationUtils.safeNumber(transaction.cost) > 0) {
        return CalculationUtils.safeNumber(transaction.cost);
      }
      if (transaction.totalCost && CalculationUtils.safeNumber(transaction.totalCost) > 0) {
        return CalculationUtils.safeNumber(transaction.totalCost);
      }
      if (transaction.items && Array.isArray(transaction.items)) {
        let totalCost = 0;
        for (const item of transaction.items) {
          const quantity = CalculationUtils.safeNumber(item.quantity, 1);
          let itemCost = 0;
          if (item.cost && CalculationUtils.safeNumber(item.cost) > 0) {
            itemCost = CalculationUtils.safeNumber(item.cost);
          } else if (item.buyingPrice && CalculationUtils.safeNumber(item.buyingPrice) > 0) {
            itemCost = CalculationUtils.safeNumber(item.buyingPrice);
          } else if (item.productId && products.length > 0) {
            const product = products.find(p =>
              p._id && item.productId &&
              (p._id.toString() === item.productId.toString() ||
               (p._id && item.productId._id && p._id.toString() === item.productId._id.toString()))
            );
            if (product) {
              itemCost = CalculationUtils.safeNumber(product.buyingPrice);
            }
          } else if (item.price && CalculationUtils.safeNumber(item.price) > 0) {
            itemCost = CalculationUtils.safeNumber(item.price) * 0.3;
          }
          totalCost += itemCost * quantity;
        }
        return totalCost;
      }
      return 0;
    } catch (error) {
      console.error('❌ Error calculating cost from items:', error);
      return 0;
    }
  },

  processSingleTransaction: async (transaction, products = []) => {
    try {
      if (!transaction) return CalculationUtils.createFallbackTransaction();

      if (transaction.isCreditPayment) {
        return {
          ...transaction,
          totalAmount: CalculationUtils.safeNumber(transaction.totalAmount),
          cost: 0,
          profit: CalculationUtils.safeNumber(transaction.totalAmount),
          profitMargin: 100,
          isCreditTransaction: false,
          isCreditPayment: true,
          recognizedRevenue: CalculationUtils.safeNumber(transaction.totalAmount),
          outstandingRevenue: 0,
          amountPaid: CalculationUtils.safeNumber(transaction.totalAmount),
          immediateRevenue: CalculationUtils.safeNumber(transaction.totalAmount),
          creditStatus: null,
          itemsCount: 0,
          displayDate: transaction.displayDate ||
                      new Date(transaction.saleDate || transaction.createdAt).toLocaleString('en-KE'),
          _processedAt: new Date().toISOString(),
          _isValid: true
        };
      }

      const isCredit = transaction.paymentMethod === 'credit' ||
                      transaction.isCredit === true ||
                      transaction.transactionType === 'credit' ||
                      transaction.isCreditTransaction === true ||
                      transaction.status === 'credit';
     
      const totalAmount = CalculationUtils.safeNumber(transaction.totalAmount) ||
                         CalculationUtils.safeNumber(transaction.amount) || 0;
     
      const cost = await CalculationUtils.calculateCostFromItems(transaction, products);
     
      const amountPaid = CalculationUtils.safeNumber(transaction.amountPaid) ||
                        CalculationUtils.safeNumber(transaction.paidAmount) || 0;
     
      const recognizedRevenue = isCredit ? amountPaid : totalAmount;
      const outstandingRevenue = isCredit ?
        (CalculationUtils.safeNumber(transaction.outstandingRevenue) ||
         CalculationUtils.safeNumber(transaction.balanceDue) ||
         Math.max(0, totalAmount - amountPaid)) : 0;
      const immediateRevenue = isCredit ? amountPaid : totalAmount;
      const profit = CalculationUtils.calculateProfit(recognizedRevenue, cost);
      const profitMargin = CalculationUtils.calculateProfitMargin(recognizedRevenue, profit);

      const saleDate = transaction.saleDate || transaction.createdAt || transaction.date;
      const displayDate = transaction.displayDate ||
                         (saleDate ? new Date(saleDate).toLocaleString('en-KE') : 'Date Unknown');

      let creditStatus = 'completed';
      if (isCredit) {
        if (outstandingRevenue <= 0) {
          creditStatus = 'paid';
        } else if (amountPaid > 0) {
          creditStatus = 'partially_paid';
        } else {
          creditStatus = 'pending';
        }
        if (transaction.dueDate && new Date(transaction.dueDate) < new Date() && outstandingRevenue > 0) {
          creditStatus = 'overdue';
        }
      }

      return {
        ...transaction,
        totalAmount,
        cost,
        profit,
        profitMargin,
        isCreditTransaction: isCredit,
        recognizedRevenue,
        outstandingRevenue,
        amountPaid,
        immediateRevenue,
        creditStatus,
        itemsCount: transaction.items ? transaction.items.reduce((sum, item) =>
          sum + CalculationUtils.safeNumber(item.quantity, 1), 0) : 0,
        displayDate,
        _processedAt: new Date().toISOString(),
        _isValid: true
      };
    } catch (error) {
      console.error('❌ Error processing single transaction:', error);
      return CalculationUtils.createFallbackTransaction();
    }
  },

  createFallbackTransaction: () => {
    return {
      totalAmount: 0,
      cost: 0,
      profit: 0,
      profitMargin: 0,
      isCreditTransaction: false,
      recognizedRevenue: 0,
      outstandingRevenue: 0,
      amountPaid: 0,
      immediateRevenue: 0,
      creditStatus: 'completed',
      itemsCount: 0,
      displayDate: new Date().toLocaleString('en-KE'),
      _isValid: false
    };
  },

  calculateTransactionMetrics: (transaction) => {
    return CalculationUtils.processSingleTransaction(transaction);
  },

  processComprehensiveData: async (rawData, selectedShop) => {
    const transactions = rawData.transactions || [];
    const expenses = rawData.expenses || [];
    const credits = rawData.credits || [];
    const products = rawData.products || [];
    const shops = rawData.shops || [];
    const cashiers = rawData.cashiers || [];

    const salesWithProfit = await Promise.all(
      transactions.map(transaction =>
        CalculationUtils.processSingleTransaction(transaction, products)
      )
    );

    const filteredTransactions = selectedShop && selectedShop !== 'all' ?
      salesWithProfit.filter(t =>
        t.shop === selectedShop || t.shopId === selectedShop
      ) : salesWithProfit;

    const totalTransactions = filteredTransactions.length;
    const creditTransactions = filteredTransactions.filter(t => t.isCreditTransaction);
    const nonCreditTransactions = filteredTransactions.filter(t => !t.isCreditTransaction);
    const creditPayments = filteredTransactions.filter(t => t.isCreditPayment);

    const totalRevenue = CalculationUtils.calculateRevenue(filteredTransactions);
    const creditSales = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const nonCreditSales = nonCreditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const creditPaymentRevenue = creditPayments.reduce((sum, t) => sum + t.totalAmount, 0);
    const costOfGoodsSold = CalculationUtils.calculateCOGS(filteredTransactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    const totalExpenses = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    let totalCash = 0;
    let totalMpesaBank = 0;
    let totalCredit = 0;

    filteredTransactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        totalCash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        totalMpesaBank += CalculationUtils.safeNumber(transaction.paymentSplit.bank_mpesa);
        totalCredit += CalculationUtils.safeNumber(transaction.paymentSplit.credit);
      } else {
        if (transaction.paymentMethod === 'cash') {
          totalCash += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transaction.paymentMethod)) {
          totalMpesaBank += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (transaction.paymentMethod === 'credit') {
          totalCredit += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (transaction.paymentMethod === 'cash_bank_mpesa') {
          const half = CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue) / 2;
          totalCash += half;
          totalMpesaBank += half;
        }
      }
    });

    const outstandingCredit = credits
      .filter(credit => credit.status !== 'paid' &&
        (!selectedShop || selectedShop === 'all' ||
         credit.shop === selectedShop || credit.shopId === selectedShop))
      .reduce((sum, credit) => sum + CalculationUtils.safeNumber(credit.balanceDue), 0);

    const totalCreditGiven = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const recognizedCreditRevenue = creditTransactions.reduce((sum, t) => sum + t.recognizedRevenue, 0);
    const immediateRevenueTotal = filteredTransactions.reduce((sum, t) => sum + (t.immediateRevenue || 0), 0);

    const financialStats = {
      totalSales: totalTransactions,
      creditSales: creditSales,
      nonCreditSales: nonCreditSales,
      creditPaymentRevenue: creditPaymentRevenue,
      totalRevenue: totalRevenue,
      totalExpenses: totalExpenses,
      grossProfit: grossProfit,
      netProfit: netProfit,
      costOfGoodsSold: costOfGoodsSold,
      totalMpesaBank: totalMpesaBank,
      totalCash: totalCash,
      outstandingCredit: outstandingCredit,
      totalCreditGiven: totalCreditGiven,
      immediateRevenue: immediateRevenueTotal,
      creditSalesCount: creditTransactions.length,
      creditPaymentsCount: creditPayments.length,
      nonCreditSalesCount: nonCreditTransactions.length,
      completeTransactionsCount: nonCreditTransactions.length,
      recognizedCreditRevenue: recognizedCreditRevenue,
      profitMargin: CalculationUtils.calculateProfitMargin(totalRevenue, netProfit),
      creditCollectionRate: totalCreditGiven > 0 ?
        (recognizedCreditRevenue / totalCreditGiven) * 100 : 0,
      totalItemsSold: filteredTransactions.reduce((sum, t) => sum + t.itemsCount, 0),
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      cogsBreakdown: {
        total: costOfGoodsSold,
        fromCreditSales: CalculationUtils.calculateCOGS(creditTransactions),
        fromCompleteSales: CalculationUtils.calculateCOGS(nonCreditTransactions),
        fromCreditPayments: CalculationUtils.calculateCOGS(creditPayments)
      },
      _cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
      _revenueCalculation: 'immediate_revenue_includes_upfront_payments',
      _paymentTracking: 'payment_split_enhanced_with_upfront',
      _upfrontPaymentSupport: true,
      _calculatedAt: new Date().toISOString()
    };

    const topProducts = CalculationUtils.calculateTopProducts(filteredTransactions, 10);
    const shopPerformance = CalculationUtils.calculateShopPerformance(filteredTransactions, shops);

    return {
      salesWithProfit: filteredTransactions,
      financialStats,
      salesPerformanceSummary: financialStats,
      expenses,
      credits,
      products,
      shops,
      cashiers,
      performance: {
        topProducts,
        shopPerformance,
        topCashiers: shopPerformance.slice(0, 10)
      },
      summary: financialStats,
      enhancedStats: {
        salesWithProfit: filteredTransactions,
        financialStats
      },
      comprehensiveReport: {
        summary: financialStats,
        transactions: filteredTransactions,
        expenses,
        products,
        credits,
        shops,
        cashiers,
        performance: {
          topProducts,
          shopPerformance
        }
      },
      timestamp: new Date().toISOString()
    };
  },

  calculateTopProducts: (transactions, limit = 10) => {
    if (!Array.isArray(transactions)) return [];
    const productMap = {};
    transactions.forEach(transaction => {
      transaction.items?.forEach(item => {
        const productId = item.productId?.toString() || item.productName;
        const productName = item.productName || 'Unknown Product';
        if (!productMap[productId]) {
          productMap[productId] = {
            id: productId,
            name: productName,
            totalSold: 0,
            totalRevenue: 0,
            totalProfit: 0,
            totalCost: 0,
            transactions: 0
          };
        }
        const quantity = CalculationUtils.safeNumber(item.quantity, 1);
        const revenue = CalculationUtils.safeNumber(item.totalPrice);
        const cost = CalculationUtils.safeNumber(item.buyingPrice) * quantity;
        const profit = revenue - cost;
        productMap[productId].totalSold += quantity;
        productMap[productId].totalRevenue += revenue;
        productMap[productId].totalProfit += profit;
        productMap[productId].totalCost += cost;
        productMap[productId].transactions += 1;
      });
    });
    return Object.values(productMap)
      .map(product => ({
        ...product,
        profitMargin: CalculationUtils.calculateProfitMargin(product.totalRevenue, product.totalProfit),
        averagePrice: product.totalSold > 0 ? product.totalRevenue / product.totalSold : 0
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);
  },

  calculateShopPerformance: (transactions, shops) => {
    if (!Array.isArray(transactions)) return [];
    const shopMap = {};
    transactions.forEach(transaction => {
      const shopId = transaction.shop || transaction.shopId;
      if (!shopId) return;
      if (!shopMap[shopId]) {
        const shop = shops.find(s => s._id.toString() === shopId.toString()) ||
                    { name: 'Unknown Shop', location: 'Unknown' };
        shopMap[shopId] = {
          id: shopId,
          name: shop.name,
          location: shop.location,
          revenue: 0,
          transactions: 0,
          profit: 0,
          cost: 0,
          itemsSold: 0,
          immediateRevenue: 0
        };
      }
      shopMap[shopId].revenue += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
      shopMap[shopId].transactions += 1;
      shopMap[shopId].profit += CalculationUtils.safeNumber(transaction.profit);
      shopMap[shopId].cost += CalculationUtils.safeNumber(transaction.cost);
      shopMap[shopId].itemsSold += CalculationUtils.safeNumber(transaction.itemsCount);
      shopMap[shopId].immediateRevenue += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
    });
    return Object.values(shopMap)
      .map(shop => ({
        ...shop,
        profitMargin: CalculationUtils.calculateProfitMargin(shop.revenue, shop.profit),
        averageTransaction: shop.transactions > 0 ? shop.revenue / shop.transactions : 0
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }
};

// ==================== OPTIMIZED TRANSACTION DATA FETCHING ====================

const getAllTransactionData = async (filters = {}) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      status
    } = filters;

    let filter = {
      status: { $in: ['completed', 'credit'] }
    };

    if (startDate && endDate) {
      filter.saleDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    const transactionProjection = {
      totalAmount: 1, cost: 1, profit: 1, profitMargin: 1,
      items: 1, itemsCount: 1, paymentMethod: 1, 
      customerName: 1, cashierName: 1, cashierId: 1,
      shop: 1, shopId: 1, shopName: 1, saleDate: 1,
      status: 1, isCreditTransaction: 1, creditStatus: 1,
      recognizedRevenue: 1, outstandingRevenue: 1, amountPaid: 1,
      paymentSplit: 1, immediateRevenue: 1, upfrontPaymentAmount: 1,
      isCreditPayment: 1, createdAt: 1
    };

    const [transactions, shops, cashiers, products, expenses, credits] = await Promise.all([
      models.Transaction.find(filter, transactionProjection)
        .populate('shop', 'name location type')
        .populate('cashierId', 'name email')
        .populate('items.productId', 'name buyingPrice')
        .sort({ saleDate: -1 })
        .lean()
        .maxTimeMS(30000),
      models.Shop.find({}, 'name location type').lean(),
      models.Cashier.find({}, 'name email shopId shopName').lean(),
      models.Product.find({}, 'name buyingPrice currentStock shop shopName').lean(),
      models.Expense.find(startDate && endDate ? {
        date: { $gte: new Date(startDate), $lte: new Date(endDate) }
      } : {}, 'description amount category date shop shopId shopName recordedBy')
        .populate('shop', 'name')
        .lean(),
      models.Credit.find(startDate && endDate ? {
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
      } : {}, 'transactionId customerName customerPhone totalAmount amountPaid balanceDue dueDate status shop shopId shopName cashierId cashierName upfrontPaymentAmount immediateRevenue')
        .populate('transactionId', 'totalAmount saleDate')
        .populate('shop', 'name location')
        .populate('cashierId', 'name email')
        .lean()
    ]);

    const processedData = await CalculationUtils.processComprehensiveData({
      transactions,
      shops,
      cashiers,
      products,
      expenses,
      credits
    }, shopId);

    return processedData;
  } catch (error) {
    console.error('❌ Error in getAllTransactionData:', error);
    throw error;
  }
};

// ==================== AUTHENTICATION FUNCTIONS ====================

const generateSecureCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendSecureCodeEmail = async (email, code) => {
  if (!emailTransporter) {
    throw new Error('Email service not configured');
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'davidwgrey14@gmail.com',
    to: email,
    subject: 'Your Secure Login Code - The Place Shop Management',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
          Pamela Bar Management - Secure Login
        </h2>
        <p>Hello,</p>
        <p>Your secure login code for The place Shop Management System is:</p>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 25px 0; border: 2px dashed #4CAF50; border-radius: 8px;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">
          This code will expire in 15 minutes for security reasons.
        </p>
        <p style="color: #999; font-size: 12px;">
          If you didn't request this code, please ignore this email or contact support if you're concerned.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #888; font-size: 11px;">
          This is an automated message from The place shop Management System.
        </p>
      </div>
    `
  };

  await emailTransporter.sendMail(mailOptions);
};

const generateAuthToken = (userId, email, role) => {
  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-key-change-in-production';
    const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
    const payload = {
      userId: userId.toString(),
      email: email,
      role: role || 'cashier',
      timestamp: Date.now()
    };
    return jwt.sign(payload, secret, { expiresIn });
  } catch (error) {
    console.error('❌ Error generating auth token:', error);
    throw new Error('Failed to generate authentication token');
  }
};

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    app: process.env.APP_NAME || 'The Place Shop Management',
    version: process.env.APP_VERSION || '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    email: emailTransporter ? 'configured' : 'disabled',
    authentication: 'email-based-secure-code',
    cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced',
    serverless: true
  });
});

// ==================== AUTHENTICATION ROUTES ====================

app.post('/api/auth/request-code',
  [
    body('email').isEmail().normalizeEmail()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email address',
          details: errors.array()
        });
      }

      const { email } = req.body;
      console.log('📧 Secure code request for:', email);

      const user = await models.User.findOne({ email }) ||
                   await models.Cashier.findOne({ email });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this email address'
        });
      }

      const secureCode = generateSecureCode();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      const hashedCode = await bcrypt.hash(secureCode, 10);
     
      await models.SecureCode.findOneAndUpdate(
        { email },
        {
          code: hashedCode,
          expiresAt,
          attempts: 0,
          used: false
        },
        { upsert: true, new: true }
      );

      if (!emailTransporter) {
        return res.json({
          success: true,
          message: 'Secure code generated (email service disabled)',
          developmentMode: true,
          secureCode: secureCode,
          expiresIn: 15
        });
      }

      try {
        await sendSecureCodeEmail(email, secureCode);
        res.json({
          success: true,
          message: 'Secure code sent to your email',
          expiresIn: 15
        });
      } catch (emailError) {
        console.error('❌ Failed to send email:', emailError);
        await models.SecureCode.deleteOne({ email });
        res.status(500).json({
          success: false,
          message: 'Failed to send secure code. Please try again later.'
        });
      }
    } catch (error) {
      console.error('❌ Error requesting secure code:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process request. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

app.post('/api/auth/verify-code',
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid input data',
          details: errors.array()
        });
      }

      const { email, code } = req.body;
      console.log('🔐 Secure code verification for:', email);

      if (!models.SecureCode) {
        return res.status(500).json({
          success: false,
          message: 'System configuration error. Please contact administrator.'
        });
      }

      let secureCode;
      try {
        secureCode = await models.SecureCode.findOne({ email });
      } catch (dbError) {
        console.error('❌ Database error finding secure code:', dbError);
        return res.status(500).json({
          success: false,
          message: 'Database error. Please try again.'
        });
      }

      if (!secureCode) {
        return res.status(404).json({
          success: false,
          message: 'No secure code found for this email. Please request a new code.'
        });
      }

      const now = new Date();
      if (now > secureCode.expiresAt) {
        try {
          await models.SecureCode.deleteOne({ email });
        } catch (deleteError) {
          console.error('❌ Error deleting expired code:', deleteError);
        }
        return res.status(400).json({
          success: false,
          message: 'Secure code has expired. Please request a new code.'
        });
      }

      if (secureCode.used) {
        return res.status(400).json({
          success: false,
          message: 'Secure code has already been used. Please request a new code.'
        });
      }

      if (secureCode.attempts >= 5) {
        try {
          await models.SecureCode.deleteOne({ email });
        } catch (deleteError) {
          console.error('❌ Error deleting code after max attempts:', deleteError);
        }
        return res.status(400).json({
          success: false,
          message: 'Too many failed attempts. Please request a new code.'
        });
      }

      let isValidCode = false;
      try {
        isValidCode = await bcrypt.compare(code, secureCode.code);
      } catch (bcryptError) {
        console.error('❌ Bcrypt comparison error:', bcryptError);
        return res.status(500).json({
          success: false,
          message: 'Error verifying code. Please try again.'
        });
      }

      if (!isValidCode) {
        secureCode.attempts += 1;
        try {
          await secureCode.save();
        } catch (saveError) {
          console.error('❌ Error saving attempt count:', saveError);
        }
        const attemptsRemaining = 5 - secureCode.attempts;
        return res.status(400).json({
          success: false,
          message: 'Invalid secure code',
          attemptsRemaining: attemptsRemaining
        });
      }

      secureCode.used = true;
      try {
        await secureCode.save();
      } catch (saveError) {
        console.error('❌ Error marking code as used:', saveError);
      }

      let user = null;
      if (models.User) {
        try {
          user = await models.User.findOne({ email });
        } catch (userError) {
          console.error('❌ Error finding user in User model:', userError);
        }
      }

      if (!user && models.Cashier) {
        try {
          user = await models.Cashier.findOne({ email });
        } catch (cashierError) {
          console.error('❌ Error finding user in Cashier model:', cashierError);
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User account not found. Please contact administrator.'
        });
      }

      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact administrator.'
        });
      }

      try {
        user.lastLogin = new Date();
        await user.save();
      } catch (updateError) {
        console.error('❌ Error updating last login:', updateError);
      }

      let token;
      try {
        token = generateAuthToken(user._id, user.email, user.role || 'cashier');
      } catch (tokenError) {
        console.error('❌ Error generating token:', tokenError);
        return res.status(500).json({
          success: false,
          message: 'Error generating authentication token. Please try again.'
        });
      }

      const userData = {
        _id: user._id,
        name: user.name || 'User',
        email: user.email,
        role: user.role || 'cashier',
        isActive: user.isActive !== false,
        lastLogin: user.lastLogin || new Date()
      };

      if (user.role === 'cashier') {
        if (user.shopId) userData.shopId = user.shopId;
        if (user.shopName) userData.shopName = user.shopName;
      }

      if (user.role === 'admin') {
        userData.isAdmin = true;
      }

      return res.status(200).json({
        success: true,
        user: userData,
        token: token,
        message: 'Login successful'
      });
    } catch (error) {
      console.error('❌ Unexpected error in verify-code:', error);
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

app.post('/api/auth/cashier/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    let user = await models.User.findOne({ 
      email: normalizedEmail,
      role: { $in: ['cashier', 'admin'] }
    });
    
    let cashier = null;
    
    if (!user) {
      cashier = await models.Cashier.findOne({ 
        email: normalizedEmail,
        status: 'active'
      }).populate('shopId', 'name location');
      
      if (!cashier) {
        return res.status(404).json({
          success: false,
          message: 'Cashier account not found'
        });
      }
    }

    if (user) {
      cashier = await models.Cashier.findOne({ 
        email: normalizedEmail,
        status: 'active'
      }).populate('shopId', 'name location');
      
      if (!cashier) {
        if (user.role === 'admin') {
          cashier = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: 'active',
            lastLogin: new Date(),
            shopId: null,
            shopName: null
          };
        } else {
          if (!user.password) {
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials. Please contact administrator.'
            });
          }
          
          let isPasswordValid = false;
          if (user.password.startsWith('$2b$')) {
            isPasswordValid = await bcrypt.compare(password, user.password);
          } else {
            isPasswordValid = user.password === password;
          }
          
          if (!isPasswordValid) {
            return res.status(401).json({
              success: false,
              message: 'Invalid password'
            });
          }
          
          cashier = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: 'active',
            lastLogin: new Date(),
            shopId: null,
            shopName: null
          };
        }
      }
    }

    if (cashier && cashier.password && cashier.password.startsWith('$2b$')) {
      const isPasswordValid = await bcrypt.compare(password, cashier.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }
    }

    if (cashier._id && models.Cashier) {
      try {
        await models.Cashier.findByIdAndUpdate(cashier._id, {
          lastLogin: new Date()
        });
      } catch (err) {
        console.log('Could not update cashier last login:', err.message);
      }
    }

    const token = generateAuthToken(cashier._id, cashier.email, cashier.role || 'cashier');

    const userData = {
      _id: cashier._id,
      name: cashier.name || 'Cashier',
      email: cashier.email,
      role: cashier.role || 'cashier',
      status: cashier.status || 'active',
      lastLogin: cashier.lastLogin || new Date(),
      shopId: cashier.shopId?._id || cashier.shopId || null,
      shopName: cashier.shopId?.name || cashier.shopName || null
    };

    res.json({
      success: true,
      user: userData,
      token: token,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('❌ Cashier login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ==================== TRANSACTION ROUTES ====================

app.get('/api/transactions/combined', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod,
      dataType = 'all'
    } = req.query;

    console.log('🚀 Processing enhanced combined transaction endpoint...', req.query);

    const startTime = Date.now();
   
    const filters = {
      startDate,
      endDate,
      shopId,
      cashierId,
      paymentMethod
    };

    const transactionData = await getAllTransactionData(filters);
    const processingTime = Date.now() - startTime;

    let responseData = {
      success: true,
      data: transactionData,
      processingTime,
      message: 'Combined transaction data fetched successfully',
      cogsMethodology: 'complete_sales_plus_credit_sales_made_exclude_payments',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled',
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    };

    if (dataType !== 'all') {
      switch (dataType) {
        case 'basic':
          responseData.data = {
            transactions: transactionData.salesWithProfit,
            summary: transactionData.summary
          };
          break;
        case 'enhanced':
          responseData.data = {
            transactions: transactionData.salesWithProfit,
            summary: transactionData.financialStats,
            credits: transactionData.credits
          };
          break;
        case 'sales':
          responseData.data = {
            transactions: transactionData.salesWithProfit,
            summary: transactionData.summary,
            performance: transactionData.performance
          };
          break;
        case 'withCredits':
          responseData.data = {
            transactions: transactionData.salesWithProfit,
            credits: transactionData.credits,
            summary: {
              ...transactionData.summary,
              creditSummary: {
                totalCredits: transactionData.credits.length,
                totalCreditAmount: transactionData.summary.totalCreditGiven,
                outstandingCredit: transactionData.summary.outstandingCredit,
                recognizedCreditRevenue: transactionData.summary.recognizedCreditRevenue,
                immediateRevenue: transactionData.summary.immediateRevenue
              }
            }
          };
          break;
        case 'optimized':
          responseData.data = {
            comprehensiveReport: transactionData.comprehensiveReport,
            salesSummary: {
              financialStats: transactionData.financialStats,
              topProducts: transactionData.performance.topProducts,
              topCashiers: transactionData.performance.topCashiers
            },
            enhancedStats: transactionData.enhancedStats,
            filteredTransactions: transactionData.salesWithProfit
          };
          break;
        case 'metrics-only':
          responseData.data = {
            metrics: transactionData.financialStats,
            period: {
              startDate: startDate || 'All time',
              endDate: endDate || 'All time'
            }
          };
          break;
      }
    }

    res.json(responseData);
  } catch (error) {
    console.error('❌ Error in enhanced combined transaction endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch combined transaction data',
      error: error.message,
      processingTime: 0
    });
  }
});

app.get('/api/transactions/metrics', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId
    } = req.query;

    const filters = {
      startDate,
      endDate,
      shopId,
      cashierId
    };

    const transactionData = await getAllTransactionData(filters);

    const metrics = {
      totalSales: {
        amount: transactionData.financialStats.totalRevenue,
        count: transactionData.financialStats.totalSales,
        description: `${transactionData.financialStats.totalSales} transactions`
      },
      creditSales: {
        amount: transactionData.financialStats.creditSales,
        count: transactionData.financialStats.creditSalesCount,
        description: `${transactionData.financialStats.creditSalesCount} credit transactions`
      },
      nonCreditSales: {
        amount: transactionData.financialStats.nonCreditSales,
        count: transactionData.financialStats.nonCreditSalesCount,
        description: `${transactionData.financialStats.nonCreditSalesCount} complete transactions`
      },
      totalRevenue: {
        amount: transactionData.financialStats.totalRevenue,
        description: 'From credit & non-credit sales'
      },
      expenses: {
        amount: transactionData.financialStats.totalExpenses,
        description: 'Total operational costs'
      },
      grossProfit: {
        amount: transactionData.financialStats.grossProfit,
        description: 'Revenue - Cost of Goods'
      },
      netProfit: {
        amount: transactionData.financialStats.netProfit,
        description: 'After all expenses'
      },
      costOfGoodsSold: {
        amount: transactionData.financialStats.costOfGoodsSold,
        description: 'For credit & non-credit sales'
      },
      totalMpesaBank: {
        amount: transactionData.financialStats.totalMpesaBank,
        description: 'Digital payments'
      },
      totalCash: {
        amount: transactionData.financialStats.totalCash,
        description: 'Cash payments'
      },
      outstandingCredit: {
        amount: transactionData.financialStats.outstandingCredit,
        description: 'Unpaid credit balance'
      },
      totalCreditGiven: {
        amount: transactionData.financialStats.totalCreditGiven,
        description: 'Total credit extended'
      }
    };

    res.json({
      success: true,
      data: metrics,
      period: {
        startDate: startDate || 'All time',
        endDate: endDate || 'All time'
      },
      message: 'Transaction metrics fetched successfully',
      cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled',
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    });
  } catch (error) {
    console.error('❌ Error fetching transaction metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction metrics',
      error: error.message
    });
  }
});

// ==================== PRODUCT ROUTES ====================

app.get('/api/products', async (req, res) => {
  try {
    const products = await models.Product.find()
      .populate('shop', 'name location type')
      .sort({ createdAt: -1 });
   
    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const productData = req.body;
   
    if (productData.shop) {
      const shop = await models.Shop.findById(productData.shop);
      if (shop) {
        productData.shopName = shop.name;
        productData.shopId = shop._id;
      }
    }

    const product = new models.Product(productData);
    await product.save();
    await product.populate('shop', 'name location type');
   
    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully'
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const product = await models.Product.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shop', 'name location type');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product',
      error: error.message
    });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await models.Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: error.message
    });
  }
});

// ==================== SHOP ROUTES ====================

app.get('/api/shops', async (req, res) => {
  try {
    const shops = await models.Shop.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: shops,
      count: shops.length
    });
  } catch (error) {
    console.error('Error fetching shops:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shops',
      error: error.message
    });
  }
});

app.post('/api/shops', async (req, res) => {
  try {
    const shopData = req.body;
    const shop = new models.Shop(shopData);
    await shop.save();
   
    res.status(201).json({
      success: true,
      data: shop,
      message: 'Shop created successfully'
    });
  } catch (error) {
    console.error('Error creating shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create shop',
      error: error.message
    });
  }
});

app.put('/api/shops/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const shop = await models.Shop.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    res.json({
      success: true,
      data: shop,
      message: 'Shop updated successfully'
    });
  } catch (error) {
    console.error('Error updating shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shop',
      error: error.message
    });
  }
});

app.delete('/api/shops/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await models.Shop.findByIdAndDelete(id);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    res.json({
      success: true,
      message: 'Shop deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shop:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shop',
      error: error.message
    });
  }
});

// ==================== CASHIER ROUTES ====================

app.get('/api/cashiers', async (req, res) => {
  try {
    const cashiers = await models.Cashier.find()
      .populate('shopId', 'name location')
      .sort({ createdAt: -1 });
   
    res.json({
      success: true,
      data: cashiers,
      count: cashiers.length
    });
  } catch (error) {
    console.error('Error fetching cashiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cashiers',
      error: error.message
    });
  }
});

app.post('/api/cashiers', async (req, res) => {
  try {
    const cashierData = req.body;

    if (cashierData.password) {
      cashierData.password = await bcrypt.hash(cashierData.password, 10);
    }

    const cashier = new models.Cashier(cashierData);
    await cashier.save();
    await cashier.populate('shopId', 'name location');
   
    res.status(201).json({
      success: true,
      data: cashier,
      message: 'Cashier created successfully'
    });
  } catch (error) {
    console.error('Error creating cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create cashier',
      error: error.message
    });
  }
});

app.put('/api/cashiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existingCashier = await models.Cashier.findById(id);
    if (!existingCashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    if (updateData.password && updateData.password.trim() !== '') {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }

    const cashier = await models.Cashier.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shopId', 'name location');

    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cashier',
      error: error.message
    });
  }
});

app.patch('/api/cashiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existingCashier = await models.Cashier.findById(id);
    if (!existingCashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    if (updateData.password && updateData.password.trim() !== '') {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }

    const cashier = await models.Cashier.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('shopId', 'name location');

    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cashier',
      error: error.message
    });
  }
});

app.delete('/api/cashiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cashier = await models.Cashier.findByIdAndDelete(id);

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    res.json({
      success: true,
      message: 'Cashier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting cashier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete cashier',
      error: error.message
    });
  }
});

// ==================== EXPENSE ROUTES ====================

app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await models.Expense.find()
      .populate('shop', 'name location')
      .sort({ date: -1 });
   
    res.json({
      success: true,
      data: expenses,
      count: expenses.length
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const expenseData = req.body;

    if (expenseData.shop) {
      const shop = await models.Shop.findById(expenseData.shop);
      if (shop) {
        expenseData.shopName = shop.name;
        expenseData.shopId = shop._id.toString();
      } else {
        return res.status(400).json({
          success: false,
          message: 'Selected shop not found'
        });
      }
    } else {
      expenseData.shopName = 'No Shop Assigned';
    }

    const expense = new models.Expense(expenseData);
    await expense.save();
    await expense.populate('shop', 'name location');

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await models.Expense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
});

// ==================== CREDIT ROUTES ====================

app.post('/api/credits', async (req, res) => {
  try {
    const creditData = req.body;

    if (creditData.transactionId) {
      const existingCredit = await models.Credit.findOne({
        transactionId: creditData.transactionId
      });
     
      if (existingCredit) {
        return res.status(409).json({
          success: false,
          message: 'Credit record already exists for this transaction',
          data: existingCredit
        });
      }
    }

    if (creditData.transactionId) {
      const transaction = await models.Transaction.findById(creditData.transactionId);
      if (transaction) {
        if (!creditData.shop) creditData.shop = transaction.shop;
        if (!creditData.shopId) creditData.shopId = transaction.shopId;
        if (!creditData.shopName) creditData.shopName = transaction.shopName;
        if (!creditData.cashierId) creditData.cashierId = transaction.cashierId;
        if (!creditData.cashierName) creditData.cashierName = transaction.cashierName;
        if (!creditData.upfrontPaymentAmount) creditData.upfrontPaymentAmount = transaction.upfrontPaymentAmount;
        if (!creditData.upfrontPaymentMethod) creditData.upfrontPaymentMethod = transaction.upfrontPaymentMethod;
        if (!creditData.upfrontPaymentSplit) creditData.upfrontPaymentSplit = transaction.upfrontPaymentSplit;
        if (!creditData.immediateRevenue) creditData.immediateRevenue = transaction.immediateRevenue;
      }
    }

    if (!creditData.status) {
      creditData.status = creditData.balanceDue > 0 ? 'pending' : 'paid';
    }

    if (!creditData.dueDate) {
      creditData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    if (!creditData.paymentHistory && creditData.amountPaid > 0) {
      creditData.paymentHistory = [{
        amount: creditData.amountPaid,
        paymentDate: new Date(),
        paymentMethod: creditData.upfrontPaymentMethod || 'initial',
        recordedBy: creditData.recordedBy || 'System',
        cashierName: creditData.cashierName,
        notes: 'Initial upfront payment'
      }];
    }

    const credit = new models.Credit(creditData);
    await credit.save();
   
    await credit.populate('transactionId');
    await credit.populate('shop', 'name location type');
    await credit.populate('cashierId', 'name email');

    res.status(201).json({
      success: true,
      data: credit,
      message: 'Credit record created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create credit record',
      error: error.message
    });
  }
});

app.get('/api/credits', async (req, res) => {
  try {
    const { shopId, status, cashierId, startDate, endDate, includeTransactions = 'false' } = req.query;
   
    let filter = {};
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId },
        { creditShopId: shopId }
      ];
    }
    if (status && status !== 'all') filter.status = status;
    if (cashierId && cashierId !== 'all') {
      filter.$or = [
        { cashierId: cashierId },
        { cashierName: { $regex: cashierId, $options: 'i' } }
      ];
    }
   
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const credits = await models.Credit.find(filter)
      .populate('transactionId')
      .populate('shop', 'name location type')
      .populate('cashierId', 'name email')
      .sort({ dueDate: 1 });

    res.json({
      success: true,
      data: credits,
      count: credits.length,
      summary: {
        totalCredits: credits.length,
        totalCreditAmount: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.totalAmount), 0),
        totalPaid: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.amountPaid), 0),
        totalOutstanding: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.balanceDue), 0),
        overdueCount: credits.filter(c =>
          c.dueDate && new Date(c.dueDate) < new Date() && c.balanceDue > 0
        ).length,
        totalUpfrontPayments: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.upfrontPaymentAmount), 0),
        totalImmediateRevenue: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.immediateRevenue), 0)
      },
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    });
  } catch (error) {
    console.error('Error fetching credits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credits',
      error: error.message
    });
  }
});

app.put('/api/credits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const credit = await models.Credit.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    )
      .populate('transactionId')
      .populate('shop', 'name location type')
      .populate('cashierId', 'name email');

    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }

    res.json({
      success: true,
      data: credit,
      message: 'Credit record updated successfully'
    });
  } catch (error) {
    console.error('Error updating credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update credit record',
      error: error.message
    });
  }
});

app.delete('/api/credits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const credit = await models.Credit.findByIdAndDelete(id);

    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }

    res.json({
      success: true,
      message: 'Credit record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete credit record',
      error: error.message
    });
  }
});

app.get('/api/credits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeTransaction = 'false' } = req.query;

    let credit = await models.Credit.findById(id)
      .populate('shop', 'name location type')
      .populate('cashierId', 'name email');

    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }

    if (includeTransaction === 'true' && credit.transactionId) {
      const transaction = await models.Transaction.findById(credit.transactionId)
        .populate('shop', 'name location type')
        .populate('cashierId', 'name email')
        .populate('items.productId', 'name buyingPrice');
     
      credit = credit.toObject();
      credit.transactionDetails = transaction;
    }

    res.json({
      success: true,
      data: credit,
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    });
  } catch (error) {
    console.error('Error fetching credit record:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch credit record',
      error: error.message
    });
  }
});

app.patch('/api/credits/:id/payment', async (req, res) => {
  try {
    const { amount, paymentMethod, recordedBy, cashierName, notes } = req.body;
   
    if (!amount || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: amount, paymentMethod'
      });
    }

    const credit = await models.Credit.findById(req.params.id);
    if (!credit) {
      return res.status(404).json({
        success: false,
        message: 'Credit record not found'
      });
    }

    const paymentAmount = CalculationUtils.safeNumber(amount);
    const currentAmountPaid = CalculationUtils.safeNumber(credit.amountPaid);
    const newAmountPaid = currentAmountPaid + paymentAmount;
    const totalAmount = CalculationUtils.safeNumber(credit.totalAmount);
    const newBalanceDue = Math.max(0, totalAmount - newAmountPaid);

    credit.paymentHistory.push({
      amount: paymentAmount,
      paymentMethod,
      recordedBy: recordedBy || 'System',
      cashierName: cashierName || credit.cashierName,
      paymentDate: new Date(),
      notes: notes || `Payment of ${CalculationUtils.formatCurrency(paymentAmount)}`
    });

    credit.amountPaid = newAmountPaid;
    credit.balanceDue = newBalanceDue;

    let newStatus = credit.status;
    if (newBalanceDue <= 0) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partially_paid';
    } else {
      newStatus = 'pending';
    }
    credit.status = newStatus;

    credit.updatedAt = new Date();
    await credit.save();

    if (credit.transactionId) {
      await models.Transaction.findByIdAndUpdate(credit.transactionId, {
        amountPaid: newAmountPaid,
        recognizedRevenue: newAmountPaid,
        outstandingRevenue: newBalanceDue,
        creditStatus: newStatus,
        updatedAt: new Date()
      });
    }

    await credit.populate('transactionId');
    await credit.populate('shop', 'name location type');
    await credit.populate('cashierId', 'name email');

    res.json({
      success: true,
      data: credit,
      message: `Payment of ${CalculationUtils.formatCurrency(paymentAmount)} recorded successfully`
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment',
      error: error.message
    });
  }
});

// ==================== TRANSACTION CREATION ROUTE ====================

app.post('/api/transactions', async (req, res) => {
  try {
    const transactionData = req.body;

    if (transactionData.transactionNumber) {
      const existingTransaction = await models.Transaction.findOne({
        transactionNumber: transactionData.transactionNumber
      });
     
      if (existingTransaction) {
        return res.status(409).json({
          success: false,
          message: 'Transaction with this number already exists'
        });
      }
    }

    if (transactionData.isCreditPayment && transactionData.originalCreditId) {
      return await handleCreditPayment(transactionData, res);
    }

    if (transactionData.shop) {
      const shop = await models.Shop.findById(transactionData.shop);
      if (shop) {
        transactionData.shopName = shop.name;
        transactionData.shopId = shop._id;
      }
    }

    if (transactionData.cashierId) {
      const cashier = await models.Cashier.findById(transactionData.cashierId);
      if (cashier) {
        transactionData.cashierName = cashier.name;
      }
    }

    const items = transactionData.items || [];
    let totalAmount = 0;
    let totalCost = 0;

    const enhancedItems = await Promise.all(items.map(async (item) => {
      const quantity = CalculationUtils.safeNumber(item.quantity, 1);
      const price = CalculationUtils.safeNumber(item.price);
      const buyingPrice = CalculationUtils.safeNumber(item.buyingPrice);
      const itemTotalPrice = price * quantity;
      const itemCost = buyingPrice * quantity;
      const itemProfit = itemTotalPrice - itemCost;
      const itemProfitMargin = itemTotalPrice > 0 ? (itemProfit / itemTotalPrice) * 100 : 0;

      totalAmount += itemTotalPrice;
      totalCost += itemCost;

      if (item.productId && !transactionData.isCreditPayment) {
        try {
          const product = await models.Product.findById(item.productId);
          if (product) {
            const currentStock = CalculationUtils.safeNumber(product.currentStock);
            const newStock = Math.max(0, currentStock - quantity);
           
            await models.Product.findByIdAndUpdate(item.productId, {
              currentStock: newStock,
              updatedAt: new Date()
            });
          }
        } catch (stockError) {
          console.error('❌ Error reducing stock for product:', item.productId, stockError);
        }
      }

      return {
        ...item,
        quantity,
        price,
        totalPrice: itemTotalPrice,
        buyingPrice,
        cost: itemCost,
        profit: itemProfit,
        profitMargin: itemProfitMargin
      };
    }));

    const amountPaidNow = CalculationUtils.safeNumber(transactionData.amountPaidNow) || 0;
    const isCreditTransaction = transactionData.paymentMethod === 'credit';
   
    let recognizedRevenue = totalAmount;
    let outstandingRevenue = 0;
    let amountPaid = totalAmount;
    let creditStatus = 'completed';
    let immediateRevenue = totalAmount;

    if (isCreditTransaction) {
      amountPaid = amountPaidNow;
      recognizedRevenue = amountPaidNow;
      outstandingRevenue = Math.max(0, totalAmount - amountPaidNow);
      immediateRevenue = amountPaidNow;
     
      if (outstandingRevenue <= 0) {
        creditStatus = 'paid';
      } else if (amountPaidNow > 0) {
        creditStatus = 'partially_paid';
      } else {
        creditStatus = 'pending';
      }
    }

    const profit = recognizedRevenue - totalCost;
    const profitMargin = recognizedRevenue > 0 ? (profit / recognizedRevenue) * 100 : 0;

    transactionData.totalAmount = totalAmount;
    transactionData.cost = totalCost;
    transactionData.profit = profit;
    transactionData.profitMargin = profitMargin;
    transactionData.itemsCount = items.reduce((sum, item) => sum + CalculationUtils.safeNumber(item.quantity, 1), 0);
    transactionData.items = enhancedItems;

    transactionData.paymentSplit = {
      cash: 0,
      bank_mpesa: 0,
      credit: 0
    };

    if (isCreditTransaction) {
      transactionData.isCreditTransaction = true;
      transactionData.creditStatus = creditStatus;
      transactionData.recognizedRevenue = recognizedRevenue;
      transactionData.outstandingRevenue = outstandingRevenue;
      transactionData.amountPaid = amountPaid;
      transactionData.status = 'credit';
      transactionData.immediateRevenue = immediateRevenue;
      transactionData.creditShopName = transactionData.creditShopName || transactionData.shopName;
      transactionData.creditShopId = transactionData.creditShopId || transactionData.shopId;
      transactionData.shopClassification = transactionData.shopClassification || transactionData.shopName;
      transactionData.upfrontPaymentAmount = amountPaidNow;
      transactionData.upfrontPaymentMethod = transactionData.upfrontPaymentMethod || 'cash';
     
      if (transactionData.upfrontPaymentSplit) {
        transactionData.upfrontPaymentSplit = transactionData.upfrontPaymentSplit;
      }
     
      if (amountPaidNow > 0) {
        if (transactionData.upfrontPaymentMethod === 'cash') {
          transactionData.paymentSplit.cash = amountPaidNow;
        } else if (transactionData.upfrontPaymentMethod === 'bank_mpesa') {
          transactionData.paymentSplit.bank_mpesa = amountPaidNow;
        } else if (transactionData.upfrontPaymentMethod === 'cash_bank_mpesa' && transactionData.upfrontPaymentSplit) {
          transactionData.paymentSplit.cash = CalculationUtils.safeNumber(transactionData.upfrontPaymentSplit.cash);
          transactionData.paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.upfrontPaymentSplit.bank_mpesa);
        }
        transactionData.paymentSplit.credit = outstandingRevenue;
      } else {
        transactionData.paymentSplit.credit = totalAmount;
      }
     
      if (!transactionData.dueDate) {
        transactionData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      transactionData.isCreditTransaction = false;
      transactionData.recognizedRevenue = recognizedRevenue;
      transactionData.outstandingRevenue = 0;
      transactionData.amountPaid = amountPaid;
      transactionData.status = 'completed';
      transactionData.immediateRevenue = immediateRevenue;
     
      if (transactionData.paymentMethod === 'cash') {
        transactionData.paymentSplit.cash = totalAmount;
      } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transactionData.paymentMethod)) {
        transactionData.paymentSplit.bank_mpesa = totalAmount;
      } else if (transactionData.paymentMethod === 'cash_bank_mpesa' && transactionData.paymentSplit) {
        transactionData.paymentSplit.cash = CalculationUtils.safeNumber(transactionData.paymentSplit.cash);
        transactionData.paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.paymentSplit.bank_mpesa);
      }
    }

    if (!transactionData.transactionNumber) {
      transactionData.transactionNumber = `TXN-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 5)}`;
    }

    const transaction = new models.Transaction(transactionData);
    await transaction.save();
   
    await transaction.populate('shop', 'name location type');
    await transaction.populate('cashierId', 'name email');
    await transaction.populate('items.productId', 'name buyingPrice');

    if (isCreditTransaction && !transactionData.isCreditPayment) {
      const existingCredit = await models.Credit.findOne({
        transactionId: transaction._id
      });
     
      if (!existingCredit) {
        const creditData = {
          transactionId: transaction._id,
          customerName: transactionData.customerName || 'Unknown Customer',
          customerPhone: transactionData.customerPhone,
          customerEmail: transactionData.customerEmail,
          totalAmount: totalAmount,
          amountPaid: amountPaidNow,
          balanceDue: outstandingRevenue,
          dueDate: transactionData.dueDate,
          status: creditStatus,
          shop: transactionData.shop,
          shopId: transactionData.shopId,
          shopName: transactionData.shopName,
          creditShopName: transactionData.creditShopName || transactionData.shopName,
          creditShopId: transactionData.creditShopId || transactionData.shopId,
          shopClassification: transactionData.shopClassification || transactionData.shopName,
          cashierId: transactionData.cashierId,
          cashierName: transactionData.cashierName,
          recordedBy: transactionData.recordedBy || 'System',
          notes: `Credit transaction created for ${transactionData.customerName}`,
          upfrontPaymentAmount: amountPaidNow,
          upfrontPaymentMethod: transactionData.upfrontPaymentMethod || 'cash',
          upfrontPaymentSplit: transactionData.upfrontPaymentSplit || {
            cash: 0,
            bank_mpesa: 0
          },
          immediateRevenue: amountPaidNow
        };

        if (amountPaidNow > 0) {
          creditData.paymentHistory = [{
            amount: amountPaidNow,
            paymentDate: new Date(),
            paymentMethod: transactionData.upfrontPaymentMethod || 'cash',
            recordedBy: transactionData.recordedBy || 'System',
            cashierName: transactionData.cashierName,
            notes: `Initial upfront payment for credit sale`
          }];
        }

        const credit = await models.Credit.create(creditData);
      }
    }

    res.status(201).json({
      success: true,
      data: transaction,
      message: `Transaction created successfully${isCreditTransaction ? ' with credit record' : ''}`,
      creditDetails: isCreditTransaction ? {
        totalAmount,
        amountPaid: amountPaidNow,
        balanceDue: outstandingRevenue,
        status: creditStatus,
        upfrontPaymentAmount: transactionData.upfrontPaymentAmount,
        upfrontPaymentMethod: transactionData.upfrontPaymentMethod,
        immediateRevenue: transactionData.immediateRevenue
      } : null
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create transaction',
      error: error.message
    });
  }
});

async function handleCreditPayment(transactionData, res) {
  try {
    const originalCredit = await models.Credit.findById(transactionData.originalCreditId)
      .populate('transactionId')
      .populate('shop', 'name location type');

    if (!originalCredit) {
      return res.status(404).json({
        success: false,
        message: 'Original credit record not found'
      });
    }

    const paymentAmount = CalculationUtils.safeNumber(transactionData.totalAmount);
    const currentAmountPaid = CalculationUtils.safeNumber(originalCredit.amountPaid);
    const newAmountPaid = currentAmountPaid + paymentAmount;
    const totalAmount = CalculationUtils.safeNumber(originalCredit.totalAmount);
    const newBalanceDue = Math.max(0, totalAmount - newAmountPaid);

    originalCredit.amountPaid = newAmountPaid;
    originalCredit.balanceDue = newBalanceDue;
   
    let newStatus = originalCredit.status;
    if (newBalanceDue <= 0) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partially_paid';
    }
    originalCredit.status = newStatus;

    originalCredit.paymentHistory.push({
      amount: paymentAmount,
      paymentDate: new Date(),
      paymentMethod: transactionData.paymentMethod,
      recordedBy: transactionData.recordedBy || 'System',
      cashierName: transactionData.cashierName || 'Cashier',
      notes: `Credit payment of ${CalculationUtils.formatCurrency(paymentAmount)}`
    });

    originalCredit.updatedAt = new Date();
    await originalCredit.save();

    if (originalCredit.transactionId) {
      await models.Transaction.findByIdAndUpdate(originalCredit.transactionId, {
        amountPaid: newAmountPaid,
        recognizedRevenue: newAmountPaid,
        outstandingRevenue: newBalanceDue,
        creditStatus: newStatus,
        updatedAt: new Date()
      });
    }

    const paymentSplit = {
      cash: 0,
      bank_mpesa: 0,
      credit: 0
    };

    if (transactionData.paymentMethod === 'cash') {
      paymentSplit.cash = paymentAmount;
    } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transactionData.paymentMethod)) {
      paymentSplit.bank_mpesa = paymentAmount;
    } else if (transactionData.paymentMethod === 'cash_bank_mpesa' && transactionData.paymentSplit) {
      paymentSplit.cash = CalculationUtils.safeNumber(transactionData.paymentSplit.cash);
      paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.paymentSplit.bank_mpesa);
    }

    const paymentTransactionData = {
      ...transactionData,
      isCreditPayment: true,
      originalCreditId: originalCredit._id,
      transactionNumber: `PAY-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 5)}`,
      recognizedRevenue: paymentAmount,
      outstandingRevenue: 0,
      amountPaid: paymentAmount,
      immediateRevenue: paymentAmount,
      isCreditTransaction: false,
      creditStatus: null,
      status: 'completed',
      paymentSplit: paymentSplit
    };

    const paymentTransaction = new models.Transaction(paymentTransactionData);
    await paymentTransaction.save();

    res.status(201).json({
      success: true,
      data: {
        credit: originalCredit,
        paymentTransaction: paymentTransaction
      },
      message: `Credit payment of ${CalculationUtils.formatCurrency(paymentAmount)} recorded successfully. New balance: ${CalculationUtils.formatCurrency(newBalanceDue)}`
    });
  } catch (error) {
    console.error('❌ Error processing credit payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process credit payment',
      error: error.message
    });
  }
}

// ==================== DEBUG ENDPOINTS ====================

app.get('/api/debug/database', async (req, res) => {
  try {
    const counts = {
      products: await models.Product.countDocuments(),
      shops: await models.Shop.countDocuments(),
      cashiers: await models.Cashier.countDocuments(),
      expenses: await models.Expense.countDocuments(),
      transactions: await models.Transaction.countDocuments(),
      users: await models.User.countDocuments(),
      secureCodes: await models.SecureCode.countDocuments(),
      credits: await models.Credit.countDocuments()
    };
   
    res.json({
      success: true,
      counts,
      database: mongoose.connection.name,
      status: 'connected',
      cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled',
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database check failed',
      error: error.message
    });
  }
});

app.get('/api/debug/collections', async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    let collections = [];
    let collectionNames = [];
    let counts = {};
    
    if (isConnected) {
      collections = await mongoose.connection.db.listCollections().toArray();
      collectionNames = collections.map(c => c.name);
      for (const name of collectionNames) {
        try {
          counts[name] = await mongoose.connection.db.collection(name).countDocuments();
        } catch (err) {
          counts[name] = 'Error';
        }
      }
    }
    
    const modelStatus = {
      SecureCode: !!models.SecureCode,
      User: !!models.User,
      Cashier: !!models.Cashier,
      Transaction: !!models.Transaction,
      Credit: !!models.Credit,
      Product: !!models.Product,
      Shop: !!models.Shop,
      Expense: !!models.Expense
    };
    
    let users = [];
    let secureCodes = [];
    
    if (models.User) {
      try {
        users = await models.User.find({}, 'email name role isActive').lean();
      } catch (err) {
        console.error('Error fetching users:', err.message);
      }
    }
    
    if (models.SecureCode) {
      try {
        secureCodes = await models.SecureCode.find({}, 'email used attempts expiresAt').lean();
      } catch (err) {
        console.error('Error fetching secure codes:', err.message);
      }
    }
    
    res.json({
      success: true,
      data: {
        database: {
          isConnected,
          name: mongoose.connection.name || 'Not connected',
          readyState: mongoose.connection.readyState,
          collections: collectionNames,
          counts: counts
        },
        models: modelStatus,
        users: users.map(u => ({
          email: u.email,
          name: u.name,
          role: u.role,
          isActive: u.isActive
        })),
        secureCodes: secureCodes.map(s => ({
          email: s.email,
          used: s.used,
          attempts: s.attempts,
          expiresAt: s.expiresAt
        })),
        summary: {
          totalUsers: users.length,
          totalSecureCodes: secureCodes.length,
          totalCollections: collectionNames.length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error checking collections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check collections',
      error: error.message
    });
  }
});

// ==================== ROOT ENDPOINT ====================

app.get('/', (req, res) => {
  res.json({
    message: process.env.APP_NAME || 'Pamela Management API',
    version: process.env.APP_VERSION || '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      metrics: '/api/transactions/metrics',
      combined: '/api/transactions/combined',
      withCredits: '/api/transactions/with-credits'
    },
    serverless: true,
    cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced'
  });
});

// ==================== 404 HANDLER ====================

app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// ==================== SERVERLESS EXPORT ====================

// Initialize database connection and email on module load
let dbInitialized = false;

const initializeServer = async () => {
  if (dbInitialized) return;
  
  try {
    await connectDB();
    await initializeEmail();
    dbInitialized = true;
    console.log('✅ Serverless initialization complete');
  } catch (error) {
    console.error('❌ Serverless initialization failed:', error);
  }
};

// Initialize for serverless
initializeServer();

// Export for Vercel serverless
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, async () => {
    await connectDB();
    await initializeEmail();
    console.log(`\n🎉 Server Running Locally on Port ${PORT}`);
    console.log('='.repeat(60));
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log('='.repeat(60));
  });
}