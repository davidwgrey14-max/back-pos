// server.js - Complete POS System Backend
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const responseTime = require('response-time');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// ==================== CACHED CONNECTION FOR SERVERLESS ====================
let cachedDb = null;
let models = {};
let emailTransporter = null;
let modelsInitialized = false;
let emailInitialized = false;

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
    lastStockAlertSent: { type: Date, default: null },
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

  // Update the cashierSchema in server.js
const cashierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  password: String,
  role: { type: String, default: 'cashier' },
  status: { type: String, default: 'active' },
  
  // Enhanced shop assignment - support multiple shops or single shop
  assignedShops: [{
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName: String,
    assignedAt: { type: Date, default: Date.now },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true }
  }],
  
  // Primary shop (for backward compatibility)
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
  shopName: String,
  
  // Audit trail for shop assignments
  shopAssignmentHistory: [{
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName: String,
    action: { type: String, enum: ['assigned', 'removed', 'changed'] },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedByName: String,
    timestamp: { type: Date, default: Date.now },
    notes: String
  }],
  
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

  const newModels = {
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
  console.log('📦 Models available:', Object.keys(newModels).join(', '));

  modelsInitialized = true;
  return newModels;
};

// Initialize models immediately
const initializeModelsImmediately = () => {
  console.log('🔧 Initializing models immediately...');
  const schemas = {
    Product: new mongoose.Schema({
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
      lastStockAlertSent: { type: Date, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }),
    Shop: new mongoose.Schema({
      name: { type: String, required: true },
      location: String,
      manager: String,
      contact: String,
      email: String,
      type: { type: String, default: 'retail' },
      status: { type: String, default: 'active' },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }),
    Cashier: new mongoose.Schema({
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
    }),
    Expense: new mongoose.Schema({
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
    }),
    Transaction: new mongoose.Schema({
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
    }),
    Credit: new mongoose.Schema({
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
    }),
    User: new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      role: { type: String, default: 'admin' },
      isActive: { type: Boolean, default: true },
      lastLogin: Date,
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }),
    SecureCode: new mongoose.Schema({
      email: { type: String, required: true },
      code: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      attempts: { type: Number, default: 0 },
      used: { type: Boolean, default: false }
    })
  };

  for (const [name, schema] of Object.entries(schemas)) {
    if (!mongoose.models[name]) {
      mongoose.model(name, schema);
      console.log(`✅ Registered model: ${name}`);
    }
  }

  models = {
    Product: mongoose.model('Product'),
    Shop: mongoose.model('Shop'),
    Cashier: mongoose.model('Cashier'),
    Expense: mongoose.model('Expense'),
    Transaction: mongoose.model('Transaction'),
    Credit: mongoose.model('Credit'),
    User: mongoose.model('User'),
    SecureCode: mongoose.model('SecureCode')
  };

  modelsInitialized = true;
  console.log('✅ Models initialized immediately:', Object.keys(models).join(', '));
};

// Initialize models immediately
initializeModelsImmediately();

// ==================== DEVICE AND SESSION SCHEMAS ====================
const deviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true, unique: true },
  deviceName: { type: String, required: true },
  deviceType: { type: String, enum: ['desktop', 'laptop', 'mobile', 'tablet', 'unknown'] },
  os: { type: String },
  osVersion: { type: String },
  browser: { type: String },
  browserVersion: { type: String },
  macAddress: { type: String },
  ipAddress: { type: String },
  lastLogin: { type: Date, default: Date.now },
  firstLogin: { type: Date, default: Date.now },
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  loginCount: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now },
  sessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  token: { type: String, required: true, unique: true },
  lastActivity: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  logoutReason: { type: String, enum: ['manual', 'inactivity', 'device_verification', 'admin_terminated'] },
  ipAddress: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const verificationRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
  requestToken: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectionReason: { type: String },
  ipAddress: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const loginHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: { type: String },
  role: { type: String },
  success: { type: Boolean, default: false },
  ipAddress: { type: String },
  userAgent: { type: String },
  deviceId: { type: String },
  macAddress: { type: String },
  os: { type: String },
  browser: { type: String },
  location: { type: String },
  failureReason: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
const VerificationRequest = mongoose.models.VerificationRequest || mongoose.model('VerificationRequest', verificationRequestSchema);
const LoginHistory = mongoose.models.LoginHistory || mongoose.model('LoginHistory', loginHistorySchema);

models.Device = Device;
models.Session = Session;
models.VerificationRequest = VerificationRequest;
models.LoginHistory = LoginHistory;

// ==================== STOCK MONITORING SYSTEM ====================
const sendStockAlertEmail = async (products, alertType) => {
  try {
    if (!emailTransporter) {
      await initializeEmail();
      if (!emailTransporter) {
        console.log('⚠️ Email service not configured - skipping stock alert');
        return false;
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com';
    const subject = alertType === 'out_of_stock'
      ? `🚨 URGENT: ${products.length} Products Out of Stock - ${process.env.APP_NAME || 'Shop Management'}`
      : `⚠️ ALERT: ${products.length} Products Low in Stock - ${process.env.APP_NAME || 'Shop Management'}`;

    const productList = products.map(product => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${product.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${product.category || 'Uncategorized'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${product.currentStock}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${product.minStockLevel || 5}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${product.shopName || 'Unknown Shop'}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
        <div style="background: ${alertType === 'out_of_stock' ? '#ff4444' : '#ff9800'}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${alertType === 'out_of_stock' ? '🚨 PRODUCTS OUT OF STOCK' : '⚠️ PRODUCTS LOW IN STOCK'}</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <p>Dear Administrator,</p>
          <p>${alertType === 'out_of_stock'
            ? `The following <strong>${products.length} products</strong> are currently <strong style="color: #ff4444;">OUT OF STOCK</strong>.`
            : `The following <strong>${products.length} products</strong> are running <strong style="color: #ff9800;">LOW IN STOCK</strong>.`}
          </p>
          <div style="margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; background: white;">
              <thead>
                <tr style="background: #333; color: white;">
                  <th style="padding: 12px; border: 1px solid #ddd;">Product</th>
                  <th style="padding: 12px; border: 1px solid #ddd;">Category</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Stock</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Min</th>
                  <th style="padding: 12px; border: 1px solid #ddd;">Shop</th>
                </tr>
              </thead>
              <tbody>${productList}</tbody>
            </table>
          </div>
          <p><strong>Action Required:</strong> Please log in and update stock levels.</p>
        </div>
      </div>
    `;

    await emailTransporter.sendMail({
      from: `"Inventory Alert" <${process.env.EMAIL_USER || 'ichigoeliud021@gmail.com'}>`,
      to: adminEmail,
      subject: subject,
      html: html,
      priority: 'high'
    });
    console.log(`✅ ${alertType} alert sent for ${products.length} products`);
    return true;
  } catch (error) {
    console.error('❌ Error sending stock alert email:', error);
    return false;
  }
};

const checkStockLevels = async () => {
  try {
    console.log('🔍 [STOCK MONITOR] Checking stock levels...');
    if (!models.Product) {
      models = createModels();
    }

    const products = await models.Product.find({ isActive: true })
      .populate('shop', 'name location')
      .lean();

    const outOfStockProducts = [];
    const lowStockProducts = [];

    products.forEach(product => {
      const currentStock = product.currentStock || 0;
      const minStockLevel = product.minStockLevel || 5;

      if (currentStock === 0) {
        outOfStockProducts.push({ ...product, shopName: product.shop?.name || product.shopName || 'Unknown Shop' });
      } else if (currentStock <= minStockLevel) {
        lowStockProducts.push({ ...product, shopName: product.shop?.name || product.shopName || 'Unknown Shop' });
      }
    });

    if (outOfStockProducts.length > 0) {
      await sendStockAlertEmail(outOfStockProducts, 'out_of_stock');
    }

    if (lowStockProducts.length > 0) {
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const productsToAlert = [];

      for (const product of lowStockProducts) {
        const dbProduct = await models.Product.findById(product._id);
        if (!dbProduct) continue;

        const lastAlert = dbProduct.lastStockAlertSent;
        if (!lastAlert || new Date(lastAlert) < sixHoursAgo) {
          productsToAlert.push(product);
          dbProduct.lastStockAlertSent = now;
          await dbProduct.save();
        }
      }

      if (productsToAlert.length > 0) {
        await sendStockAlertEmail(productsToAlert, 'low_stock');
      }
    }

    return {
      outOfStock: outOfStockProducts.length,
      lowStock: lowStockProducts.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ [STOCK MONITOR] Error:', error);
    throw error;
  }
};

// ==================== EMAIL FUNCTIONS ====================
const createEmailTransporter = () => {
  try {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (!emailUser || !emailPass) {
      console.error('❌ Email credentials not configured');
      return null;
    }

    return nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: { rejectUnauthorized: false },
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    });
  } catch (error) {
    console.error('❌ Error creating email transporter:', error.message);
    return null;
  }
};

const initializeEmail = async () => {
  try {
    console.log('📧 Initializing email transporter...');
    emailTransporter = createEmailTransporter();
    
    if (emailTransporter) {
      await emailTransporter.verify();
      console.log('✅ Email transporter is ready');
      emailInitialized = true;
      return true;
    }
    emailInitialized = false;
    return false;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    emailInitialized = false;
    return false;
  }
};

const sendDeviceVerificationEmail = async (user, device, verificationRequest) => {
  try {
    if (!emailTransporter) {
      const initialized = await initializeEmail();
      if (!initialized || !emailTransporter) {
        console.error('❌ Email transporter could not be initialized');
        return false;
      }
    }

    let adminEmails = [];
    try {
      const admins = await models.User.find({ role: 'admin' }).select('email name');
      adminEmails = admins.map(a => a.email);
    } catch (error) {
      console.error('❌ Error finding admin users:', error);
    }

    if (adminEmails.length === 0) {
      adminEmails.push(process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com');
    }

    if (user.email && !adminEmails.includes(user.email) && user.role !== 'admin') {
      adminEmails.push(user.email);
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://pos-frontend-psi-teal.vercel.app';
    const approveLink = `${frontendUrl}/admin/verify-device/${verificationRequest.requestToken}?action=approve`;
    const rejectLink = `${frontendUrl}/admin/verify-device/${verificationRequest.requestToken}?action=reject`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); padding: 20px; text-align: center; color: white;">
          <h1 style="margin: 0;">🔐 New Device Verification Request</h1>
        </div>
        <div style="background: white; padding: 20px;">
          <h2 style="color: #333;">Device Login Request</h2>
          <p>A user is trying to log in from a new device.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p><strong>👤 User:</strong> ${user.name || 'Unknown User'} (${user.email})</p>
            <p><strong>💻 Device:</strong> ${device.deviceName || 'Unknown Device'}</p>
            <p><strong>🖥️ OS:</strong> ${device.os || 'Unknown'} ${device.osVersion || ''}</p>
            <p><strong>🌐 Browser:</strong> ${device.browser || 'Unknown'} ${device.browserVersion || ''}</p>
            <p><strong>📱 MAC:</strong> ${device.macAddress || 'Unknown'}</p>
          </div>
          <div style="margin: 20px 0; text-align: center;">
            <p style="font-weight: bold;">Click below to approve or reject:</p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <a href="${approveLink}" style="background: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; font-weight: bold;">✅ Approve Device</a>
              <a href="${rejectLink}" style="background: #EF4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; font-weight: bold;">❌ Reject Device</a>
            </div>
          </div>
        </div>
      </div>
    `;

    let sentCount = 0;
    for (const adminEmail of adminEmails) {
      try {
        await emailTransporter.sendMail({
          from: `"${process.env.APP_NAME || 'Shop Management'} Security" <${process.env.EMAIL_USER}>`,
          to: adminEmail,
          subject: `🔐 New Device Login Request - ${user.name || 'Unknown User'}`,
          html: html,
          priority: 'high'
        });
        sentCount++;
      } catch (error) {
        console.error(`❌ Failed to send to ${adminEmail}:`, error.message);
      }
    }

    return sentCount > 0;
  } catch (error) {
    console.error('❌ Error in sendDeviceVerificationEmail:', error);
    return false;
  }
};

const sendDeviceApprovedEmail = async (user, device) => {
  try {
    if (!emailTransporter) return false;
    await emailTransporter.sendMail({
      from: `"${process.env.APP_NAME || 'Shop Management'}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '✅ Device Approved',
      html: `<h2>Device Approved</h2><p>Your device <strong>${device.deviceName || 'Unknown'}</strong> has been approved.</p><p>You can now login.</p>`
    });
    return true;
  } catch (error) {
    console.error('Error sending approval email:', error);
    return false;
  }
};

const sendDeviceRejectedEmail = async (user, device, reason) => {
  try {
    if (!emailTransporter) return false;
    await emailTransporter.sendMail({
      from: `"${process.env.APP_NAME || 'Shop Management'}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '❌ Device Request Rejected',
      html: `<h2>Device Request Rejected</h2><p>Your device <strong>${device.deviceName || 'Unknown'}</strong> has been rejected.</p><p>Reason: ${reason || 'No reason provided'}</p>`
    });
    return true;
  } catch (error) {
    console.error('Error sending rejection email:', error);
    return false;
  }
};

// ==================== DATABASE CONNECTION ====================
const connectDB = async () => {
  try {
    if (cachedDb && mongoose.connection.readyState === 1) {
      return cachedDb;
    }

    const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/Eliud_db';

    console.log('🔗 Connecting to MongoDB...');

    const connectionOptions = {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      retryWrites: true,
      retryReads: true,
      bufferCommands: true,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 30000
    };

    const conn = await mongoose.connect(connectionString, connectionOptions);
    cachedDb = conn;
    console.log('🎉 Database connection established');
    return conn;
  } catch (error) {
    console.error(`❌ Database connection error: ${error.message}`);
    throw error;
  }
};

// ==================== DEVICE FINGERPRINTING UTILITIES ====================
const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || 'unknown';

  let os = 'Unknown', osVersion = 'Unknown', deviceType = 'unknown', deviceName = 'Unknown Device';

  if (userAgent.includes('Windows NT 10.0')) {
    os = 'Windows 10'; osVersion = '10.0'; deviceType = 'desktop'; deviceName = 'Windows PC';
  } else if (userAgent.includes('Windows NT 6.1')) {
    os = 'Windows 7'; osVersion = '6.1'; deviceType = 'desktop'; deviceName = 'Windows PC';
  } else if (userAgent.includes('Windows NT 6.2')) {
    os = 'Windows 8'; osVersion = '6.2'; deviceType = 'desktop'; deviceName = 'Windows PC';
  } else if (userAgent.includes('Windows NT 6.3')) {
    os = 'Windows 8.1'; osVersion = '6.3'; deviceType = 'desktop'; deviceName = 'Windows PC';
  } else if (userAgent.includes('Mac OS X')) {
    os = 'macOS';
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    if (match) osVersion = match[1].replace('_', '.');
    deviceType = 'desktop'; deviceName = 'Mac';
  } else if (userAgent.includes('iPhone')) {
    os = 'iOS'; deviceType = 'mobile'; deviceName = 'iPhone';
  } else if (userAgent.includes('iPad')) {
    os = 'iOS'; deviceType = 'tablet'; deviceName = 'iPad';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
    const match = userAgent.match(/Android (\d+[._]\d+)/);
    if (match) osVersion = match[1];
    deviceType = 'mobile'; deviceName = 'Android Device';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux'; deviceType = 'desktop'; deviceName = 'Linux PC';
  }

  let browser = 'Unknown', browserVersion = 'Unknown';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    browser = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+)/);
    if (match) browserVersion = match[1];
  } else if (userAgent.includes('Firefox')) {
    browser = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+)/);
    if (match) browserVersion = match[1];
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari';
    const match = userAgent.match(/Version\/(\d+)/);
    if (match) browserVersion = match[1];
  } else if (userAgent.includes('Edg')) {
    browser = 'Edge';
    const match = userAgent.match(/Edg\/(\d+)/);
    if (match) browserVersion = match[1];
  }

  const macFallback = crypto
    .createHash('sha256')
    .update(`${userAgent}${ip}${req.headers['accept-language'] || ''}`)
    .digest('hex')
    .substring(0, 17)
    .toUpperCase()
    .replace(/(.{2})(?=.)/g, '$1:');

  return {
    userAgent,
    ipAddress: ip,
    os,
    osVersion,
    browser,
    browserVersion,
    deviceType,
    deviceName,
    macAddress: macFallback,
    deviceId: crypto
      .createHash('sha256')
      .update(`${userAgent}${ip}${req.headers['accept-language'] || ''}`)
      .digest('hex')
      .substring(0, 32)
  };
};

