// server.js - Complete with Device Verification, Session Management & Secure Code Auth
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

// Initialize models immediately (before connection)
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

  // Register models immediately
  for (const [name, schema] of Object.entries(schemas)) {
    if (!mongoose.models[name]) {
      mongoose.model(name, schema);
      console.log(`✅ Registered model: ${name}`);
    }
  }

  // Create models object
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

// Device Schema - Track all devices that have logged in
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

// Session Schema - Track active sessions with inactivity
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

// Verification Request Schema - For new device approvals
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

// Login History Schema - Track all login attempts
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

// Register the new models
const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
const VerificationRequest = mongoose.models.VerificationRequest || mongoose.model('VerificationRequest', verificationRequestSchema);
const LoginHistory = mongoose.models.LoginHistory || mongoose.model('LoginHistory', loginHistorySchema);

// Add to models object for easy access
models.Device = Device;
models.Session = Session;
models.VerificationRequest = VerificationRequest;
models.LoginHistory = LoginHistory;

// ==================== STOCK MONITORING SYSTEM ====================

// Send stock alert email
const sendStockAlertEmail = async (products, alertType) => {
  if (!emailTransporter) {
    console.log('⚠️ Email service not configured - skipping stock alert');
    return false;
  }

  try {
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
          <h1 style="margin: 0;">
            ${alertType === 'out_of_stock' ? '🚨 PRODUCTS OUT OF STOCK' : '⚠️ PRODUCTS LOW IN STOCK'}
          </h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">
            ${process.env.APP_NAME || 'Shop Management System'} - Automated Alert
          </p>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <p>Dear Administrator,</p>
          <p>
            ${alertType === 'out_of_stock'
              ? `The following <strong>${products.length} products</strong> are currently <strong style="color: #ff4444;">OUT OF STOCK</strong>. Immediate attention is required to restock these items.`
              : `The following <strong>${products.length} products</strong> are running <strong style="color: #ff9800;">LOW IN STOCK</strong>. Please consider restocking soon.`
            }
          </p>
          <div style="margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; background: white;">
              <thead>
                <tr style="background: #333; color: white;">
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Product Name</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Category</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Current Stock</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Min Level</th>
                  <th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Shop</th>
                </tr>
              </thead>
              <tbody>
                ${productList}
              </tbody>
            </table>
          </div>
          <p>
            <strong>Action Required:</strong> Please log in to the system and update the stock levels for these products.
          </p>
          <div style="background: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3; margin: 20px 0;">
            <p style="margin: 0;">
              <strong>Note:</strong> This is an automated alert.
              ${alertType === 'out_of_stock'
                ? 'Reminders will be sent every 6 hours until stock is updated.'
                : 'You will receive notifications for critical stock levels.'
              }
            </p>
          </div>
          <p>
            Best regards,<br>
            <strong>${process.env.APP_NAME || 'Shop Management'} System</strong>
          </p>
        </div>
        <div style="background: #333; color: white; padding: 15px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">
            This email was automatically generated by the Inventory Management System.<br>
            Please do not reply to this message.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"Inventory Alert System" <${process.env.EMAIL_USER || 'ichigoeliud021@gmail.com'}>`,
      to: adminEmail,
      subject: subject,
      html: html,
      priority: 'high'
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`✅ ${alertType === 'out_of_stock' ? 'Out of stock' : 'Low stock'} alert sent for ${products.length} products`);
    return true;
  } catch (error) {
    console.error('❌ Error sending stock alert email:', error);
    return false;
  }
};

// Check stock levels and send alerts
const checkStockLevels = async () => {
  try {
    console.log('🔍 [STOCK MONITOR] Checking stock levels...');

    const products = await models.Product.find({ isActive: true })
      .populate('shop', 'name location')
      .lean();

    console.log(`📊 [STOCK MONITOR] Found ${products.length} active products`);

    const outOfStockProducts = [];
    const lowStockProducts = [];

    products.forEach(product => {
      const currentStock = product.currentStock || 0;
      const minStockLevel = product.minStockLevel || 5;

      if (currentStock === 0) {
        outOfStockProducts.push({
          ...product,
          shopName: product.shop?.name || product.shopName || 'Unknown Shop'
        });
      } else if (currentStock <= minStockLevel) {
        lowStockProducts.push({
          ...product,
          shopName: product.shop?.name || product.shopName || 'Unknown Shop'
        });
      }
    });

    console.log(`🚨 [STOCK MONITOR] Results: ${outOfStockProducts.length} out of stock, ${lowStockProducts.length} low stock`);

    // Send out of stock notifications
    if (outOfStockProducts.length > 0) {
      console.log(`📧 [STOCK MONITOR] Sending ${outOfStockProducts.length} out of stock alerts`);
      await sendStockAlertEmail(outOfStockProducts, 'out_of_stock');
    }

    // Send low stock notifications with rate limiting (6 hours)
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
        console.log(`📧 [STOCK MONITOR] Sending ${productsToAlert.length} low stock alerts (rate limited)`);
        await sendStockAlertEmail(productsToAlert, 'low_stock');
      } else {
        console.log(`⏰ [STOCK MONITOR] Skipping low stock alerts - rate limited (last 6 hours)`);
      }
    }

    return {
      outOfStock: outOfStockProducts.length,
      lowStock: lowStockProducts.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ [STOCK MONITOR] Error checking stock levels:', error);
    throw error;
  }
};

// ==================== SERVERLESS DATABASE CONNECTION ====================

const connectDB = async () => {
  try {
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
      bufferCommands: true,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 30000
    };

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

// ==================== DEVICE FINGERPRINTING UTILITIES ====================

const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;

  // Parse OS
  let os = 'Unknown';
  let osVersion = 'Unknown';
  let deviceType = 'unknown';
  let deviceName = 'Unknown Device';

  if (userAgent.includes('Windows NT 10.0')) {
    os = 'Windows 10';
    osVersion = '10.0';
    deviceType = 'desktop';
    deviceName = 'Windows PC';
  } else if (userAgent.includes('Windows NT 6.1')) {
    os = 'Windows 7';
    osVersion = '6.1';
    deviceType = 'desktop';
    deviceName = 'Windows PC';
  } else if (userAgent.includes('Windows NT 6.2')) {
    os = 'Windows 8';
    osVersion = '6.2';
    deviceType = 'desktop';
    deviceName = 'Windows PC';
  } else if (userAgent.includes('Windows NT 6.3')) {
    os = 'Windows 8.1';
    osVersion = '6.3';
    deviceType = 'desktop';
    deviceName = 'Windows PC';
  } else if (userAgent.includes('Mac OS X')) {
    os = 'macOS';
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    if (match) osVersion = match[1].replace('_', '.');
    deviceType = 'desktop';
    deviceName = 'Mac';
  } else if (userAgent.includes('iPhone')) {
    os = 'iOS';
    deviceType = 'mobile';
    deviceName = 'iPhone';
  } else if (userAgent.includes('iPad')) {
    os = 'iOS';
    deviceType = 'tablet';
    deviceName = 'iPad';
  } else if (userAgent.includes('Android')) {
    os = 'Android';
    deviceType = 'mobile';
    const match = userAgent.match(/Android (\d+[._]\d+)/);
    if (match) osVersion = match[1];
    deviceName = 'Android Device';
  } else if (userAgent.includes('Linux')) {
    os = 'Linux';
    deviceType = 'desktop';
    deviceName = 'Linux PC';
  }

  // Parse Browser
  let browser = 'Unknown';
  let browserVersion = 'Unknown';
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
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    browser = 'Opera';
    const match = userAgent.match(/Opera\/(\d+)/) || userAgent.match(/OPR\/(\d+)/);
    if (match) browserVersion = match[1];
  }

  // Generate MAC address from userAgent + IP
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

// ==================== AUTHENTICATION MIDDLEWARE ====================

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-in-production');

    const session = await Session.findOne({
      token: token,
      isActive: true,
      userId: decoded.userId
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session expired or invalid. Please login again.',
        code: 'SESSION_EXPIRED'
      });
    }

    if (new Date() > session.expiresAt) {
      session.isActive = false;
      session.logoutReason = 'inactivity';
      await session.save();
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please login again.',
        code: 'SESSION_EXPIRED'
      });
    }

    session.lastActivity = new Date();
    await session.save();

    await Device.findByIdAndUpdate(session.deviceId, {
      lastActivity: new Date()
    });

    let user = await models.User.findById(decoded.userId);
    if (!user) {
      user = await models.Cashier.findById(decoded.userId);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    if (user.isActive === false || user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    req.user = user;
    req.session = session;
    req.deviceId = session.deviceId;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    console.error('❌ Auth middleware error:', error);
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
};

// ==================== MIDDLEWARE - Database Connection ====================

const ensureDbConnection = async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.log('🔄 Connecting to database for request:', req.path);
      await connectDB();

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
  origin: ['https://pos-frontend-psi-teal.vercel.app', 'https://pos-frontend-psi-teal.vercel.app'],
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
      const totalCost = CalculationUtils.safeNumber(transaction.cost);

      if (transaction.isCreditTransaction) {
        const totalAmount = CalculationUtils.safeNumber(transaction.totalAmount);
        const amountPaid = CalculationUtils.safeNumber(transaction.amountPaid);
        const paidRatio = totalAmount > 0 ? Math.min(amountPaid / totalAmount, 1) : 0;
        return sum + totalCost * paidRatio;
      }

      if (transaction.isCreditPayment) {
        return sum;
      }

      return sum + totalCost;
    }, 0);
  },

  calculateRevenue: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
    return transactions.reduce((sum, transaction) => {
      if (transaction.isCreditPayment) {
        return sum + CalculationUtils.safeNumber(transaction.totalAmount);
      }

      if (transaction.isCreditTransaction) {
        return sum + CalculationUtils.safeNumber(transaction.amountPaid);
      }

      return sum + CalculationUtils.safeNumber(transaction.totalAmount);
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

      const fullCost = await CalculationUtils.calculateCostFromItems(transaction, products);

      let cumulativePaid = CalculationUtils.safeNumber(transaction.amountPaid) ||
                          CalculationUtils.safeNumber(transaction.paidAmount) || 0;

      if (transaction.paymentHistory && Array.isArray(transaction.paymentHistory)) {
        const historyTotal = transaction.paymentHistory.reduce((sum, p) =>
          sum + CalculationUtils.safeNumber(p.amount), 0);
        if (historyTotal > cumulativePaid) {
          cumulativePaid = historyTotal;
        }
      }

      const recognizedRevenue = isCredit ? Math.min(cumulativePaid, totalAmount) : totalAmount;
      const outstandingRevenue = isCredit ? Math.max(0, totalAmount - cumulativePaid) : 0;
      const immediateRevenue = isCredit ? CalculationUtils.safeNumber(transaction.upfrontPaymentAmount || cumulativePaid) : totalAmount;

      let cost = 0;
      if (isCredit) {
        const paidRatio = totalAmount > 0 ? Math.min(recognizedRevenue / totalAmount, 1) : 0;
        cost = fullCost * paidRatio;
      } else {
        cost = fullCost;
      }

      const profit = CalculationUtils.calculateProfit(recognizedRevenue, cost);
      const profitMargin = CalculationUtils.calculateProfitMargin(totalAmount, profit);

      const saleDate = transaction.saleDate || transaction.createdAt || transaction.date;
      const displayDate = transaction.displayDate ||
                         (saleDate ? new Date(saleDate).toLocaleString('en-KE') : 'Date Unknown');

      let creditStatus = 'completed';
      if (isCredit) {
        if (outstandingRevenue <= 0) {
          creditStatus = 'paid';
        } else if (cumulativePaid > 0) {
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
        amountPaid: cumulativePaid,
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
    const creditSalesTotal = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const nonCreditSalesTotal = nonCreditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const creditPaymentRevenue = creditPayments.reduce((sum, t) => sum + t.totalAmount, 0);
    const costOfGoodsSold = CalculationUtils.calculateCOGS(filteredTransactions);
    const grossProfit = totalRevenue - costOfGoodsSold;
    const totalExpenses = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;

    let totalCash = 0;
    let totalMpesaBank = 0;
    let totalCreditBalance = 0;

    filteredTransactions.forEach(transaction => {
      if (transaction.paymentSplit) {
        totalCash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        totalMpesaBank += CalculationUtils.safeNumber(transaction.paymentSplit.bank_mpesa);
        totalCreditBalance += CalculationUtils.safeNumber(transaction.paymentSplit.credit);
      } else {
        if (transaction.paymentMethod === 'cash') {
          totalCash += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transaction.paymentMethod)) {
          totalMpesaBank += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (transaction.paymentMethod === 'credit') {
          totalCreditBalance += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
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
      _cogsCalculation: 'prorated_based_on_payment',
      _revenueCalculation: 'cumulative_payments_for_credit',
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

    if (!models.Transaction) {
      console.log('⚠️ Models not ready, initializing...');
      models = createModels();
    }

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
      isCreditPayment: 1, createdAt: 1, paymentHistory: 1
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
      } : {}, 'transactionId customerName customerPhone totalAmount amountPaid balanceDue dueDate status shop shopId shopName cashierId cashierName upfrontPaymentAmount immediateRevenue paymentHistory')
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

// ==================== EMAIL NOTIFICATIONS ====================

const sendDeviceVerificationEmail = async (user, device, verificationRequest) => {
  try {
    console.log('📧 Attempting to send device verification email...');

    if (!emailTransporter) {
      console.error('❌ Email transporter not configured');
      return false;
    }

    const adminEmails = await models.User.find({ role: 'admin' }).select('email name');
    const emailList = adminEmails.map(a => a.email);

    if (emailList.length === 0) {
      console.log('ℹ️ No admin users found, using default admin email');
      emailList.push(process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com');
    }

    console.log(`📧 Sending verification email to ${emailList.length} admin(s)`);

    const frontendUrl = process.env.FRONTEND_URL || 'https://pos-frontend-psi-teal.vercel.app';
    const approveLink = `${frontendUrl}/admin/verify-device/${verificationRequest.requestToken}?action=approve`;
    const rejectLink = `${frontendUrl}/admin/verify-device/${verificationRequest.requestToken}?action=reject`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
        <div style="background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">🔐 New Device Verification Request</h1>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333;">Device Login Request</h2>
          <p>A user is trying to log in from a new device. Please verify this request.</p>

          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p><strong>👤 User:</strong> ${user.name} (${user.email})</p>
            <p><strong>🔑 Role:</strong> ${user.role || 'Cashier'}</p>
            <p><strong>💻 Device:</strong> ${device.deviceName}</p>
            <p><strong>🖥️ OS:</strong> ${device.os} ${device.osVersion || ''}</p>
            <p><strong>🌐 Browser:</strong> ${device.browser} ${device.browserVersion || ''}</p>
            <p><strong>📱 MAC Address:</strong> ${device.macAddress}</p>
            <p><strong>🌍 IP Address:</strong> ${device.ipAddress}</p>
            <p><strong>📅 Request Time:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>⏰ Expires:</strong> ${new Date(verificationRequest.expiresAt).toLocaleString()}</p>
          </div>

          <div style="margin: 20px 0; text-align: center;">
            <p style="font-weight: bold; font-size: 16px;">Click below to approve or reject this device:</p>
            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
              <a href="${approveLink}"
                 style="background: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; font-weight: bold;">
                ✅ Approve Device
              </a>
              <a href="${rejectLink}"
                 style="background: #EF4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px; font-weight: bold;">
                ❌ Reject Device
              </a>
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 10px;">
              Or go to the Admin Dashboard > Device Verification Requests
            </p>
          </div>

          <div style="background: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #92400E;">
              <strong>⚠️ Security Alert:</strong> If you didn't approve this login request, please investigate immediately.
            </p>
          </div>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #666;">
          <p>This is an automated security notification from ${process.env.APP_NAME || 'The Place Shop Management System'}.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    `;

    for (const adminEmail of emailList) {
      try {
        await emailTransporter.sendMail({
          from: `"${process.env.APP_NAME || 'Shop Management'} Security" <${process.env.EMAIL_USER}>`,
          to: adminEmail,
          subject: `🔐 New Device Login Request - ${user.name}`,
          html: html,
          priority: 'high'
        });
        console.log(`✅ Verification email sent to ${adminEmail}`);
      } catch (error) {
        console.error(`❌ Failed to send to ${adminEmail}:`, error.message);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Error in sendDeviceVerificationEmail:', error);
    return false;
  }
};

const sendDeviceApprovedEmail = async (user, device) => {
  try {
    if (!emailTransporter) return false;

    const frontendUrl = process.env.FRONTEND_URL || 'https://pos-frontend-psi-teal.vercel.app';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
        <div style="background: #10B981; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">✅ Device Approved</h1>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <p>Dear ${user.name},</p>
          <p>Your device has been <strong>approved</strong> for access to ${process.env.APP_NAME || 'The Place Shop Management System'}.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Device:</strong> ${device.deviceName}</p>
            <p><strong>OS:</strong> ${device.os} ${device.osVersion || ''}</p>
            <p><strong>Browser:</strong> ${device.browser} ${device.browserVersion || ''}</p>
            <p><strong>MAC Address:</strong> ${device.macAddress}</p>
          </div>
          <p>You can now log in from this device.</p>
          <p><a href="${frontendUrl}/login" style="background: #6366F1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Log In Now</a></p>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #666;">
          <p>This is an automated notification from ${process.env.APP_NAME || 'The Place Shop Management System'}.</p>
        </div>
      </div>
    `;

    await emailTransporter.sendMail({
      from: `"${process.env.APP_NAME || 'Shop Management'}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '✅ Device Approved for Login',
      html: html
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to send device approved email:', error);
    return false;
  }
};

const sendDeviceRejectedEmail = async (user, device, reason) => {
  try {
    if (!emailTransporter) return false;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
        <div style="background: #EF4444; padding: 20px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">❌ Device Rejected</h1>
        </div>
        <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <p>Dear ${user.name},</p>
          <p>Your device request has been <strong>rejected</strong> by an administrator.</p>
          <div style="background: #F3F4F6; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Device:</strong> ${device.deviceName}</p>
            <p><strong>OS:</strong> ${device.os} ${device.osVersion || ''}</p>
            <p><strong>Browser:</strong> ${device.browser} ${device.browserVersion || ''}</p>
          </div>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
          <div style="background: #FEF3C7; padding: 15px; border-left: 4px solid #F59E0B; margin: 15px 0; border-radius: 4px;">
            <p style="margin: 0; color: #92400E;">
              <strong>⚠️ Security Alert:</strong> If you didn't request this access, please contact your administrator immediately.
            </p>
          </div>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #666;">
          <p>This is an automated notification from ${process.env.APP_NAME || 'The Place Shop Management System'}.</p>
        </div>
      </div>
    `;

    await emailTransporter.sendMail({
      from: `"${process.env.APP_NAME || 'Shop Management'}" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '❌ Device Rejected for Login',
      html: html
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to send device rejected email:', error);
    return false;
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
    deviceVerification: 'enabled',
    sessionManagement: 'enabled',
    cogsCalculation: 'prorated_based_on_payment',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced',
    serverless: true,
    stockMonitoring: 'on-demand',
    modelsInitialized: modelsInitialized,
    modelsAvailable: Object.keys(models).join(', ')
  });
});

// ==================== STOCK MONITORING ENDPOINTS ====================

app.post('/api/stock/check-now', async (req, res) => {
  try {
    console.log('🔍 Manual stock check triggered');
    const result = await checkStockLevels();

    res.json({
      success: true,
      data: result,
      message: `Stock check completed: ${result.outOfStock} out of stock, ${result.lowStock} low stock`
    });
  } catch (error) {
    console.error('❌ Error in manual stock check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check stock levels',
      error: error.message
    });
  }
});

app.get('/api/stock/alerts', async (req, res) => {
  try {
    const products = await models.Product.find({ isActive: true })
      .populate('shop', 'name location')
      .lean();

    const outOfStockProducts = products.filter(p => (p.currentStock || 0) === 0);
    const lowStockProducts = products.filter(p => {
      const stock = p.currentStock || 0;
      const minStock = p.minStockLevel || 5;
      return stock > 0 && stock <= minStock;
    });

    res.json({
      success: true,
      data: {
        outOfStock: outOfStockProducts.map(p => ({
          ...p,
          shopName: p.shop?.name || p.shopName || 'Unknown Shop',
          status: 'out_of_stock'
        })),
        lowStock: lowStockProducts.map(p => ({
          ...p,
          shopName: p.shop?.name || p.shopName || 'Unknown Shop',
          status: 'low_stock'
        })),
        summary: {
          totalProducts: products.length,
          outOfStock: outOfStockProducts.length,
          lowStock: lowStockProducts.length,
          inStock: products.length - outOfStockProducts.length - lowStockProducts.length
        }
      }
    });
  } catch (error) {
    console.error('Error getting stock alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stock alerts',
      error: error.message
    });
  }
});