// ==================== AUTH MIDDLEWARE ====================
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');

    const session = await Session.findOne({ token: token, isActive: true, userId: decoded.userId });

    if (!session) {
      return res.status(401).json({ success: false, message: 'Session expired or invalid.', code: 'SESSION_EXPIRED' });
    }

    if (new Date() > session.expiresAt) {
      session.isActive = false;
      session.logoutReason = 'inactivity';
      await session.save();
      return res.status(401).json({ success: false, message: 'Session expired.', code: 'SESSION_EXPIRED' });
    }

    session.lastActivity = new Date();
    await session.save();

    await Device.findByIdAndUpdate(session.deviceId, { lastActivity: new Date() });

    let user = await models.User.findById(decoded.userId);
    if (!user) user = await models.Cashier.findById(decoded.userId);

    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    if (user.isActive === false || user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    req.user = user;
    req.session = session;
    req.deviceId = session.deviceId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Invalid token' });
    if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired' });
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// ==================== MIDDLEWARE - DB Connection ====================
const ensureDbConnection = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
      if (!emailTransporter) await initializeEmail();
    }
    next();
  } catch (error) {
    res.status(503).json({ success: false, message: 'Database temporarily unavailable' });
  }
};

app.use('/api', ensureDbConnection);

// ==================== MIDDLEWARE SETUP ====================
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use((req, res, next) => { res.removeHeader('X-Powered-By'); next(); });
app.use(compression());

// FIXED CORS - Allow all needed origins
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'https://pos-frontend-psi-teal.vercel.app'
    ];
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development' || origin.includes('vercel.app')) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