// ==================== AUTHENTICATION ROUTES ====================

// Request secure code
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

// Verify secure code - With Device Verification
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

      // Find user
      let user = await models.User.findOne({ email });
      if (!user) {
        user = await models.Cashier.findOne({ email });
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

      // Get device info
      const deviceInfo = getDeviceInfo(req);

      // Check if device exists and is verified
      let device = await Device.findOne({
        userId: user._id,
        deviceId: deviceInfo.deviceId
      });

      if (!device) {
        // New device - create and require verification (auto-verify admin)
        device = new Device({
          userId: user._id,
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName,
          deviceType: deviceInfo.deviceType,
          os: deviceInfo.os,
          osVersion: deviceInfo.osVersion,
          browser: deviceInfo.browser,
          browserVersion: deviceInfo.browserVersion,
          macAddress: deviceInfo.macAddress,
          ipAddress: deviceInfo.ipAddress,
          isVerified: user.role === 'admin',
          firstLogin: new Date(),
          lastLogin: new Date()
        });
        await device.save();

        if (user.role !== 'admin') {
          const requestToken = crypto.randomBytes(32).toString('hex');
          const verificationRequest = new VerificationRequest({
            userId: user._id,
            deviceId: device._id,
            requestToken: requestToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          await verificationRequest.save();

          await sendDeviceVerificationEmail(user, device, verificationRequest);

          return res.status(403).json({
            success: false,
            requiresVerification: true,
            message: 'New device detected. Please wait for admin approval.',
            deviceInfo: {
              deviceName: device.deviceName,
              os: device.os,
              browser: device.browser,
              macAddress: device.macAddress
            }
          });
        }
      } else if (!device.isVerified) {
        const pendingRequest = await VerificationRequest.findOne({
          deviceId: device._id,
          status: 'pending'
        });

        if (!pendingRequest) {
          const requestToken = crypto.randomBytes(32).toString('hex');
          const verificationRequest = new VerificationRequest({
            userId: user._id,
            deviceId: device._id,
            requestToken: requestToken,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            ipAddress: deviceInfo.ipAddress,
            userAgent: deviceInfo.userAgent
          });
          await verificationRequest.save();
          await sendDeviceVerificationEmail(user, device, verificationRequest);
        }

        return res.status(403).json({
          success: false,
          requiresVerification: true,
          message: 'Device pending verification. Please wait for admin approval.',
          deviceInfo: {
            deviceName: device.deviceName,
            os: device.os,
            browser: device.browser,
            macAddress: device.macAddress
          }
        });
      }

      // Update device login info
      device.lastLogin = new Date();
      device.loginCount = (device.loginCount || 0) + 1;
      device.ipAddress = deviceInfo.ipAddress;
      await device.save();

      // Update user last login
      user.lastLogin = new Date();
      await user.save();

      // Generate token
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

      // Create session
      const session = new Session({
        userId: user._id,
        deviceId: device._id,
        token: token,
        lastActivity: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent
      });
      await session.save();

      device.sessions.push(session._id);
      await device.save();

      // Log login history
      await LoginHistory.create({
        userId: user._id,
        email: user.email,
        role: user.role || 'cashier',
        success: true,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        deviceId: deviceInfo.deviceId,
        macAddress: deviceInfo.macAddress,
        os: deviceInfo.os,
        browser: deviceInfo.browser
      });

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
        device: {
          id: device._id,
          deviceName: device.deviceName,
          os: device.os,
          browser: device.browser,
          macAddress: device.macAddress,
          isVerified: device.isVerified
        },
        sessionId: session._id,
        message: 'Login successful',
        sessionTimeout: 5
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

// Cashier Login
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

// Check if device is verified
app.post('/api/auth/check-device', async (req, res) => {
  try {
    const { email, deviceInfo } = req.body;

    let user = await models.User.findOne({ email });
    if (!user) {
      user = await models.Cashier.findOne({ email });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let device = await Device.findOne({
      userId: user._id,
      deviceId: deviceInfo.deviceId
    });

    if (!device) {
      const requestToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const newDevice = new Device({
        userId: user._id,
        deviceId: deviceInfo.deviceId,
        deviceName: deviceInfo.deviceName || 'Unknown Device',
        deviceType: deviceInfo.deviceType || 'unknown',
        os: deviceInfo.os,
        osVersion: deviceInfo.osVersion,
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion,
        macAddress: deviceInfo.macAddress,
        ipAddress: deviceInfo.ipAddress,
        isVerified: false,
        firstLogin: new Date(),
        lastLogin: new Date()
      });
      await newDevice.save();

      const verificationRequest = new VerificationRequest({
        userId: user._id,
        deviceId: newDevice._id,
        requestToken: requestToken,
        expiresAt: expiresAt,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent
      });
      await verificationRequest.save();

      await sendDeviceVerificationEmail(user, newDevice, verificationRequest);

      return res.json({
        success: false,
        requiresVerification: true,
        message: 'New device detected. Please wait for admin approval.',
        requestId: verificationRequest._id,
        deviceInfo: {
          deviceName: newDevice.deviceName,
          os: newDevice.os,
          browser: newDevice.browser,
          macAddress: newDevice.macAddress,
          ipAddress: newDevice.ipAddress,
          deviceType: newDevice.deviceType
        }
      });
    }

    if (!device.isVerified) {
      const pendingRequest = await VerificationRequest.findOne({
        deviceId: device._id,
        status: 'pending'
      });

      if (!pendingRequest) {
        const requestToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const newRequest = new VerificationRequest({
          userId: user._id,
          deviceId: device._id,
          requestToken: requestToken,
          expiresAt: expiresAt,
          ipAddress: deviceInfo.ipAddress,
          userAgent: deviceInfo.userAgent
        });
        await newRequest.save();

        await sendDeviceVerificationEmail(user, device, newRequest);
      }

      return res.json({
        success: false,
        requiresVerification: true,
        message: 'Device pending verification. Please wait for admin approval.',
        deviceInfo: {
          deviceName: device.deviceName,
          os: device.os,
          browser: device.browser,
          macAddress: device.macAddress,
          ipAddress: device.ipAddress,
          deviceType: device.deviceType
        }
      });
    }

    device.lastLogin = new Date();
    device.loginCount = (device.loginCount || 0) + 1;
    device.ipAddress = deviceInfo.ipAddress;
    await device.save();

    return res.json({
      success: true,
      message: 'Device verified',
      device: {
        id: device._id,
        deviceName: device.deviceName,
        isVerified: device.isVerified
      }
    });

  } catch (error) {
    console.error('❌ Device check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check device',
      error: error.message
    });
  }
});

// ==================== SESSION MANAGEMENT ROUTES ====================

// Refresh session
app.post('/api/auth/refresh-session', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Session refreshed',
      expiresAt: req.session.expiresAt
    });
  } catch (error) {
    console.error('❌ Session refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh session'
    });
  }
});