app.options('*', cors());

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { success: false, message: 'Too many requests' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { success: false, message: 'Too many authentication attempts' } });
const emailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: { success: false, message: 'Too many email requests' } });

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
  formatCurrency: (amount) => `KES ${CalculationUtils.safeNumber(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  calculateProfit: (revenue, cost) => CalculationUtils.safeNumber(revenue) - CalculationUtils.safeNumber(cost),
  calculateProfitMargin: (revenue, profit) => {
    const safeRevenue = CalculationUtils.safeNumber(revenue);
    return safeRevenue > 0 ? (CalculationUtils.safeNumber(profit) / safeRevenue) * 100 : 0;
  },
  calculateCOGS: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      const totalCost = CalculationUtils.safeNumber(transaction.cost);
      if (transaction.isCreditTransaction) {
        const totalAmount = CalculationUtils.safeNumber(transaction.totalAmount);
        const amountPaid = CalculationUtils.safeNumber(transaction.amountPaid);
        const paidRatio = totalAmount > 0 ? Math.min(amountPaid / totalAmount, 1) : 0;
        return sum + totalCost * paidRatio;
      }
      if (transaction.isCreditPayment) return sum;
      return sum + totalCost;
    }, 0);
  },
  calculateRevenue: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      if (transaction.isCreditPayment) return sum + CalculationUtils.safeNumber(transaction.totalAmount);
      if (transaction.isCreditTransaction) return sum + CalculationUtils.safeNumber(transaction.amountPaid);
      return sum + CalculationUtils.safeNumber(transaction.totalAmount);
    }, 0);
  },
  calculateCostFromItems: async (transaction, products = []) => {
    try {
      if (transaction.cost && CalculationUtils.safeNumber(transaction.cost) > 0) return CalculationUtils.safeNumber(transaction.cost);
      if (transaction.totalCost && CalculationUtils.safeNumber(transaction.totalCost) > 0) return CalculationUtils.safeNumber(transaction.totalCost);
      if (transaction.items && Array.isArray(transaction.items)) {
        let totalCost = 0;
        for (const item of transaction.items) {
          const quantity = CalculationUtils.safeNumber(item.quantity, 1);
          let itemCost = 0;
          if (item.cost && CalculationUtils.safeNumber(item.cost) > 0) itemCost = CalculationUtils.safeNumber(item.cost);
          else if (item.buyingPrice && CalculationUtils.safeNumber(item.buyingPrice) > 0) itemCost = CalculationUtils.safeNumber(item.buyingPrice);
          else if (item.productId && products.length > 0) {
            const product = products.find(p => p._id && item.productId && p._id.toString() === item.productId.toString());
            if (product) itemCost = CalculationUtils.safeNumber(product.buyingPrice);
          } else if (item.price && CalculationUtils.safeNumber(item.price) > 0) itemCost = CalculationUtils.safeNumber(item.price) * 0.3;
          totalCost += itemCost * quantity;
        }
        return totalCost;
      }
      return 0;
    } catch (error) { console.error('Error calculating cost:', error); return 0; }
  },
  processSingleTransaction: async (transaction, products = []) => {
    try {
      if (!transaction) return CalculationUtils.createFallbackTransaction();
      if (transaction.isCreditPayment) {
        return { ...transaction, totalAmount: CalculationUtils.safeNumber(transaction.totalAmount), cost: 0, profit: CalculationUtils.safeNumber(transaction.totalAmount), profitMargin: 100, isCreditTransaction: false, isCreditPayment: true, recognizedRevenue: CalculationUtils.safeNumber(transaction.totalAmount), outstandingRevenue: 0, amountPaid: CalculationUtils.safeNumber(transaction.totalAmount), immediateRevenue: CalculationUtils.safeNumber(transaction.totalAmount), creditStatus: null, itemsCount: 0, _isValid: true };
      }
      const isCredit = transaction.paymentMethod === 'credit' || transaction.isCreditTransaction === true || transaction.status === 'credit';
      const totalAmount = CalculationUtils.safeNumber(transaction.totalAmount) || 0;
      const fullCost = await CalculationUtils.calculateCostFromItems(transaction, products);
      let cumulativePaid = CalculationUtils.safeNumber(transaction.amountPaid) || 0;
      if (transaction.paymentHistory && Array.isArray(transaction.paymentHistory)) {
        const historyTotal = transaction.paymentHistory.reduce((sum, p) => sum + CalculationUtils.safeNumber(p.amount), 0);
        if (historyTotal > cumulativePaid) cumulativePaid = historyTotal;
      }
      const recognizedRevenue = isCredit ? Math.min(cumulativePaid, totalAmount) : totalAmount;
      const outstandingRevenue = isCredit ? Math.max(0, totalAmount - cumulativePaid) : 0;
      const immediateRevenue = isCredit ? CalculationUtils.safeNumber(transaction.upfrontPaymentAmount || cumulativePaid) : totalAmount;
      let cost = 0;
      if (isCredit) {
        const paidRatio = totalAmount > 0 ? Math.min(recognizedRevenue / totalAmount, 1) : 0;
        cost = fullCost * paidRatio;
      } else cost = fullCost;
      const profit = CalculationUtils.calculateProfit(recognizedRevenue, cost);
      const profitMargin = CalculationUtils.calculateProfitMargin(totalAmount, profit);
      const saleDate = transaction.saleDate || transaction.createdAt || transaction.date;
      const displayDate = transaction.displayDate || (saleDate ? new Date(saleDate).toLocaleString('en-KE') : 'Date Unknown');
      let creditStatus = 'completed';
      if (isCredit) {
        if (outstandingRevenue <= 0) creditStatus = 'paid';
        else if (cumulativePaid > 0) creditStatus = 'partially_paid';
        else creditStatus = 'pending';
        if (transaction.dueDate && new Date(transaction.dueDate) < new Date() && outstandingRevenue > 0) creditStatus = 'overdue';
      }
      return { ...transaction, totalAmount, cost, profit, profitMargin, isCreditTransaction: isCredit, recognizedRevenue, outstandingRevenue, amountPaid: cumulativePaid, immediateRevenue, creditStatus, itemsCount: transaction.items ? transaction.items.reduce((sum, item) => sum + CalculationUtils.safeNumber(item.quantity, 1), 0) : 0, displayDate, _processedAt: new Date().toISOString(), _isValid: true };
    } catch (error) { console.error('Error processing transaction:', error); return CalculationUtils.createFallbackTransaction(); }
  },
  createFallbackTransaction: () => ({ totalAmount: 0, cost: 0, profit: 0, profitMargin: 0, isCreditTransaction: false, recognizedRevenue: 0, outstandingRevenue: 0, amountPaid: 0, immediateRevenue: 0, creditStatus: 'completed', itemsCount: 0, displayDate: new Date().toLocaleString('en-KE'), _isValid: false }),
  processComprehensiveData: async (rawData, selectedShop) => {
    const transactions = rawData.transactions || [];
    const expenses = rawData.expenses || [];
    const credits = rawData.credits || [];
    const products = rawData.products || [];
    const shops = rawData.shops || [];
    const cashiers = rawData.cashiers || [];

    const salesWithProfit = await Promise.all(transactions.map(t => CalculationUtils.processSingleTransaction(t, products)));
    const filteredTransactions = selectedShop && selectedShop !== 'all' ? salesWithProfit.filter(t => t.shop === selectedShop || t.shopId === selectedShop) : salesWithProfit;

    const totalTransactions = filteredTransactions.length;
    const creditTransactions = filteredTransactions.filter(t => t.isCreditTransaction);
    const nonCreditTransactions = filteredTransactions.filter(t => !t.isCreditTransaction);
    const creditPayments = filteredTransactions.filter(t => t.isCreditPayment);

    const totalRevenue = CalculationUtils.calculateRevenue(filteredTransactions);
    const creditSalesTotal = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const nonCreditSalesTotal = nonCreditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const creditPaymentRevenue = creditPayments.reduce((sum, t) => sum + t.totalAmount, 0);
    const costOfGoodsSold = CalculationUtils.calculateCOGS(filteredTransactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    const totalExpenses = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    let totalCash = 0, totalMpesaBank = 0;
    filteredTransactions.forEach(t => {
      if (t.paymentSplit) { totalCash += CalculationUtils.safeNumber(t.paymentSplit.cash); totalMpesaBank += CalculationUtils.safeNumber(t.paymentSplit.bank_mpesa); }
      else {
        if (t.paymentMethod === 'cash') totalCash += CalculationUtils.safeNumber(t.immediateRevenue || t.recognizedRevenue);
        else if (['mpesa', 'bank', 'card'].includes(t.paymentMethod)) totalMpesaBank += CalculationUtils.safeNumber(t.immediateRevenue || t.recognizedRevenue);
        else if (t.paymentMethod === 'cash_bank_mpesa') {
          const half = CalculationUtils.safeNumber(t.immediateRevenue || t.recognizedRevenue) / 2;
          totalCash += half; totalMpesaBank += half;
        }
      }
    });

    const outstandingCredit = credits.filter(c => c.status !== 'paid' && (!selectedShop || selectedShop === 'all' || c.shop === selectedShop || c.shopId === selectedShop)).reduce((sum, c) => sum + CalculationUtils.safeNumber(c.balanceDue), 0);
    const totalCreditGiven = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const recognizedCreditRevenue = creditTransactions.reduce((sum, t) => sum + t.recognizedRevenue, 0);

    const financialStats = {
      totalSales: totalTransactions,
      creditSales: creditSalesTotal,
      nonCreditSales: nonCreditSalesTotal,
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
      immediateRevenue: filteredTransactions.reduce((sum, t) => sum + (t.immediateRevenue || 0), 0),
      creditSalesCount: creditTransactions.length,
      creditPaymentsCount: creditPayments.length,
      nonCreditSalesCount: nonCreditTransactions.length,
      completeTransactionsCount: nonCreditTransactions.length,
      recognizedCreditRevenue: recognizedCreditRevenue,
      profitMargin: CalculationUtils.calculateProfitMargin(totalRevenue, netProfit),
      creditCollectionRate: totalCreditGiven > 0 ? (recognizedCreditRevenue / totalCreditGiven) * 100 : 0,
      totalItemsSold: filteredTransactions.reduce((sum, t) => sum + t.itemsCount, 0),
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
      _cogsCalculation: 'prorated_based_on_payment',
      _calculatedAt: new Date().toISOString()
    };

    const topProducts = CalculationUtils.calculateTopProducts(filteredTransactions, 10);
    const shopPerformance = CalculationUtils.calculateShopPerformance(filteredTransactions, shops);

    return {
      salesWithProfit: filteredTransactions,
      financialStats,
      salesPerformanceSummary: financialStats,
      expenses, credits, products, shops, cashiers,
      performance: { topProducts, shopPerformance, topCashiers: shopPerformance.slice(0, 10) },
      summary: financialStats,
      enhancedStats: { salesWithProfit: filteredTransactions, financialStats },
      comprehensiveReport: { summary: financialStats, transactions: filteredTransactions, expenses, products, credits, shops, cashiers, performance: { topProducts, shopPerformance } },
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
        if (!productMap[productId]) productMap[productId] = { id: productId, name: productName, totalSold: 0, totalRevenue: 0, totalProfit: 0, totalCost: 0, transactions: 0 };
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
    return Object.values(productMap).map(p => ({ ...p, profitMargin: CalculationUtils.calculateProfitMargin(p.totalRevenue, p.totalProfit), averagePrice: p.totalSold > 0 ? p.totalRevenue / p.totalSold : 0 })).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit);
  },
  calculateShopPerformance: (transactions, shops) => {
    if (!Array.isArray(transactions)) return [];
    const shopMap = {};
    transactions.forEach(transaction => {
      const shopId = transaction.shop || transaction.shopId;
      if (!shopId) return;
      if (!shopMap[shopId]) {
        const shop = shops.find(s => s._id.toString() === shopId.toString()) || { name: 'Unknown Shop' };
        shopMap[shopId] = { id: shopId, name: shop.name, revenue: 0, transactions: 0, profit: 0, cost: 0, itemsSold: 0, immediateRevenue: 0 };
      }
      shopMap[shopId].revenue += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
      shopMap[shopId].transactions += 1;
      shopMap[shopId].profit += CalculationUtils.safeNumber(transaction.profit);
      shopMap[shopId].itemsSold += CalculationUtils.safeNumber(transaction.itemsCount);
    });
    return Object.values(shopMap).map(s => ({ ...s, profitMargin: CalculationUtils.calculateProfitMargin(s.revenue, s.profit) })).sort((a, b) => b.revenue - a.revenue);
  }
};

// ==================== TRANSACTION DATA FETCHING ====================
const getAllTransactionData = async (filters = {}) => {
  try {
    const { startDate, endDate, shopId, cashierId, paymentMethod, status } = filters;

    if (!models.Transaction) models = createModels();

    let filter = { status: { $in: ['completed', 'credit'] } };

    if (startDate && endDate) filter.saleDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }];

    const transactionProjection = {
      totalAmount: 1, cost: 1, profit: 1, profitMargin: 1,
      items: 1, itemsCount: 1, paymentMethod: 1,
      customerName: 1, cashierName: 1, cashierId: 1,
      shop: 1, shopId: 1, shopName: 1, saleDate: 1,
      status: 1, isCreditTransaction: 1, creditStatus: 1,
      recognizedRevenue: 1, outstandingRevenue: 1, amountPaid: 1,
      paymentSplit: 1, immediateRevenue: 1, upfrontPaymentAmount: 1,
      isCreditPayment: 1, createdAt: 1, paymentHistory: 1
    };

    const [transactions, shops, cashiers, products, expenses, credits] = await Promise.all([
      models.Transaction.find(filter, transactionProjection)
        .populate('shop', 'name location type')
        .populate('cashierId', 'name email')
        .populate('items.productId', 'name buyingPrice')
        .sort({ saleDate: -1 }).lean().maxTimeMS(30000),
      models.Shop.find({}, 'name location type').lean(),
      models.Cashier.find({}, 'name email shopId shopName').lean(),
      models.Product.find({}, 'name buyingPrice currentStock shop shopName').lean(),
      models.Expense.find(startDate && endDate ? { date: { $gte: new Date(startDate), $lte: new Date(endDate) } } : {}, 'description amount category date shop shopId shopName recordedBy').populate('shop', 'name').lean(),
      models.Credit.find(startDate && endDate ? { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } } : {}, 'transactionId customerName customerPhone totalAmount amountPaid balanceDue dueDate status shop shopId shopName cashierId cashierName upfrontPaymentAmount immediateRevenue paymentHistory').populate('transactionId', 'totalAmount saleDate').populate('shop', 'name location').populate('cashierId', 'name email').lean()
    ]);

    return await CalculationUtils.processComprehensiveData({ transactions, shops, cashiers, products, expenses, credits }, shopId);
  } catch (error) {
    console.error('❌ Error in getAllTransactionData:', error);
    throw error;
  }
};

// ==================== AUTH FUNCTIONS ====================
const generateSecureCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendSecureCodeEmail = async (email, code) => {
  try {
    if (!emailTransporter) {
      await initializeEmail();
      if (!emailTransporter) throw new Error('Email service not configured');
    }
    await emailTransporter.sendMail({
      from: `"${process.env.APP_NAME || 'Shop Management'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Secure Login Code',
      html: `<h2>Your Secure Code</h2><p>Your secure login code is: <strong style="font-size:32px;">${code}</strong></p><p>This code expires in 15 minutes.</p>`
    });
    return true;
  } catch (error) {
    console.error(`❌ Failed to send secure code to ${email}:`, error.message);
    throw new Error('Failed to send secure code.');
  }
};

const generateAuthToken = (userId, email, role) => {
  return jwt.sign(
    { userId: userId.toString(), email, role: role || 'cashier', timestamp: Date.now() },
    process.env.JWT_SECRET || 'fallback-secret-key-change-in-production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
};

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    app: process.env.APP_NAME || 'Pamela Management',
    version: process.env.APP_VERSION || '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    email: emailTransporter ? 'configured' : 'disabled',
    deviceVerification: 'enabled',
    sessionManagement: 'enabled',
    cogsCalculation: 'prorated_based_on_payment',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced',
    serverless: true,
    stockMonitoring: 'on-demand',
    modelsInitialized: modelsInitialized
  });
});

// ==================== AUTH ROUTES ====================

// Request secure code
app.post('/api/auth/request-code', [body('email').isEmail().normalizeEmail()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Invalid email', details: errors.array() });

    const { email } = req.body;
    const user = await models.User.findOne({ email }) || await models.Cashier.findOne({ email });

    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email' });

    const secureCode = generateSecureCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const hashedCode = await bcrypt.hash(secureCode, 10);

    await models.SecureCode.findOneAndUpdate(
      { email },
      { code: hashedCode, expiresAt, attempts: 0, used: false },
      { upsert: true, new: true }
    );

    if (!emailTransporter) {
      return res.json({ success: true, message: 'Secure code generated (email disabled)', developmentMode: true, secureCode, expiresIn: 15 });
    }

    try {
      await sendSecureCodeEmail(email, secureCode);
      res.json({ success: true, message: 'Secure code sent to your email', expiresIn: 15 });
    } catch (emailError) {
      await models.SecureCode.deleteOne({ email });
      res.status(500).json({ success: false, message: 'Failed to send secure code.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
});

// Verify secure code with device verification
app.post('/api/auth/verify-code', [body('email').isEmail().normalizeEmail(), body('code').isLength({ min: 6, max: 6 }).isNumeric()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid input' });

    const { email, code } = req.body;
    const secureCode = await models.SecureCode.findOne({ email });

    if (!secureCode) return res.status(404).json({ success: false, message: 'No secure code found. Request a new one.' });
    if (new Date() > secureCode.expiresAt) return res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
    if (secureCode.used) return res.status(400).json({ success: false, message: 'Code already used.' });
    if (secureCode.attempts >= 5) return res.status(400).json({ success: false, message: 'Too many attempts. Request a new code.' });

    const isValidCode = await bcrypt.compare(code, secureCode.code);
    if (!isValidCode) {
      secureCode.attempts += 1;
      await secureCode.save();
      return res.status(400).json({ success: false, message: 'Invalid code', attemptsRemaining: 5 - secureCode.attempts });
    }

    secureCode.used = true;
    await secureCode.save();

    let user = await models.User.findOne({ email }) || await models.Cashier.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.isActive === false) return res.status(403).json({ success: false, message: 'Account deactivated.' });

    const deviceInfo = getDeviceInfo(req);
    let device = await Device.findOne({ userId: user._id, deviceId: deviceInfo.deviceId });

    if (!device) {
      device = new Device({
        userId: user._id, deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName, deviceType: deviceInfo.deviceType,
        os: deviceInfo.os, osVersion: deviceInfo.osVersion,
        browser: deviceInfo.browser, browserVersion: deviceInfo.browserVersion,
        macAddress: deviceInfo.macAddress, ipAddress: deviceInfo.ipAddress,
        isVerified: user.role === 'admin',
        firstLogin: new Date(), lastLogin: new Date()
      });
      await device.save();

      if (user.role !== 'admin') {
        const requestToken = crypto.randomBytes(32).toString('hex');
        const verificationRequest = new VerificationRequest({
          userId: user._id, deviceId: device._id, requestToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          ipAddress: deviceInfo.ipAddress, userAgent: deviceInfo.userAgent
        });
        await verificationRequest.save();
        await sendDeviceVerificationEmail(user, device, verificationRequest);

        return res.status(403).json({
          success: false, requiresVerification: true,
          message: 'New device detected. Please wait for admin approval.',
          deviceInfo: { deviceName: device.deviceName, os: device.os, browser: device.browser, macAddress: device.macAddress }
        });
      }
    } else if (!device.isVerified) {
      const pendingRequest = await VerificationRequest.findOne({ deviceId: device._id, status: 'pending' });
      if (!pendingRequest) {
        const requestToken = crypto.randomBytes(32).toString('hex');
        const verificationRequest = new VerificationRequest({
          userId: user._id, deviceId: device._id, requestToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          ipAddress: deviceInfo.ipAddress, userAgent: deviceInfo.userAgent
        });
        await verificationRequest.save();
        await sendDeviceVerificationEmail(user, device, verificationRequest);
      }
      return res.status(403).json({ success: false, requiresVerification: true, message: 'Device pending verification.' });
    }

    device.lastLogin = new Date();
    device.loginCount = (device.loginCount || 0) + 1;
    await device.save();

    user.lastLogin = new Date();
    await user.save();

    const token = generateAuthToken(user._id, user.email, user.role || 'cashier');
    const session = new Session({
      userId: user._id, deviceId: device._id, token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      ipAddress: deviceInfo.ipAddress, userAgent: deviceInfo.userAgent
    });
    await session.save();

    const userData = { _id: user._id, name: user.name, email: user.email, role: user.role || 'cashier', lastLogin: user.lastLogin };
    if (user.role === 'cashier') { userData.shopId = user.shopId; userData.shopName = user.shopName; }

    return res.status(200).json({ success: true, user: userData, token, device: { id: device._id, deviceName: device.deviceName, os: device.os, browser: device.browser, isVerified: device.isVerified }, sessionId: session._id, message: 'Login successful', sessionTimeout: 5 });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// Update the cashier login response to include assigned shops
app.post('/api/auth/cashier/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password required' 
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
        // Handle admin login without cashier record
        if (user.role === 'admin') {
          cashier = { 
            _id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role, 
            status: 'active', 
            lastLogin: new Date(),
            shopId: null,
            shopName: null,
            assignedShops: []
          };
        } else {
          if (!user.password) {
            return res.status(401).json({ 
              success: false, 
              message: 'Invalid credentials.' 
            });
          }
          const isPasswordValid = user.password.startsWith('$2b$') 
            ? await bcrypt.compare(password, user.password) 
            : user.password === password;
          
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
            shopName: null,
            assignedShops: []
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

    // Get active assigned shops
    let assignedShops = [];
    if (cashier.assignedShops && cashier.assignedShops.length > 0) {
      // Populate shop details
      const assignedShopIds = cashier.assignedShops
        .filter(a => a.isActive !== false)
        .map(a => a.shopId);
      
      if (assignedShopIds.length > 0) {
        const shops = await models.Shop.find({
          _id: { $in: assignedShopIds },
          status: 'active'
        }).select('name location status type');
        
        assignedShops = shops.map(shop => ({
          shopId: shop._id,
          name: shop.name,
          location: shop.location,
          status: shop.status,
          type: shop.type,
          isPrimary: cashier.shopId && cashier.shopId.toString() === shop._id.toString()
        }));
      }
    }

    // If no assigned shops but has primary shop, add it
    if (assignedShops.length === 0 && cashier.shopId) {
      const shop = await models.Shop.findById(cashier.shopId).select('name location status type');
      if (shop) {
        assignedShops.push({
          shopId: shop._id,
          name: shop.name,
          location: shop.location,
          status: shop.status,
          type: shop.type,
          isPrimary: true
        });
      }
    }

    const token = generateAuthToken(cashier._id, cashier.email, cashier.role || 'cashier');
    
    const userData = {
      _id: cashier._id,
      name: cashier.name,
      email: cashier.email,
      role: cashier.role || 'cashier',
      status: cashier.status || 'active',
      lastLogin: cashier.lastLogin,
      primaryShop: cashier.shopId ? {
        shopId: cashier.shopId._id || cashier.shopId,
        shopName: cashier.shopId.name || cashier.shopName
      } : null,
      assignedShops: assignedShops,
      shopCount: assignedShops.length,
      canAccessMultipleShops: assignedShops.length > 1
    };

    // Update last login
    await models.Cashier.findByIdAndUpdate(cashier._id, { 
      lastLogin: new Date() 
    });

    res.json({ 
      success: true, 
      user: userData, 
      token, 
      message: 'Login successful',
      assignedShops: assignedShops
    });
  } catch (error) {
    console.error('Cashier login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login.' 
    });
  }
});
// Check device
app.post('/api/auth/check-device', async (req, res) => {
  try {
    const { email, deviceInfo } = req.body;
    let user = await models.User.findOne({ email }) || await models.Cashier.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let device = await Device.findOne({ userId: user._id, deviceId: deviceInfo.deviceId });

    if (device) {
      if (!device.isVerified) {
        const pendingRequest = await VerificationRequest.findOne({ deviceId: device._id, status: 'pending' });
        if (!pendingRequest) {
          const requestToken = crypto.randomBytes(32).toString('hex');
          const newRequest = new VerificationRequest({
            userId: user._id, deviceId: device._id, requestToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            ipAddress: deviceInfo.ipAddress || 'unknown', userAgent: deviceInfo.userAgent || 'unknown'
          });
          await newRequest.save();
          await sendDeviceVerificationEmail(user, device, newRequest);
        }
        return res.json({ success: false, requiresVerification: true, message: 'Device pending verification.', deviceInfo: { deviceName: device.deviceName, os: device.os, browser: device.browser, macAddress: device.macAddress } });
      }
      device.lastLogin = new Date();
      device.loginCount = (device.loginCount || 0) + 1;
      await device.save();
      return res.json({ success: true, message: 'Device verified', device: { id: device._id, deviceName: device.deviceName, isVerified: device.isVerified } });
    }

    const newDevice = new Device({
      userId: user._id, deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName, deviceType: deviceInfo.deviceType,
      os: deviceInfo.os, osVersion: deviceInfo.osVersion,
      browser: deviceInfo.browser, browserVersion: deviceInfo.browserVersion,
      macAddress: deviceInfo.macAddress, ipAddress: deviceInfo.ipAddress,
      isVerified: false, firstLogin: new Date(), lastLogin: new Date()
    });
    await newDevice.save();

    const requestToken = crypto.randomBytes(32).toString('hex');
    const verificationRequest = new VerificationRequest({
      userId: user._id, deviceId: newDevice._id, requestToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      ipAddress: deviceInfo.ipAddress || 'unknown', userAgent: deviceInfo.userAgent || 'unknown'
    });
    await verificationRequest.save();
    await sendDeviceVerificationEmail(user, newDevice, verificationRequest);

    return res.json({ success: false, requiresVerification: true, message: 'New device detected. Please wait for admin approval.', deviceInfo: { deviceName: newDevice.deviceName, os: newDevice.os, browser: newDevice.browser, macAddress: newDevice.macAddress } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to check device.' });
  }
});

// ==================== SESSION MANAGEMENT ====================
// server.js - Add this endpoint if not present

// Refresh session endpoint
app.post('/api/auth/refresh-session', authMiddleware, async (req, res) => {
  try {
    // Extend session expiry
    const newExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 more minutes
    req.session.expiresAt = newExpiry;
    await req.session.save();
    
    // Update device last activity
    if (req.deviceId) {
      await Device.findByIdAndUpdate(req.deviceId, { 
        lastActivity: new Date() 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Session refreshed successfully',
      expiresAt: newExpiry,
      timeRemaining: 300 // 5 minutes in seconds
    });
  } catch (error) {
    console.error('Session refresh error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to refresh session' 
    });
  }
});
app.post('/api/auth/refresh-session', authMiddleware, async (req, res) => {
  res.json({ success: true, message: 'Session refreshed', expiresAt: req.session.expiresAt });
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  req.session.isActive = false;
  req.session.logoutReason = 'manual';
  await req.session.save();
  res.json({ success: true, message: 'Logged out successfully' });
});

// ==================== ADMIN DEVICE VERIFICATION ====================
app.get('/api/admin/verification-requests', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    const requests = await VerificationRequest.find({ status: 'pending' }).populate('userId', 'name email role').populate('deviceId').sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch verification requests' });
  }
});

app.post('/api/admin/verify-device', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin access required' });
    const { requestId, action, rejectionReason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });

    const verificationRequest = await VerificationRequest.findById(requestId).populate('userId').populate('deviceId');
    if (!verificationRequest) return res.status(404).json({ success: false, message: 'Request not found' });
    if (verificationRequest.status !== 'pending') return res.status(400).json({ success: false, message: `Request already ${verificationRequest.status}` });

    if (action === 'approve') {
      verificationRequest.status = 'approved';
      verificationRequest.approvedBy = req.user._id;
      verificationRequest.approvedAt = new Date();
      await Device.findByIdAndUpdate(verificationRequest.deviceId, { isVerified: true });
      await sendDeviceApprovedEmail(verificationRequest.userId, verificationRequest.deviceId);
    } else {
      verificationRequest.status = 'rejected';
      verificationRequest.approvedBy = req.user._id;
      verificationRequest.approvedAt = new Date();
      verificationRequest.rejectionReason = rejectionReason || 'No reason provided';
      await sendDeviceRejectedEmail(verificationRequest.userId, verificationRequest.deviceId, rejectionReason);
    }
    await verificationRequest.save();

    res.json({ success: true, message: `Device ${action}d successfully`, data: verificationRequest });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to verify device' });
  }
});