// Logout
app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    req.session.isActive = false;
    req.session.logoutReason = 'manual';
    await req.session.save();

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to logout'
    });
  }
});

// Get active sessions
app.get('/api/auth/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.user._id,
      isActive: true
    }).populate('deviceId');

    res.json({
      success: true,
      data: sessions.map(s => ({
        id: s._id,
        device: s.deviceId,
        lastActivity: s.lastActivity,
        expiresAt: s.expiresAt,
        isCurrent: s._id.toString() === req.session._id.toString()
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sessions'
    });
  }
});

// Get user's devices
app.get('/api/auth/devices', authMiddleware, async (req, res) => {
  try {
    const devices = await Device.find({
      userId: req.user._id,
      isActive: true
    }).sort({ lastLogin: -1 });

    res.json({
      success: true,
      data: devices.map(d => ({
        id: d._id,
        deviceName: d.deviceName,
        deviceType: d.deviceType,
        os: d.os,
        browser: d.browser,
        macAddress: d.macAddress,
        ipAddress: d.ipAddress,
        isVerified: d.isVerified,
        lastLogin: d.lastLogin,
        firstLogin: d.firstLogin,
        loginCount: d.loginCount,
        isCurrent: d._id.toString() === req.deviceId?.toString()
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching devices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch devices'
    });
  }
});

// Revoke device access
app.delete('/api/auth/devices/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOne({
      _id: deviceId,
      userId: req.user._id
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'Device not found'
      });
    }

    if (device._id.toString() === req.deviceId?.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot revoke access for current device'
      });
    }

    device.isActive = false;
    await device.save();

    await Session.updateMany(
      { deviceId: device._id, isActive: true },
      { isActive: false, logoutReason: 'admin_terminated' }
    );

    res.json({
      success: true,
      message: 'Device access revoked successfully'
    });
  } catch (error) {
    console.error('❌ Error revoking device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke device access'
    });
  }
});