// ==================== PRODUCT ROUTES ====================
app.get('/api/products', async (req, res) => {
  try {
    if (!models.Product) models = createModels();
    const products = await models.Product.find({ isActive: true }).populate('shop', 'name location type').sort({ createdAt: -1 });
    res.json({ success: true, data: products, count: products.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const productData = req.body;
    if (productData.shop) {
      const shop = await models.Shop.findById(productData.shop);
      if (shop) { productData.shopName = shop.name; productData.shopId = shop._id; }
    }
    const product = new models.Product(productData);
    await product.save();
    await product.populate('shop', 'name location type');
    res.status(201).json({ success: true, data: product, message: 'Product created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const oldProduct = await models.Product.findById(id);
    const product = await models.Product.findByIdAndUpdate(id, { ...updateData, updatedAt: new Date() }, { new: true, runValidators: true }).populate('shop', 'name location type');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const oldStock = oldProduct?.currentStock || 0;
    const newStock = product.currentStock || 0;
    const minStock = product.minStockLevel || 5;
    if (newStock === 0 || (oldStock > minStock && newStock <= minStock)) {
      const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';
      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      if (!product.lastStockAlertSent || new Date(product.lastStockAlertSent) < sixHoursAgo) {
        await sendStockAlertEmail([{ ...product.toObject(), shopName: product.shop?.name || product.shopName || 'Unknown Shop' }], alertType);
        product.lastStockAlertSent = now;
        await product.save();
      }
    }
    res.json({ success: true, data: product, message: 'Product updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await models.Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
});

// ==================== SHOP ROUTES ====================
app.get('/api/shops', async (req, res) => {
  try {
    if (!models.Shop) models = createModels();
    const shops = await models.Shop.find().sort({ createdAt: -1 });
    res.json({ success: true, data: shops, count: shops.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch shops', error: error.message });
  }
});

app.post('/api/shops', async (req, res) => {
  try {
    const shop = new models.Shop(req.body);
    await shop.save();
    res.status(201).json({ success: true, data: shop, message: 'Shop created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create shop', error: error.message });
  }
});

app.put('/api/shops/:id', async (req, res) => {
  try {
    const shop = await models.Shop.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true, runValidators: true });
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
    res.json({ success: true, data: shop, message: 'Shop updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update shop', error: error.message });
  }
});

app.delete('/api/shops/:id', async (req, res) => {
  try {
    const shop = await models.Shop.findByIdAndDelete(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found' });
    res.json({ success: true, message: 'Shop deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete shop', error: error.message });
  }
});

// ==================== CASHIER SHOP ASSIGNMENT ROUTES ====================

// Get cashiers with their assigned shops
app.get('/api/cashiers', async (req, res) => {
  try {
    const cashiers = await models.Cashier.find()
      .populate('shopId', 'name location status')
      .populate('assignedShops.shopId', 'name location status')
      .sort({ createdAt: -1 });
    
    // Enhance response with assigned shops info
    const enhancedCashiers = cashiers.map(cashier => {
      const cashierObj = cashier.toObject();
      
      // Get active assigned shops
      const activeAssignedShops = (cashierObj.assignedShops || [])
        .filter(assigned => assigned.isActive !== false)
        .map(assigned => ({
          shopId: assigned.shopId?._id || assigned.shopId,
          shopName: assigned.shopId?.name || assigned.shopName,
          shopLocation: assigned.shopId?.location,
          shopStatus: assigned.shopId?.status,
          assignedAt: assigned.assignedAt
        }));
      
      return {
        ...cashierObj,
        activeAssignedShops,
        assignedShopCount: activeAssignedShops.length,
        // Include legacy shop for backward compatibility
        primaryShop: cashierObj.shopId ? {
          shopId: cashierObj.shopId._id || cashierObj.shopId,
          shopName: cashierObj.shopId?.name || cashierObj.shopName
        } : null
      };
    });
    
    res.json({ 
      success: true, 
      data: enhancedCashiers, 
      count: enhancedCashiers.length 
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

// Assign shops to a cashier (admin only)
app.post('/api/cashiers/:id/assign-shops', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required to assign shops' 
      });
    }

    const { id } = req.params;
    const { shopIds, action, notes } = req.body;
    
    if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one shop ID is required' 
      });
    }

    const cashier = await models.Cashier.findById(id);
    if (!cashier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cashier not found' 
      });
    }

    // Verify shops exist
    const shops = await models.Shop.find({ 
      _id: { $in: shopIds },
      status: 'active' 
    });
    
    if (shops.length !== shopIds.length) {
      const foundIds = shops.map(s => s._id.toString());
      const missingIds = shopIds.filter(id => !foundIds.includes(id));
      return res.status(400).json({ 
        success: false, 
        message: `Some shops not found or inactive: ${missingIds.join(', ')}` 
      });
    }

    // Initialize assignedShops array if not exists
    if (!cashier.assignedShops) {
      cashier.assignedShops = [];
    }

    // Initialize history if not exists
    if (!cashier.shopAssignmentHistory) {
      cashier.shopAssignmentHistory = [];
    }

    const adminName = req.user.name || 'Admin';
    const adminId = req.user._id;

    // For each shop, either assign or remove
    for (const shopId of shopIds) {
      const shop = shops.find(s => s._id.toString() === shopId);
      
      if (action === 'assign') {
        // Check if already assigned
        const existingAssignment = cashier.assignedShops.find(
          a => a.shopId && a.shopId.toString() === shopId
        );
        
        if (!existingAssignment) {
          // Add new assignment
          cashier.assignedShops.push({
            shopId: shop._id,
            shopName: shop.name,
            assignedAt: new Date(),
            assignedBy: adminId,
            isActive: true
          });
          
          // Add to history
          cashier.shopAssignmentHistory.push({
            shopId: shop._id,
            shopName: shop.name,
            action: 'assigned',
            changedBy: adminId,
            changedByName: adminName,
            timestamp: new Date(),
            notes: notes || `Assigned to shop: ${shop.name}`
          });
        } else if (existingAssignment.isActive === false) {
          // Reactivate
          existingAssignment.isActive = true;
          existingAssignment.assignedAt = new Date();
          existingAssignment.assignedBy = adminId;
          
          cashier.shopAssignmentHistory.push({
            shopId: shop._id,
            shopName: shop.name,
            action: 'assigned',
            changedBy: adminId,
            changedByName: adminName,
            timestamp: new Date(),
            notes: notes || `Reactivated assignment to shop: ${shop.name}`
          });
        }
      } else if (action === 'remove') {
        // Deactivate assignment
        const assignment = cashier.assignedShops.find(
          a => a.shopId && a.shopId.toString() === shopId
        );
        if (assignment) {
          assignment.isActive = false;
          
          cashier.shopAssignmentHistory.push({
            shopId: shop._id,
            shopName: shop.name,
            action: 'removed',
            changedBy: adminId,
            changedByName: adminName,
            timestamp: new Date(),
            notes: notes || `Removed from shop: ${shop.name}`
          });
        }
      }
    }

    // If only one shop assigned and no primary shop set, set it as primary
    const activeShops = cashier.assignedShops.filter(a => a.isActive !== false);
    if (activeShops.length === 1 && !cashier.shopId) {
      cashier.shopId = activeShops[0].shopId;
      cashier.shopName = activeShops[0].shopName;
    }

    cashier.updatedAt = new Date();
    await cashier.save();

    const updatedCashier = await models.Cashier.findById(id)
      .populate('shopId', 'name location')
      .populate('assignedShops.shopId', 'name location status');

    res.json({ 
      success: true, 
      data: updatedCashier, 
      message: `Shops ${action === 'assign' ? 'assigned to' : 'removed from'} cashier successfully` 
    });
  } catch (error) {
    console.error('Error assigning shops:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to assign shops', 
      error: error.message 
    });
  }
});

// Get shops assigned to a specific cashier
app.get('/api/cashiers/:id/shops', async (req, res) => {
  try {
    const { id } = req.params;
    const cashier = await models.Cashier.findById(id)
      .populate('assignedShops.shopId', 'name location status type')
      .populate('shopId', 'name location');

    if (!cashier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cashier not found' 
      });
    }

    // Get active assigned shops
    const assignedShops = (cashier.assignedShops || [])
      .filter(a => a.isActive !== false)
      .map(a => ({
        shopId: a.shopId?._id || a.shopId,
        shopName: a.shopId?.name || a.shopName,
        shopLocation: a.shopId?.location,
        shopStatus: a.shopId?.status,
        shopType: a.shopId?.type,
        assignedAt: a.assignedAt,
        isPrimary: cashier.shopId && cashier.shopId._id.toString() === (a.shopId?._id || a.shopId).toString()
      }));

    res.json({ 
      success: true, 
      data: {
        cashier: {
          id: cashier._id,
          name: cashier.name,
          email: cashier.email
        },
        assignedShops,
        primaryShop: cashier.shopId ? {
          shopId: cashier.shopId._id,
          shopName: cashier.shopId.name,
          shopLocation: cashier.shopId.location
        } : null,
        totalShops: assignedShops.length
      }
    });
  } catch (error) {
    console.error('Error fetching cashier shops:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch cashier shops', 
      error: error.message 
    });
  }
});