// ==================== ADMIN DEVICE VERIFICATION ROUTES ====================

// Get pending verification requests
app.get('/api/admin/verification-requests', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const requests = await VerificationRequest.find({ status: 'pending' })
      .populate('userId', 'name email role')
      .populate('deviceId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: requests.map(req => ({
        id: req._id,
        user: req.userId,
        device: req.deviceId,
        requestToken: req.requestToken,
        createdAt: req.createdAt,
        expiresAt: req.expiresAt,
        ipAddress: req.ipAddress,
        userAgent: req.userAgent
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching verification requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification requests'
    });
  }
});

// Approve or reject device verification
app.post('/api/admin/verify-device', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const { requestId, action, rejectionReason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId)
      .populate('userId')
      .populate('deviceId');

    if (!verificationRequest) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    if (verificationRequest.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request already ${verificationRequest.status}`
      });
    }

    if (new Date() > verificationRequest.expiresAt) {
      verificationRequest.status = 'expired';
      await verificationRequest.save();
      return res.status(400).json({
        success: false,
        message: 'Verification request has expired'
      });
    }

    if (action === 'approve') {
      verificationRequest.status = 'approved';
      verificationRequest.approvedBy = req.user._id;
      verificationRequest.approvedAt = new Date();

      await Device.findByIdAndUpdate(verificationRequest.deviceId, {
        isVerified: true
      });

      await sendDeviceApprovedEmail(verificationRequest.userId, verificationRequest.deviceId);

    } else {
      verificationRequest.status = 'rejected';
      verificationRequest.approvedBy = req.user._id;
      verificationRequest.approvedAt = new Date();
      verificationRequest.rejectionReason = rejectionReason || 'No reason provided';

      await sendDeviceRejectedEmail(verificationRequest.userId, verificationRequest.deviceId, rejectionReason);
    }

    await verificationRequest.save();

    res.json({
      success: true,
      message: `Device ${action}d successfully`,
      data: verificationRequest
    });

  } catch (error) {
    console.error('❌ Error verifying device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify device',
      error: error.message
    });
  }
});

// ==================== PRODUCT ROUTES ====================

app.get('/api/products', async (req, res) => {
  try {
    console.log('📦 Fetching products...');

    if (!models.Product) {
      console.log('⚠️ Product model not found, initializing...');
      models = createModels();
    }

    const products = await models.Product.find({ isActive: true })
      .populate('shop', 'name location type')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${products.length} products`);

    res.json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    console.error('❌ Error fetching products:', error);
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

    const oldProduct = await models.Product.findById(id);
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

    const oldStock = oldProduct?.currentStock || 0;
    const newStock = product.currentStock || 0;
    const minStock = product.minStockLevel || 5;

    if (newStock === 0 || (oldStock > minStock && newStock <= minStock)) {
      const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';

      const now = new Date();
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      const lastAlert = product.lastStockAlertSent;

      if (!lastAlert || new Date(lastAlert) < sixHoursAgo) {
        await sendStockAlertEmail([{
          ...product.toObject(),
          shopName: product.shop?.name || product.shopName || 'Unknown Shop'
        }], alertType);

        product.lastStockAlertSent = now;
        await product.save();
      }
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
    console.log('🏪 Fetching shops...');

    if (!models.Shop) {
      console.log('⚠️ Shop model not found, initializing...');
      models = createModels();
    }

    const shops = await models.Shop.find().sort({ createdAt: -1 });
    console.log(`✅ Found ${shops.length} shops`);

    res.json({
      success: true,
      data: shops,
      count: shops.length
    });
  } catch (error) {
    console.error('❌ Error fetching shops:', error);
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
    const { shopId, status, cashierId, startDate, endDate } = req.query;

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
      cogsMethodology: 'prorated_based_on_payment',
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
      cogsCalculation: 'prorated_based_on_payment',
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

            console.log(`📦 Stock reduced for ${product.name}: ${currentStock} -> ${newStock} (sold: ${quantity})`);

            const minStockLevel = CalculationUtils.safeNumber(product.minStockLevel || 5);
            if (newStock === 0 || (newStock <= minStockLevel && newStock > 0)) {
              const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';

              const now = new Date();
              const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
              const lastAlert = product.lastStockAlertSent;

              if (!lastAlert || new Date(lastAlert) < sixHoursAgo) {
                await sendStockAlertEmail([{
                  ...product.toObject(),
                  shopName: product.shop?.name || product.shopName || 'Unknown Shop'
                }], alertType);

                await models.Product.findByIdAndUpdate(item.productId, {
                  lastStockAlertSent: now
                });
              }
            }
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

      const totalSplit = transactionData.paymentSplit.cash + transactionData.paymentSplit.bank_mpesa + transactionData.paymentSplit.credit;
      if (Math.abs(totalSplit - totalAmount) > 0.01) {
        console.warn('⚠️ Payment split does not equal total amount:', { totalSplit, totalAmount });
        transactionData.paymentSplit.credit = totalAmount - transactionData.paymentSplit.cash - transactionData.paymentSplit.bank_mpesa;
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
        console.log('✅ Credit record created with upfront payment:', {
          creditId: credit._id,
          totalAmount: credit.totalAmount,
          amountPaid: credit.amountPaid,
          balanceDue: credit.balanceDue,
          status: credit.status,
          upfrontPaymentAmount: credit.upfrontPaymentAmount,
          upfrontPaymentMethod: credit.upfrontPaymentMethod,
          immediateRevenue: credit.immediateRevenue
        });
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

    console.log('✅ Credit payment processed successfully:', {
      creditId: originalCredit._id,
      paymentAmount,
      newAmountPaid,
      newBalanceDue,
      status: newStatus,
      paymentTransactionId: paymentTransaction._id,
      paymentSplit: paymentSplit
    });

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
      credits: await models.Credit.countDocuments(),
      devices: await models.Device.countDocuments(),
      sessions: await models.Session.countDocuments(),
      verificationRequests: await models.VerificationRequest.countDocuments()
    };

    res.json({
      success: true,
      counts,
      database: mongoose.connection.name,
      status: 'connected',
      cogsCalculation: 'prorated_based_on_payment',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled',
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced',
      deviceVerification: 'enabled',
      sessionManagement: 'enabled'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database check failed',
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
      stockCheck: '/api/stock/check-now',
      stockAlerts: '/api/stock/alerts',
      auth: {
        requestCode: '/api/auth/request-code',
        verifyCode: '/api/auth/verify-code',
        cashierLogin: '/api/auth/cashier/login',
        checkDevice: '/api/auth/check-device',
        refreshSession: '/api/auth/refresh-session',
        logout: '/api/auth/logout',
        sessions: '/api/auth/sessions',
        devices: '/api/auth/devices'
      },
      admin: {
        verificationRequests: '/api/admin/verification-requests',
        verifyDevice: '/api/admin/verify-device'
      }
    },
    serverless: true,
    deviceVerification: 'enabled',
    sessionManagement: 'enabled',
    cogsCalculation: 'prorated_based_on_payment',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced',
    stockMonitoring: 'on-demand (trigger via /api/stock/check-now)'
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
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, async () => {
    await connectDB();
    await initializeEmail();
    console.log(`\n🎉 Server Running Locally on Port ${PORT}`);
    console.log('='.repeat(60));
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🔐 Device Verification: ENABLED`);
    console.log(`🔑 Session Management: ENABLED`);
    console.log(`🔔 Stock Monitoring: ON-DEMAND (use /api/stock/check-now)`);
    console.log('='.repeat(60));
  });
}