// Set primary shop for a cashier
app.put('/api/cashiers/:id/primary-shop', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const { id } = req.params;
    const { shopId } = req.body;

    if (!shopId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Shop ID is required' 
      });
    }

    const cashier = await models.Cashier.findById(id);
    if (!cashier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cashier not found' 
      });
    }

    // Verify shop exists and is assigned to cashier
    const isAssigned = (cashier.assignedShops || []).some(
      a => a.shopId && a.shopId.toString() === shopId && a.isActive !== false
    );

    if (!isAssigned) {
      return res.status(400).json({ 
        success: false, 
        message: 'Shop is not assigned to this cashier' 
      });
    }

    const shop = await models.Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ 
        success: false, 
        message: 'Shop not found' 
      });
    }

    // Update primary shop
    cashier.shopId = shop._id;
    cashier.shopName = shop.name;
    cashier.updatedAt = new Date();

    // Add to history
    if (!cashier.shopAssignmentHistory) {
      cashier.shopAssignmentHistory = [];
    }
    cashier.shopAssignmentHistory.push({
      shopId: shop._id,
      shopName: shop.name,
      action: 'changed',
      changedBy: req.user._id,
      changedByName: req.user.name || 'Admin',
      timestamp: new Date(),
      notes: `Primary shop set to: ${shop.name}`
    });

    await cashier.save();

    res.json({ 
      success: true, 
      data: {
        primaryShop: {
          shopId: shop._id,
          shopName: shop.name,
          shopLocation: shop.location
        }
      },
      message: `Primary shop updated to ${shop.name}` 
    });
  } catch (error) {
    console.error('Error setting primary shop:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to set primary shop', 
      error: error.message 
    });
  }
});

// Get all shops with assignment status for a cashier
app.get('/api/cashiers/:id/available-shops', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const [cashier, allShops] = await Promise.all([
      models.Cashier.findById(id),
      models.Shop.find({ status: 'active' }).select('name location status type')
    ]);

    if (!cashier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cashier not found' 
      });
    }

    // Get assigned shop IDs
    const assignedShopIds = (cashier.assignedShops || [])
      .filter(a => a.isActive !== false)
      .map(a => a.shopId.toString());

    // Map shops with assignment status
    const shopsWithStatus = allShops.map(shop => ({
      ...shop.toObject(),
      isAssigned: assignedShopIds.includes(shop._id.toString()),
      isPrimary: cashier.shopId && cashier.shopId.toString() === shop._id.toString()
    }));

    res.json({ 
      success: true, 
      data: {
        cashier: {
          id: cashier._id,
          name: cashier.name,
          email: cashier.email
        },
        shops: shopsWithStatus,
        assignedCount: assignedShopIds.length,
        totalShops: allShops.length
      }
    });
  } catch (error) {
    console.error('Error fetching available shops:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch available shops', 
      error: error.message 
    });
  }
});

// ==================== EXPENSE ROUTES ====================
app.get('/api/expenses', async (req, res) => {
  try {
    const { startDate, endDate, shopId, category } = req.query;
    let filter = {};
    if (startDate && endDate) filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }];
    if (category && category !== 'all') filter.category = category;
    const expenses = await models.Expense.find(filter).populate('shop', 'name location').sort({ date: -1 }).lean();
    res.json({ success: true, data: expenses, count: expenses.length, summary: { totalExpenses: expenses.length, totalAmount: expenses.reduce((sum, e) => sum + (e.amount || 0), 0), averageExpense: expenses.length > 0 ? expenses.reduce((sum, e) => sum + (e.amount || 0), 0) / expenses.length : 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch expenses', error: error.message });
  }
});

app.get('/api/expenses/stats', async (req, res) => {
  try {
    const { startDate, endDate, shopId } = req.query;
    let filter = {};
    if (startDate && endDate) filter.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }];
    const [expenses, byCategory, byPaymentMethod] = await Promise.all([
      models.Expense.find(filter).lean(),
      models.Expense.aggregate([{ $match: filter }, { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
      models.Expense.aggregate([{ $match: filter }, { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$amount' } } }])
    ]);
    res.json({ success: true, data: { overview: { totalExpenses: expenses.length, totalAmount: expenses.reduce((sum, e) => sum + (e.amount || 0), 0), averageExpense: expenses.length > 0 ? expenses.reduce((sum, e) => sum + (e.amount || 0), 0) / expenses.length : 0 }, byCategory, byPaymentMethod } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch expense statistics', error: error.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const expenseData = req.body;
    if (expenseData.shop) {
      const shop = await models.Shop.findById(expenseData.shop);
      if (shop) { expenseData.shopName = shop.name; expenseData.shopId = shop._id.toString(); }
      else return res.status(400).json({ success: false, message: 'Selected shop not found' });
    } else expenseData.shopName = 'No Shop Assigned';
    const expense = new models.Expense(expenseData);
    await expense.save();
    await expense.populate('shop', 'name location');
    res.status(201).json({ success: true, data: expense, message: 'Expense created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create expense', error: error.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const expense = await models.Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete expense', error: error.message });
  }
});

// ==================== CREDIT ROUTES ====================
app.get('/api/credits', async (req, res) => {
  try {
    const { shopId, status, cashierId, startDate, endDate } = req.query;
    let filter = {};
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }, { creditShopId: shopId }];
    if (status && status !== 'all') filter.status = status;
    if (cashierId && cashierId !== 'all') filter.cashierId = cashierId;
    if (startDate && endDate) filter.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    const credits = await models.Credit.find(filter).populate('transactionId').populate('shop', 'name location type').populate('cashierId', 'name email').sort({ dueDate: 1 }).lean();
    res.json({ success: true, data: credits, count: credits.length, summary: { totalCredits: credits.length, totalCreditAmount: credits.reduce((sum, c) => sum + (c.totalAmount || 0), 0), totalPaid: credits.reduce((sum, c) => sum + (c.amountPaid || 0), 0), totalOutstanding: credits.reduce((sum, c) => sum + (c.balanceDue || 0), 0), overdueCount: credits.filter(c => c.dueDate && new Date(c.dueDate) < new Date() && c.balanceDue > 0).length, totalUpfrontPayments: credits.reduce((sum, c) => sum + (c.upfrontPaymentAmount || 0), 0), totalImmediateRevenue: credits.reduce((sum, c) => sum + (c.immediateRevenue || 0), 0) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch credits', error: error.message });
  }
});

app.get('/api/credits/:id/payments', async (req, res) => {
  try {
    const credit = await models.Credit.findById(req.params.id);
    if (!credit) return res.status(404).json({ success: false, message: 'Credit not found' });
    res.json({ success: true, data: credit.paymentHistory || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payment history', error: error.message });
  }
});

app.post('/api/credits', async (req, res) => {
  try {
    const creditData = req.body;
    if (creditData.transactionId) {
      const existingCredit = await models.Credit.findOne({ transactionId: creditData.transactionId });
      if (existingCredit) return res.status(409).json({ success: false, message: 'Credit already exists', data: existingCredit });
      const transaction = await models.Transaction.findById(creditData.transactionId);
      if (transaction) {
        if (!creditData.shop) creditData.shop = transaction.shop;
        if (!creditData.shopId) creditData.shopId = transaction.shopId;
        if (!creditData.shopName) creditData.shopName = transaction.shopName;
        if (!creditData.cashierId) creditData.cashierId = transaction.cashierId;
        if (!creditData.cashierName) creditData.cashierName = transaction.cashierName;
        if (!creditData.upfrontPaymentAmount) creditData.upfrontPaymentAmount = transaction.upfrontPaymentAmount;
        if (!creditData.upfrontPaymentMethod) creditData.upfrontPaymentMethod = transaction.upfrontPaymentMethod;
        if (!creditData.immediateRevenue) creditData.immediateRevenue = transaction.immediateRevenue;
      }
    }
    if (!creditData.status) creditData.status = creditData.balanceDue > 0 ? 'pending' : 'paid';
    if (!creditData.dueDate) creditData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (!creditData.paymentHistory && creditData.amountPaid > 0) {
      creditData.paymentHistory = [{ amount: creditData.amountPaid, paymentDate: new Date(), paymentMethod: creditData.upfrontPaymentMethod || 'initial', recordedBy: creditData.recordedBy || 'System', cashierName: creditData.cashierName, notes: 'Initial upfront payment' }];
    }
    const credit = new models.Credit(creditData);
    await credit.save();
    await credit.populate('transactionId');
    await credit.populate('shop', 'name location type');
    await credit.populate('cashierId', 'name email');
    res.status(201).json({ success: true, data: credit, message: 'Credit record created successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create credit record', error: error.message });
  }
});

// ==================== TRANSACTION ROUTES ====================
// Combined transactions endpoint (main one used by frontend)
app.get('/api/transactions/combined', async (req, res) => {
  try {
    const { startDate, endDate, shopId, cashierId, paymentMethod, dataType = 'all' } = req.query;
    console.log('🚀 Fetching combined transactions:', { startDate, endDate, shopId, cashierId, paymentMethod });

    let filter = {};
    if (startDate && endDate) filter.saleDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }];
    if (cashierId && cashierId !== 'all') filter.cashierId = cashierId;
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;

    const [transactions, shops, cashiers, products, expenses, credits] = await Promise.all([
      models.Transaction.find(filter).populate('shop', 'name location type').populate('cashierId', 'name email').populate('items.productId', 'name buyingPrice').sort({ saleDate: -1 }).lean(),
      models.Shop.find().lean(),
      models.Cashier.find().select('-password').lean(),
      models.Product.find().lean(),
      models.Expense.find().lean(),
      models.Credit.find().lean()
    ]);

    const salesWithProfit = transactions.map(t => {
      const totalCost = t.cost || 0;
      const totalProfit = t.profit || (t.totalAmount - totalCost);
      return {
        ...t, totalCost, totalProfit,
        profitMargin: t.profitMargin || (t.totalAmount > 0 ? (totalProfit / t.totalAmount) * 100 : 0),
        cost: totalCost, profit: totalProfit,
        saleDate: t.saleDate || t.createdAt,
        itemsCount: t.itemsCount || t.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0,
        items: (t.items || []).map(item => {
          const itemCost = (item.buyingPrice || 0) * (item.quantity || 1);
          const itemProfit = item.profit || (item.totalPrice - itemCost);
          return { ...item, productName: item.productName || 'Unknown Product', quantity: item.quantity || 1, price: item.price || 0, totalPrice: item.totalPrice || 0, cost: itemCost, profit: itemProfit, profitMargin: item.totalPrice > 0 ? (itemProfit / item.totalPrice) * 100 : 0 };
        })
      };
    });

    const totalRevenue = salesWithProfit.reduce((sum, t) => sum + (t.recognizedRevenue || t.totalAmount || 0), 0);
    const totalCost = salesWithProfit.reduce((sum, t) => sum + (t.cost || 0), 0);
    const totalProfit = totalRevenue - totalCost;
    const creditTransactions = salesWithProfit.filter(t => t.isCreditTransaction);
    const nonCreditTransactions = salesWithProfit.filter(t => !t.isCreditTransaction);
    const creditSales = creditTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const outstandingCredit = credits.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.balanceDue || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    let totalCash = 0, totalMpesaBank = 0;
    salesWithProfit.forEach(t => {
      if (t.paymentSplit) { totalCash += t.paymentSplit.cash || 0; totalMpesaBank += t.paymentSplit.bank_mpesa || 0; }
      else {
        if (t.paymentMethod === 'cash') totalCash += t.amountPaid || t.totalAmount || 0;
        else if (['mpesa', 'bank', 'card'].includes(t.paymentMethod)) totalMpesaBank += t.amountPaid || t.totalAmount || 0;
      }
    });

    const financialStats = {
      totalSales: salesWithProfit.length,
      creditSales,
      nonCreditSales: nonCreditTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0),
      totalRevenue,
      totalExpenses,
      grossProfit: totalProfit,
      netProfit: totalProfit - totalExpenses,
      costOfGoodsSold: totalCost,
      totalMpesaBank,
      totalCash,
      outstandingCredit,
      totalCreditGiven: creditSales,
      creditSalesCount: creditTransactions.length,
      nonCreditSalesCount: nonCreditTransactions.length,
      completeTransactionsCount: nonCreditTransactions.length,
      totalItemsSold: salesWithProfit.reduce((sum, t) => sum + (t.itemsCount || 0), 0),
      profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      creditCollectionRate: creditSales > 0 ? ((creditSales - outstandingCredit) / creditSales) * 100 : 0,
      _calculatedAt: new Date().toISOString()
    };

    const productMap = {};
    salesWithProfit.forEach(t => {
      t.items?.forEach(item => {
        const productId = item.productId?._id || item.productId;
        const key = productId ? productId.toString() : item.productName;
        if (!productMap[key]) productMap[key] = { id: productId, name: item.productName, totalSold: 0, totalRevenue: 0, totalProfit: 0 };
        const quantity = item.quantity || 1;
        const revenue = item.totalPrice || 0;
        productMap[key].totalSold += quantity;
        productMap[key].totalRevenue += revenue;
        productMap[key].totalProfit += revenue - ((item.buyingPrice || 0) * quantity);
      });
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10);

    const responseData = {
      salesWithProfit, financialStats, salesPerformanceSummary: financialStats,
      expenses, credits, products, shops, cashiers,
      performance: { topProducts },
      summary: financialStats,
      enhancedStats: { salesWithProfit, financialStats },
      comprehensiveReport: { summary: financialStats, transactions: salesWithProfit, expenses, products, credits, shops, cashiers, performance: { topProducts } },
      timestamp: new Date().toISOString(),
      cogsCalculation: 'prorated_based_on_payment',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled'
    };

    if (dataType === 'basic') return res.json({ success: true, data: { transactions: salesWithProfit, summary: financialStats }, processingTime: 0 });
    if (dataType === 'withCredits') return res.json({ success: true, data: { transactions: salesWithProfit, credits, summary: { ...financialStats, creditSummary: { totalCredits: credits.length, totalCreditAmount: creditSales, outstandingCredit, recognizedCreditRevenue: creditSales - outstandingCredit, immediateRevenue: totalRevenue } } }, processingTime: 0 });
    if (dataType === 'enhanced') return res.json({ success: true, data: { transactions: salesWithProfit, summary: financialStats, credits }, processingTime: 0 });

    res.json({ success: true, data: responseData, processingTime: 0, message: 'Combined transaction data fetched successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch combined transaction data', error: error.message });
  }
});

// Transaction metrics endpoint
app.get('/api/transactions/metrics', async (req, res) => {
  try {
    const { startDate, endDate, shopId, cashierId } = req.query;
    let filter = {};
    if (startDate && endDate) filter.saleDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }];
    if (cashierId && cashierId !== 'all') filter.cashierId = cashierId;

    const [transactions, expenses, credits] = await Promise.all([
      models.Transaction.find(filter).lean(),
      models.Expense.find().lean(),
      models.Credit.find().lean()
    ]);

    const totalTransactions = transactions.length;
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.recognizedRevenue || t.totalAmount || 0), 0);
    const creditTransactions = transactions.filter(t => t.isCreditTransaction);
    const nonCreditTransactions = transactions.filter(t => !t.isCreditTransaction);
    const creditSales = creditTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
    const nonCreditSales = nonCreditTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0);

    let totalCash = 0, totalMpesaBank = 0;
    transactions.forEach(t => {
      if (t.paymentSplit) { totalCash += t.paymentSplit.cash || 0; totalMpesaBank += t.paymentSplit.bank_mpesa || 0; }
      else {
        if (t.paymentMethod === 'cash') totalCash += t.immediateRevenue || t.amountPaid || t.totalAmount || 0;
        else if (['mpesa', 'bank', 'card'].includes(t.paymentMethod)) totalMpesaBank += t.immediateRevenue || t.amountPaid || t.totalAmount || 0;
      }
    });

    const totalCost = transactions.reduce((sum, t) => sum + (t.cost || 0), 0);
    const grossProfit = totalRevenue - totalCost;
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = grossProfit - totalExpenses;
    const outstandingCredit = credits.filter(c => c.status !== 'paid').reduce((sum, c) => sum + (c.balanceDue || 0), 0);

    const metrics = {
      totalSales: { amount: totalRevenue, count: totalTransactions, description: `${totalTransactions} transactions` },
      creditSales: { amount: creditSales, count: creditTransactions.length, description: `${creditTransactions.length} credit transactions` },
      nonCreditSales: { amount: nonCreditSales, count: nonCreditTransactions.length, description: `${nonCreditTransactions.length} complete transactions` },
      totalRevenue: { amount: totalRevenue, description: 'From credit & non-credit sales' },
      expenses: { amount: totalExpenses, description: 'Total operational costs' },
      grossProfit: { amount: grossProfit, description: 'Revenue - Cost of Goods' },
      netProfit: { amount: netProfit, description: 'After all expenses' },
      costOfGoodsSold: { amount: totalCost, description: 'For credit & non-credit sales' },
      totalMpesaBank: { amount: totalMpesaBank, description: 'Digital payments' },
      totalCash: { amount: totalCash, description: 'Cash payments' },
      outstandingCredit: { amount: outstandingCredit, description: 'Unpaid credit balance' },
      totalCreditGiven: { amount: creditSales, description: 'Total credit extended' }
    };

    res.json({ success: true, data: metrics, period: { startDate: startDate || 'All time', endDate: endDate || 'All time' }, message: 'Transaction metrics fetched successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch transaction metrics', error: error.message });
  }
});

// Get all transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const { startDate, endDate, shopId, cashierName, paymentMethod, status, page = 1, limit = 50 } = req.query;
    let filter = {};
    if (startDate && endDate) filter.saleDate = { $gte: new Date(startDate), $lte: new Date(endDate) };
    if (shopId && shopId !== 'all') filter.$or = [{ shop: shopId }, { shopId: shopId }];
    if (cashierName) filter.cashierName = { $regex: cashierName, $options: 'i' };
    if (paymentMethod && paymentMethod !== 'all') filter.paymentMethod = paymentMethod;
    if (status && status !== 'all') filter.status = status;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      models.Transaction.find(filter).populate('shop', 'name location').populate('cashierId', 'name email').populate('items.productId', 'name buyingPrice').sort({ saleDate: -1 }).skip(skip).limit(limitNum).lean(),
      models.Transaction.countDocuments(filter)
    ]);

    const enhancedTransactions = transactions.map(t => ({
      ...t,
      transactionNumber: t.transactionNumber || t._id.toString().substring(0, 8),
      cashierName: t.cashierName || 'Unknown Cashier',
      customerName: t.customerName || 'Walk-in Customer',
      totalCost: t.cost || 0,
      totalProfit: t.profit || (t.totalAmount - (t.cost || 0)),
      profitMargin: t.profitMargin || (t.totalAmount > 0 ? ((t.totalAmount - (t.cost || 0)) / t.totalAmount) * 100 : 0),
      saleDate: t.saleDate || t.createdAt,
      itemsCount: t.itemsCount || t.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0
    }));

    res.json({ success: true, data: enhancedTransactions, pagination: { current: pageNum, pageSize: limitNum, total, totalPages: Math.ceil(total / limitNum) }, summary: { totalTransactions: total, totalRevenue: enhancedTransactions.reduce((sum, t) => sum + (t.totalAmount || 0), 0) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
  }
});

// Create transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const transactionData = req.body;

    if (transactionData.transactionNumber) {
      const existing = await models.Transaction.findOne({ transactionNumber: transactionData.transactionNumber });
      if (existing) return res.status(409).json({ success: false, message: 'Transaction with this number already exists' });
    }

    if (transactionData.isCreditPayment && transactionData.originalCreditId) return await handleCreditPayment(transactionData, res);

    if (transactionData.shop) {
      const shop = await models.Shop.findById(transactionData.shop);
      if (shop) { transactionData.shopName = shop.name; transactionData.shopId = shop._id; }
    }

    const items = transactionData.items || [];
    let totalAmount = 0, totalCost = 0;

    const enhancedItems = await Promise.all(items.map(async (item) => {
      const quantity = CalculationUtils.safeNumber(item.quantity, 1);
      const price = CalculationUtils.safeNumber(item.price);
      const buyingPrice = CalculationUtils.safeNumber(item.buyingPrice);
      const itemTotalPrice = price * quantity;
      const itemCost = buyingPrice * quantity;
      const itemProfit = itemTotalPrice - itemCost;

      totalAmount += itemTotalPrice;
      totalCost += itemCost;

      if (item.productId && !transactionData.isCreditPayment) {
        try {
          const product = await models.Product.findById(item.productId);
          if (product) {
            const newStock = Math.max(0, (product.currentStock || 0) - quantity);
            await models.Product.findByIdAndUpdate(item.productId, { currentStock: newStock, updatedAt: new Date() });
            if (newStock === 0 || newStock <= (product.minStockLevel || 5)) {
              const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';
              await sendStockAlertEmail([{ ...product.toObject(), shopName: product.shopName || 'Unknown Shop' }], alertType);
            }
          }
        } catch (stockError) { console.error('Error reducing stock:', stockError); }
      }

      return { ...item, quantity, price, totalPrice: itemTotalPrice, buyingPrice, cost: itemCost, profit: itemProfit, profitMargin: itemTotalPrice > 0 ? (itemProfit / itemTotalPrice) * 100 : 0 };
    }));

    const amountPaidNow = CalculationUtils.safeNumber(transactionData.amountPaidNow) || 0;
    const isCreditTransaction = transactionData.paymentMethod === 'credit';
    let recognizedRevenue = totalAmount, outstandingRevenue = 0, amountPaid = totalAmount, creditStatus = 'completed', immediateRevenue = totalAmount;

    if (isCreditTransaction) {
      amountPaid = amountPaidNow;
      recognizedRevenue = amountPaidNow;
      outstandingRevenue = Math.max(0, totalAmount - amountPaidNow);
      immediateRevenue = amountPaidNow;
      if (outstandingRevenue <= 0) creditStatus = 'paid';
      else if (amountPaidNow > 0) creditStatus = 'partially_paid';
      else creditStatus = 'pending';
    }

    const profit = recognizedRevenue - totalCost;
    const profitMargin = recognizedRevenue > 0 ? (profit / recognizedRevenue) * 100 : 0;

    transactionData.totalAmount = totalAmount;
    transactionData.cost = totalCost;
    transactionData.profit = profit;
    transactionData.profitMargin = profitMargin;
    transactionData.itemsCount = items.reduce((sum, item) => sum + CalculationUtils.safeNumber(item.quantity, 1), 0);
    transactionData.items = enhancedItems;

    transactionData.paymentSplit = { cash: 0, bank_mpesa: 0, credit: 0 };

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
      transactionData.upfrontPaymentAmount = amountPaidNow;
      transactionData.upfrontPaymentMethod = transactionData.upfrontPaymentMethod || 'cash';

      if (amountPaidNow > 0) {
        if (transactionData.upfrontPaymentMethod === 'cash') transactionData.paymentSplit.cash = amountPaidNow;
        else if (transactionData.upfrontPaymentMethod === 'bank_mpesa') transactionData.paymentSplit.bank_mpesa = amountPaidNow;
        transactionData.paymentSplit.credit = outstandingRevenue;
      } else transactionData.paymentSplit.credit = totalAmount;

      if (!transactionData.dueDate) transactionData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      transactionData.isCreditTransaction = false;
      transactionData.recognizedRevenue = recognizedRevenue;
      transactionData.outstandingRevenue = 0;
      transactionData.amountPaid = amountPaid;
      transactionData.status = 'completed';
      transactionData.immediateRevenue = immediateRevenue;
      if (transactionData.paymentMethod === 'cash') transactionData.paymentSplit.cash = totalAmount;
      else if (['mpesa', 'bank', 'card'].includes(transactionData.paymentMethod)) transactionData.paymentSplit.bank_mpesa = totalAmount;
      else if (transactionData.paymentMethod === 'cash_bank_mpesa' && transactionData.paymentSplit) {
        transactionData.paymentSplit.cash = CalculationUtils.safeNumber(transactionData.paymentSplit.cash);
        transactionData.paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.paymentSplit.bank_mpesa);
      }
    }

    if (!transactionData.transactionNumber) transactionData.transactionNumber = `TXN-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 5)}`;

    const transaction = new models.Transaction(transactionData);
    await transaction.save();
    await transaction.populate('shop', 'name location type');
    await transaction.populate('cashierId', 'name email');

    if (isCreditTransaction && !transactionData.isCreditPayment) {
      const existingCredit = await models.Credit.findOne({ transactionId: transaction._id });
      if (!existingCredit) {
        const creditData = {
          transactionId: transaction._id,
          customerName: transactionData.customerName || 'Unknown Customer',
          customerPhone: transactionData.customerPhone,
          totalAmount, amountPaid: amountPaidNow, balanceDue: outstandingRevenue,
          dueDate: transactionData.dueDate, status: creditStatus,
          shop: transactionData.shop, shopId: transactionData.shopId, shopName: transactionData.shopName,
          creditShopName: transactionData.creditShopName || transactionData.shopName,
          creditShopId: transactionData.creditShopId || transactionData.shopId,
          shopClassification: transactionData.shopClassification || transactionData.shopName,
          cashierId: transactionData.cashierId, cashierName: transactionData.cashierName,
          upfrontPaymentAmount: amountPaidNow, upfrontPaymentMethod: transactionData.upfrontPaymentMethod || 'cash',
          immediateRevenue: amountPaidNow
        };
        if (amountPaidNow > 0) creditData.paymentHistory = [{ amount: amountPaidNow, paymentDate: new Date(), paymentMethod: transactionData.upfrontPaymentMethod || 'cash', recordedBy: transactionData.recordedBy || 'System', cashierName: transactionData.cashierName, notes: 'Initial upfront payment' }];
        await models.Credit.create(creditData);
      }
    }

    res.status(201).json({ success: true, data: transaction, message: `Transaction created successfully${isCreditTransaction ? ' with credit record' : ''}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create transaction', error: error.message });
  }
});

async function handleCreditPayment(transactionData, res) {
  try {
    const originalCredit = await models.Credit.findById(transactionData.originalCreditId).populate('transactionId');
    if (!originalCredit) return res.status(404).json({ success: false, message: 'Original credit record not found' });

    const paymentAmount = CalculationUtils.safeNumber(transactionData.totalAmount);
    const newAmountPaid = (originalCredit.amountPaid || 0) + paymentAmount;
    const newBalanceDue = Math.max(0, (originalCredit.totalAmount || 0) - newAmountPaid);

    originalCredit.amountPaid = newAmountPaid;
    originalCredit.balanceDue = newBalanceDue;
    originalCredit.status = newBalanceDue <= 0 ? 'paid' : newAmountPaid > 0 ? 'partially_paid' : originalCredit.status;
    originalCredit.paymentHistory.push({ amount: paymentAmount, paymentDate: new Date(), paymentMethod: transactionData.paymentMethod, recordedBy: transactionData.recordedBy || 'System', cashierName: transactionData.cashierName, notes: 'Credit payment' });
    await originalCredit.save();

    if (originalCredit.transactionId) {
      await models.Transaction.findByIdAndUpdate(originalCredit.transactionId, { amountPaid: newAmountPaid, recognizedRevenue: newAmountPaid, outstandingRevenue: newBalanceDue, creditStatus: originalCredit.status, updatedAt: new Date() });
    }

    const paymentSplit = { cash: 0, bank_mpesa: 0, credit: 0 };
    if (transactionData.paymentMethod === 'cash') paymentSplit.cash = paymentAmount;
    else if (['mpesa', 'bank', 'card'].includes(transactionData.paymentMethod)) paymentSplit.bank_mpesa = paymentAmount;

    const paymentTransaction = new models.Transaction({
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
      paymentSplit
    });
    await paymentTransaction.save();

    res.status(201).json({ success: true, data: { credit: originalCredit, paymentTransaction }, message: `Payment of ${CalculationUtils.formatCurrency(paymentAmount)} recorded. New balance: ${CalculationUtils.formatCurrency(newBalanceDue)}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to process credit payment', error: error.message });
  }
}

// ==================== STOCK ALERT ENDPOINTS ====================
app.post('/api/stock/check-now', async (req, res) => {
  try {
    const result = await checkStockLevels();
    res.json({ success: true, data: result, message: `Stock check completed: ${result.outOfStock} out, ${result.lowStock} low` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to check stock levels', error: error.message });
  }
});

app.get('/api/stock/alerts', async (req, res) => {
  try {
    const products = await models.Product.find({ isActive: true }).populate('shop', 'name location').lean();
    const outOfStock = products.filter(p => (p.currentStock || 0) === 0);
    const lowStock = products.filter(p => (p.currentStock || 0) > 0 && (p.currentStock || 0) <= (p.minStockLevel || 5));
    res.json({ success: true, data: { outOfStock: outOfStock.map(p => ({ ...p, shopName: p.shop?.name || p.shopName || 'Unknown', status: 'out_of_stock' })), lowStock: lowStock.map(p => ({ ...p, shopName: p.shop?.name || p.shopName || 'Unknown', status: 'low_stock' })), summary: { totalProducts: products.length, outOfStock: outOfStock.length, lowStock: lowStock.length } } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get stock alerts', error: error.message });
  }
});

// ==================== MANUAL DEVICE APPROVAL ====================
app.post('/api/admin/manual-approve-device', async (req, res) => {
  try {
    const { email, secretKey } = req.body;
    const validKey = process.env.MANUAL_APPROVAL_KEY || 'temp-key-change-me';
    if (!secretKey || secretKey !== validKey) return res.status(403).json({ success: false, message: 'Invalid key' });

    let user = await models.User.findOne({ email }) || await models.Cashier.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const result = await models.Device.updateMany({ userId: user._id, isVerified: false }, { $set: { isVerified: true, updatedAt: new Date() } });
    await models.VerificationRequest.deleteMany({ userId: user._id, status: 'pending' });

    res.json({ success: true, message: `Approved ${result.modifiedCount} device(s)`, data: { modifiedCount: result.modifiedCount } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to approve device', error: error.message });
  }
});

// ==================== DEBUG ENDPOINTS ====================
app.get('/api/debug/database', async (req, res) => {
  try {
    const counts = {
      products: await models.Product.countDocuments(),
      shops: await models.Shop.countDocuments(),
      cashiers: await models.Cashier.countDocuments(),
      expenses: await models.Expense.countDocuments(),
      transactions: await models.Transaction.countDocuments(),
      credits: await models.Credit.countDocuments()
    };
    res.json({ success: true, counts, database: mongoose.connection.name, status: 'connected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database check failed', error: error.message });
  }
});

app.get('/api/debug/test-email', async (req, res) => {
  try {
    if (!emailTransporter) await initializeEmail();
    if (!emailTransporter) return res.status(500).json({ success: false, message: 'Email not configured' });
    const testEmail = req.body.email || process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com';
    await emailTransporter.sendMail({ from: `"Test" <${process.env.EMAIL_USER}>`, to: testEmail, subject: 'Test Email', html: '<h1>Test</h1><p>Email works!</p>' });
    res.json({ success: true, message: 'Test email sent', sentTo: testEmail });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Test email failed', error: error.message });
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
      stockCheck: '/api/stock/check-now',
      stockAlerts: '/api/stock/alerts'
    }
  });
});

// ==================== 404 HANDLER ====================
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// ==================== SERVERLESS EXPORT ====================
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

initializeServer();

module.exports = app;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, async () => {
    await connectDB();
    await initializeEmail();
    console.log(`\n🎉 Server Running on Port ${PORT}`);
    console.log('='.repeat(60));
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log('='.repeat(60));
  });
}