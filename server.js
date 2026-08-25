// server.js - Complete POS System Backend with Enhanced Email Templates
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

  // Cashier Schema with defaults
  const cashierSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    password: String,
    role: { type: String, default: 'cashier' },
    status: { type: String, default: 'active' },
    
    assignedShops: {
      type: [{
        shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
        shopName: String,
        assignedAt: { type: Date, default: Date.now },
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        isActive: { type: Boolean, default: true }
      }],
      default: []
    },
    
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    shopName: String,
    
    shopAssignmentHistory: {
      type: [{
        shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
        shopName: String,
        action: { type: String, enum: ['assigned', 'removed', 'changed'] },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedByName: String,
        timestamp: { type: Date, default: Date.now },
        notes: String
      }],
      default: []
    },
    
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
      assignedShops: { type: Array, default: [] },
      shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
      shopName: String,
      shopAssignmentHistory: { type: Array, default: [] },
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

// ==================== ENHANCED EMAIL TEMPLATES ====================

// Generate bear ASCII art for emails
const getBearArt = () => {
  return `
  ╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
  ┃  🐻  BEAR SECURE CODE  🐻  ┃
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
  `;
};

// Enhanced Secure Code Email Template with Animation & Bear Theme
const generateSecureCodeEmailHTML = (code, expiresIn = 15, appName = 'Shop Management') => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔐 Your Secure Code</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;800&display=swap');
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Poppins', Arial, sans-serif;
        background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      
      .email-container {
        max-width: 580px;
        width: 100%;
        background: #ffffff;
        border-radius: 24px;
        overflow: hidden;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
        animation: floatIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        transform: translateY(30px);
        opacity: 0;
      }
      
      @keyframes floatIn {
        0% {
          transform: translateY(30px) scale(0.95);
          opacity: 0;
        }
        100% {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
      }
      
      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }
      
      @keyframes shimmer {
        0% {
          background-position: -200% center;
        }
        100% {
          background-position: 200% center;
        }
      }
      
      @keyframes bearWave {
        0%, 100% {
          transform: rotate(0deg);
        }
        25% {
          transform: rotate(5deg);
        }
        75% {
          transform: rotate(-5deg);
        }
      }
      
      @keyframes sparkle {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(1.2);
        }
      }
      
      @keyframes countdown {
        0% {
          stroke-dashoffset: 100;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }
      
      .email-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 35px 30px 25px;
        text-align: center;
        position: relative;
        overflow: hidden;
      }
      
      .email-header::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%);
        animation: shimmer 4s ease-in-out infinite;
        background-size: 200% 200%;
      }
      
      .bear-icon {
        font-size: 52px;
        display: inline-block;
        animation: bearWave 2s ease-in-out infinite;
        position: relative;
        z-index: 1;
      }
      
      .header-title {
        color: #ffffff;
        font-size: 24px;
        font-weight: 700;
        margin-top: 8px;
        position: relative;
        z-index: 1;
        letter-spacing: 0.5px;
      }
      
      .header-subtitle {
        color: rgba(255,255,255,0.85);
        font-size: 14px;
        font-weight: 300;
        margin-top: 4px;
        position: relative;
        z-index: 1;
      }
      
      .header-badge {
        display: inline-block;
        background: rgba(255,255,255,0.2);
        backdrop-filter: blur(10px);
        padding: 4px 16px;
        border-radius: 20px;
        color: white;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-top: 8px;
        position: relative;
        z-index: 1;
        border: 1px solid rgba(255,255,255,0.15);
      }
      
      .email-body {
        padding: 35px 30px 30px;
        background: #ffffff;
      }
      
      .greeting {
        font-size: 18px;
        font-weight: 600;
        color: #2d3748;
        margin-bottom: 6px;
      }
      
      .greeting-text {
        color: #4a5568;
        font-size: 14px;
        line-height: 1.7;
        margin-bottom: 24px;
      }
      
      .code-container {
        background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
        border-radius: 16px;
        padding: 30px 20px 25px;
        text-align: center;
        border: 2px dashed #cbd5e0;
        position: relative;
        margin-bottom: 24px;
        transition: all 0.3s ease;
      }
      
      .code-container:hover {
        border-color: #667eea;
        box-shadow: 0 8px 30px rgba(102, 126, 234, 0.15);
      }
      
      .code-label {
        font-size: 12px;
        font-weight: 600;
        color: #a0aec0;
        text-transform: uppercase;
        letter-spacing: 2px;
      }
      
      .code-value {
        font-size: 48px;
        font-weight: 800;
        color: #2d3748;
        letter-spacing: 8px;
        margin: 8px 0 4px;
        font-family: 'Courier New', monospace;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: pulse 2s ease-in-out infinite;
      }
      
      .code-expiry {
        font-size: 13px;
        color: #718096;
        margin-top: 8px;
      }
      
      .code-expiry strong {
        color: #e53e3e;
        font-weight: 600;
      }
      
      .timer-ring {
        display: inline-block;
        width: 60px;
        height: 60px;
        margin-top: 12px;
        position: relative;
      }
      
      .timer-ring svg {
        transform: rotate(-90deg);
      }
      
      .timer-ring .bg {
        fill: none;
        stroke: #e2e8f0;
        stroke-width: 4;
      }
      
      .timer-ring .progress {
        fill: none;
        stroke: #667eea;
        stroke-width: 4;
        stroke-linecap: round;
        stroke-dasharray: 100;
        stroke-dashoffset: 0;
        animation: countdown ${expiresIn * 60}s linear forwards;
      }
      
      .timer-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 14px;
        font-weight: 700;
        color: #2d3748;
      }
      
      .features-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin: 20px 0 24px;
      }
      
      .feature-item {
        background: #f7fafc;
        border-radius: 10px;
        padding: 12px 14px;
        text-align: center;
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }
      
      .feature-item:hover {
        border-color: #667eea;
        background: #f0f4ff;
      }
      
      .feature-icon {
        font-size: 20px;
        display: block;
        margin-bottom: 2px;
      }
      
      .feature-label {
        font-size: 11px;
        font-weight: 600;
        color: #4a5568;
      }
      
      .feature-value {
        font-size: 11px;
        color: #718096;
      }
      
      .security-notice {
        background: linear-gradient(135deg, #fff5f5 0%, #fef5e7 100%);
        border-radius: 12px;
        padding: 16px 20px;
        border-left: 4px solid #e53e3e;
        margin-bottom: 24px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      
      .security-icon {
        font-size: 20px;
        flex-shrink: 0;
        margin-top: 2px;
      }
      
      .security-text {
        font-size: 12px;
        color: #4a5568;
        line-height: 1.6;
      }
      
      .security-text strong {
        color: #e53e3e;
      }
      
      .divider {
        border: none;
        height: 1px;
        background: linear-gradient(to right, transparent, #e2e8f0, transparent);
        margin: 20px 0;
      }
      
      .footer {
        padding: 20px 30px 25px;
        background: #f7fafc;
        text-align: center;
        border-top: 1px solid #e2e8f0;
      }
      
      .footer-text {
        font-size: 12px;
        color: #a0aec0;
        line-height: 1.8;
      }
      
      .footer-text strong {
        color: #4a5568;
      }
      
      .footer-logo {
        font-size: 13px;
        font-weight: 700;
        color: #2d3748;
        margin-bottom: 4px;
      }
      
      .footer-logo span {
        color: #667eea;
      }
      
      @media (max-width: 480px) {
        .email-body {
          padding: 25px 16px 20px;
        }
        .code-value {
          font-size: 34px;
          letter-spacing: 6px;
        }
        .features-grid {
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .header-title {
          font-size: 20px;
        }
        .bear-icon {
          font-size: 40px;
        }
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <!-- HEADER -->
      <div class="email-header">
        <div class="bear-icon">🐻</div>
        <div class="header-title">🔐 Your Secure Code</div>
        <div class="header-subtitle">${appName} • Secure Login Verification</div>
        <div class="header-badge">✦ SECURE CODE ✦</div>
      </div>
      
      <!-- BODY -->
      <div class="email-body">
        <div class="greeting">Hello, <span style="color: #667eea;">Valued User</span> 👋</div>
        <p class="greeting-text">
          You've requested a secure login code for <strong>${appName}</strong>. 
          Please use the code below to complete your authentication.
        </p>
        
        <!-- CODE -->
        <div class="code-container">
          <div class="code-label">✦ Your Secure Code ✦</div>
          <div class="code-value">${code}</div>
          <div class="code-expiry">
            ⏰ This code expires in <strong>${expiresIn} minutes</strong>
          </div>
          
          <!-- Timer Animation -->
          <div class="timer-ring">
            <svg viewBox="0 0 60 60">
              <circle class="bg" cx="30" cy="30" r="26" />
              <circle class="progress" cx="30" cy="30" r="26" />
            </svg>
            <div class="timer-text">${expiresIn}m</div>
          </div>
        </div>
        
        <!-- Features -->
        <div class="features-grid">
          <div class="feature-item">
            <span class="feature-icon">🔒</span>
            <div class="feature-label">One-Time Use</div>
            <div class="feature-value">Single use only</div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">⏰</span>
            <div class="feature-label">Time Limited</div>
            <div class="feature-value">${expiresIn} min expiry</div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🛡️</span>
            <div class="feature-label">Secure</div>
            <div class="feature-value">Encrypted</div>
          </div>
          <div class="feature-item">
            <span class="feature-icon">🐻</span>
            <div class="feature-label">Bear Protected</div>
            <div class="feature-value">Safe & secure</div>
          </div>
        </div>
        
        <!-- Security Notice -->
        <div class="security-notice">
          <span class="security-icon">⚠️</span>
          <div class="security-text">
            <strong>Security Alert:</strong> Never share this code with anyone. 
            Our team will never ask for your code. If you didn't request this, 
            please ignore this email.
          </div>
        </div>
        
        <hr class="divider" />
        
        <div style="text-align: center; font-size: 13px; color: #718096;">
          <span style="display: inline-block; background: #f0f4ff; padding: 4px 12px; border-radius: 12px; font-weight: 600; color: #667eea;">
            🐻 Bear Secure Code System v2.0
          </span>
        </div>
      </div>
      
      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-logo">🐻 <span>${appName}</span></div>
        <div class="footer-text">
          This is an automated message, please do not reply.<br />
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
};

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
// ==================== FIXED SECURE CODE EMAIL FUNCTION ====================
// Send Secure Code Email with Enhanced Template - FIXED
const sendSecureCodeEmail = async (email, code, expiresIn = 15) => {
  try {
    if (!emailTransporter) {
      await initializeEmail();
      if (!emailTransporter) throw new Error('Email service not configured');
    }
    
    const appName = process.env.APP_NAME || 'Pamela Management';
    
    // SIMPLIFIED HTML - Guaranteed to show the code
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>🔐 Your Secure Login Code</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f6f9;
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 16px;
          padding: 30px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          text-align: center;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 20px;
          border-radius: 12px 12px 0 0;
          margin: -30px -30px 25px -30px;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
        }
        .header .bear {
          font-size: 40px;
          display: block;
          margin-bottom: 5px;
        }
        .code-box {
          background: #f0f4ff;
          border: 2px dashed #667eea;
          border-radius: 12px;
          padding: 25px 20px;
          margin: 20px 0;
        }
        .code-box .label {
          font-size: 13px;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 2px;
          font-weight: 600;
        }
        .code-box .code {
          font-size: 48px;
          font-weight: 800;
          letter-spacing: 12px;
          color: #4a3f7a;
          font-family: 'Courier New', monospace;
          margin: 10px 0;
          padding: 10px;
          background: white;
          border-radius: 8px;
          display: inline-block;
          min-width: 200px;
        }
        .expiry {
          color: #6b7280;
          font-size: 14px;
          margin-top: 10px;
        }
        .expiry strong {
          color: #e53e3e;
        }
        .security-note {
          background: #fff5f5;
          border-left: 4px solid #e53e3e;
          padding: 12px 16px;
          margin: 20px 0;
          text-align: left;
          font-size: 13px;
          color: #4a5568;
          border-radius: 4px;
        }
        .security-note strong {
          color: #e53e3e;
        }
        .footer {
          margin-top: 25px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #9ca3af;
        }
        .footer strong {
          color: #4a5568;
        }
        .features {
          display: flex;
          justify-content: center;
          gap: 15px;
          margin: 15px 0;
          flex-wrap: wrap;
        }
        .feature {
          background: #f9fafb;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 12px;
          color: #4a5568;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span class="bear">🐻</span>
          <h1>🔐 Your Secure Login Code</h1>
          <p style="margin: 5px 0 0; opacity: 0.9; font-size: 14px;">${appName}</p>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; margin-bottom: 5px;">
          Hello <strong>Valued User</strong> 👋
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 0;">
          Use the code below to complete your login to <strong>${appName}</strong>.
        </p>
        
        <!-- CODE BOX - The code is displayed clearly here -->
        <div class="code-box">
          <div class="label">✦ Your Secure Code ✦</div>
          <div class="code">${code}</div>
          <div class="expiry">⏰ Expires in <strong>${expiresIn} minutes</strong></div>
        </div>
        
        <div class="features">
          <span class="feature">🔒 One-Time Use</span>
          <span class="feature">⏰ Time Limited</span>
          <span class="feature">🛡️ Secure</span>
        </div>
        
        <div class="security-note">
          <strong>⚠️ Security Alert:</strong> Never share this code with anyone. 
          Our team will never ask for your code. If you didn't request this, 
          please ignore this email.
        </div>
        
        <div style="font-size: 13px; color: #667eea; font-weight: 600; margin: 10px 0;">
          🐻 Bear Secure Code System
        </div>
        
        <div class="footer">
          <strong>${appName}</strong><br>
          This is an automated message, please do not reply.<br>
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </div>
      </div>
    </body>
    </html>
    `;
    
    // Plain text fallback (some email clients prefer this)
    const text = `
    =========================================
    🐻 BEAR SECURE CODE SYSTEM 🐻
    =========================================
    
    Hello Valued User,
    
    Your secure login code for ${appName} is:
    
    🔐 CODE: ${code}
    
    This code expires in ${expiresIn} minutes.
    
    ⚠️ Never share this code with anyone.
    
    =========================================
    ${appName} - Secure Login Verification
    =========================================
    `;
    
    // Send the email with both HTML and plain text
    await emailTransporter.sendMail({
      from: `"🐻 ${appName} Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🔐 Your Secure Login Code - ${appName}`,
      text: text,
      html: html,
      priority: 'high',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High'
      }
    });
    
    console.log(`✅ Secure code email sent to ${email} with code: ${code}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send secure code to ${email}:`, error.message);
    throw new Error('Failed to send secure code.');
  }
};
// Send Device Verification Email with Bear Theme
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
    const appName = process.env.APP_NAME || 'Shop Management';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🔐 Device Verification Request</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap');
          
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body {
            font-family: 'Poppins', Arial, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          
          .email-container {
            max-width: 600px;
            width: 100%;
            background: #ffffff;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
            animation: floatIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            transform: translateY(30px);
            opacity: 0;
          }
          
          @keyframes floatIn {
            0% { transform: translateY(30px) scale(0.95); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
          
          @keyframes bearWave {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(5deg); }
            75% { transform: rotate(-5deg); }
          }
          
          .email-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 30px 25px 20px;
            text-align: center;
          }
          
          .bear-icon {
            font-size: 48px;
            display: inline-block;
            animation: bearWave 2s ease-in-out infinite;
          }
          
          .header-title {
            color: #ffffff;
            font-size: 22px;
            font-weight: 700;
            margin-top: 6px;
          }
          
          .header-subtitle {
            color: rgba(255,255,255,0.85);
            font-size: 13px;
            font-weight: 300;
            margin-top: 2px;
          }
          
          .header-badge {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            padding: 3px 14px;
            border-radius: 20px;
            color: white;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-top: 6px;
            border: 1px solid rgba(255,255,255,0.15);
          }
          
          .email-body {
            padding: 30px 25px 25px;
          }
          
          .greeting {
            font-size: 17px;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 4px;
          }
          
          .greeting-text {
            color: #4a5568;
            font-size: 14px;
            line-height: 1.7;
            margin-bottom: 18px;
          }
          
          .device-card {
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            border-radius: 14px;
            padding: 18px 20px;
            margin-bottom: 20px;
            border: 1px solid #e2e8f0;
          }
          
          .device-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid #e8ecf0;
          }
          
          .device-row:last-child {
            border-bottom: none;
          }
          
          .device-label {
            font-size: 13px;
            color: #718096;
            font-weight: 500;
          }
          
          .device-value {
            font-size: 13px;
            color: #2d3748;
            font-weight: 600;
          }
          
          .actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
            margin: 20px 0 10px;
          }
          
          .btn-approve {
            display: inline-block;
            background: linear-gradient(135deg, #10B981, #059669);
            color: white;
            padding: 14px 35px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 15px;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
          }
          
          .btn-approve:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 35px rgba(16, 185, 129, 0.5);
          }
          
          .btn-reject {
            display: inline-block;
            background: linear-gradient(135deg, #EF4444, #DC2626);
            color: white;
            padding: 14px 35px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 15px;
            transition: all 0.3s ease;
            box-shadow: 0 8px 25px rgba(239, 68, 68, 0.4);
          }
          
          .btn-reject:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 35px rgba(239, 68, 68, 0.5);
          }
          
          .security-notice {
            background: #fff5f5;
            border-radius: 10px;
            padding: 12px 16px;
            border-left: 4px solid #e53e3e;
            margin-top: 16px;
            font-size: 12px;
            color: #4a5568;
            line-height: 1.6;
          }
          
          .security-notice strong {
            color: #e53e3e;
          }
          
          .divider {
            border: none;
            height: 1px;
            background: linear-gradient(to right, transparent, #e2e8f0, transparent);
            margin: 16px 0;
          }
          
          .footer {
            padding: 16px 25px 20px;
            background: #f7fafc;
            text-align: center;
            border-top: 1px solid #e2e8f0;
          }
          
          .footer-text {
            font-size: 12px;
            color: #a0aec0;
            line-height: 1.8;
          }
          
          .footer-logo {
            font-size: 13px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 4px;
          }
          
          .footer-logo span {
            color: #667eea;
          }
          
          @media (max-width: 480px) {
            .email-body { padding: 20px 14px 16px; }
            .btn-approve, .btn-reject { padding: 12px 20px; font-size: 13px; width: 100%; text-align: center; }
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">
            <div class="bear-icon">🐻</div>
            <div class="header-title">🔐 New Device Verification</div>
            <div class="header-subtitle">${appName} • Security Alert</div>
            <div class="header-badge">✦ DEVICE VERIFICATION ✦</div>
          </div>
          
          <div class="email-body">
            <div class="greeting">Hello, <span style="color: #667eea;">Admin</span> 👋</div>
            <p class="greeting-text">
              A user is trying to log in from a new device. Please review the device details below and approve or reject this request.
            </p>
            
            <div class="device-card">
              <div class="device-row">
                <span class="device-label">👤 User</span>
                <span class="device-value">${user.name || 'Unknown User'} (${user.email})</span>
              </div>
              <div class="device-row">
                <span class="device-label">💻 Device</span>
                <span class="device-value">${device.deviceName || 'Unknown Device'}</span>
              </div>
              <div class="device-row">
                <span class="device-label">🖥️ OS</span>
                <span class="device-value">${device.os || 'Unknown'} ${device.osVersion || ''}</span>
              </div>
              <div class="device-row">
                <span class="device-label">🌐 Browser</span>
                <span class="device-value">${device.browser || 'Unknown'} ${device.browserVersion || ''}</span>
              </div>
              <div class="device-row">
                <span class="device-label">📱 MAC Address</span>
                <span class="device-value" style="font-family: monospace; font-size: 12px;">${device.macAddress || 'Unknown'}</span>
              </div>
            </div>
            
            <div class="actions">
              <a href="${approveLink}" class="btn-approve">✅ Approve Device</a>
              <a href="${rejectLink}" class="btn-reject">❌ Reject Device</a>
            </div>
            
            <div class="security-notice">
              <strong>⚠️ Security Alert:</strong> Only approve this device if you recognize the user and device details. 
              If you didn't expect this request, please reject it immediately.
            </div>
            
            <hr class="divider" />
            
            <div style="text-align: center; font-size: 12px; color: #718096;">
              <span style="display: inline-block; background: #f0f4ff; padding: 3px 10px; border-radius: 10px; font-weight: 600; color: #667eea;">
                🐻 Bear Secure System
              </span>
            </div>
          </div>
          
          <div class="footer">
            <div class="footer-logo">🐻 <span>${appName}</span></div>
            <div class="footer-text">
              This is an automated security message.<br />
              &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    let sentCount = 0;
    for (const adminEmail of adminEmails) {
      try {
        await emailTransporter.sendMail({
          from: `"🐻 ${appName} Security" <${process.env.EMAIL_USER}>`,
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

// Request secure code - UPDATED with enhanced email
app.post('/api/auth/request-code', [body('email').isEmail().normalizeEmail()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, error: 'Invalid email', details: errors.array() });

    const { email } = req.body;
    const user = await models.User.findOne({ email }) || await models.Cashier.findOne({ email });

    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email' });

    const secureCode = generateSecureCode();
    const expiresIn = 15;
    const expiresAt = new Date(Date.now() + expiresIn * 60 * 1000);
    const hashedCode = await bcrypt.hash(secureCode, 10);

    await models.SecureCode.findOneAndUpdate(
      { email },
      { code: hashedCode, expiresAt, attempts: 0, used: false },
      { upsert: true, new: true }
    );

    if (!emailTransporter) {
      return res.json({ 
        success: true, 
        message: 'Secure code generated (email disabled)', 
        developmentMode: true, 
        secureCode, 
        expiresIn 
      });
    }

    try {
      // Use enhanced email template
      await sendSecureCodeEmail(email, secureCode, expiresIn);
      res.json({ success: true, message: '🐻 Secure code sent to your email! Please check your inbox.', expiresIn });
    } catch (emailError) {
      await models.SecureCode.deleteOne({ email });
      res.status(500).json({ success: false, message: 'Failed to send secure code. Please try again.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
});

// Verify secure code - SIMPLIFIED (No device verification)
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

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateAuthToken(user._id, user.email, user.role || 'cashier');

    const userData = { 
      _id: user._id, 
      name: user.name, 
      email: user.email, 
      role: user.role || 'cashier', 
      lastLogin: user.lastLogin 
    };
    if (user.role === 'cashier') { 
      userData.shopId = user.shopId; 
      userData.shopName = user.shopName; 
    }

    return res.status(200).json({ 
      success: true, 
      user: userData, 
      token, 
      message: '🐻 Login successful! Welcome back!'
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
  }
});

// ==================== CASHIER ROUTES - COMPLETE CRUD ====================

// GET cashiers
app.get('/api/cashiers', async (req, res) => {
  try {
    if (!models.Cashier) {
      models = createModels();
    }
    
    let cashiers;
    try {
      cashiers = await models.Cashier.find()
        .populate('shopId', 'name location status')
        .sort({ createdAt: -1 });
    } catch (populateError) {
      console.warn('Error populating shopId, trying without populate:', populateError.message);
      cashiers = await models.Cashier.find().sort({ createdAt: -1 });
    }
    
    const enhancedCashiers = cashiers.map(cashier => {
      const cashierObj = cashier.toObject ? cashier.toObject() : cashier;
      
      let assignedShops = [];
      try {
        assignedShops = cashierObj.assignedShops || [];
      } catch (e) {
        assignedShops = [];
      }
      
      const activeAssignedShops = (assignedShops || [])
        .filter(assigned => assigned && assigned.isActive !== false)
        .map(assigned => ({
          shopId: assigned.shopId?._id || assigned.shopId || null,
          shopName: assigned.shopId?.name || assigned.shopName || 'Unknown Shop',
          shopLocation: assigned.shopId?.location || null,
          shopStatus: assigned.shopId?.status || null,
          assignedAt: assigned.assignedAt || null
        }))
        .filter(shop => shop.shopId !== null);
      
      return {
        ...cashierObj,
        _id: cashierObj._id || cashierObj.id,
        name: cashierObj.name || 'Unknown',
        email: cashierObj.email || 'No email',
        phone: cashierObj.phone || '',
        status: cashierObj.status || 'active',
        role: cashierObj.role || 'cashier',
        shopId: cashierObj.shopId || null,
        shopName: cashierObj.shopName || null,
        assignedShops: activeAssignedShops,
        activeAssignedShops: activeAssignedShops,
        assignedShopCount: activeAssignedShops.length,
        lastLogin: cashierObj.lastLogin || null,
        createdAt: cashierObj.createdAt || new Date(),
        primaryShop: cashierObj.shopId ? {
          shopId: cashierObj.shopId._id || cashierObj.shopId,
          shopName: cashierObj.shopId?.name || cashierObj.shopName || 'Unknown'
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
    res.json({ 
      success: true, 
      data: [], 
      count: 0,
      message: 'No cashiers available',
      error: error.message 
    });
  }
});

// CREATE cashier - ADD THIS
app.post('/api/cashiers', async (req, res) => {
  try {
    const { name, email, phone, password, role = 'cashier' } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and password are required' 
      });
    }
    
    const existingCashier = await models.Cashier.findOne({ email: email.toLowerCase().trim() });
    if (existingCashier) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cashier with this email already exists' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const cashier = new models.Cashier({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || '',
      password: hashedPassword,
      role: role,
      status: 'active',
      assignedShops: [],
      shopAssignmentHistory: []
    });
    
    await cashier.save();
    
    const cashierResponse = cashier.toObject();
    delete cashierResponse.password;
    
    res.status(201).json({
      success: true,
      data: cashierResponse,
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

// UPDATE cashier
app.patch('/api/cashiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, status, password } = req.body;
    
    const cashier = await models.Cashier.findById(id);
    if (!cashier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cashier not found' 
      });
    }
    
    if (name) cashier.name = name.trim();
    if (email) cashier.email = email.toLowerCase().trim();
    if (phone) cashier.phone = phone;
    if (status) cashier.status = status;
    if (password) {
      cashier.password = await bcrypt.hash(password, 10);
    }
    
    cashier.updatedAt = new Date();
    await cashier.save();
    
    const cashierResponse = cashier.toObject();
    delete cashierResponse.password;
    
    res.json({
      success: true,
      data: cashierResponse,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('Error updating cashier:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update cashier', 
      error: error.message 
    });
  }
});

// DELETE cashier
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

// ==================== CASHIER SHOP ASSIGNMENT ROUTES ====================

// Assign shops to a cashier - FIXED
app.post('/api/cashiers/:id/assign-shops', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required to assign shops' 
      });
    }

    const { id } = req.params;
    const { shopIds, action = 'assign', notes } = req.body;
    
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

    // Initialize arrays if they don't exist
    if (!cashier.assignedShops) {
      cashier.assignedShops = [];
    }
    if (!cashier.shopAssignmentHistory) {
      cashier.shopAssignmentHistory = [];
    }

    const adminName = req.user.name || 'Admin';
    const adminId = req.user._id;

    for (const shopId of shopIds) {
      const shop = shops.find(s => s._id.toString() === shopId);
      if (!shop) continue;
      
      if (action === 'assign') {
        const existingAssignment = cashier.assignedShops.find(
          a => a.shopId && a.shopId.toString() === shopId
        );
        
        if (!existingAssignment) {
          cashier.assignedShops.push({
            shopId: shop._id,
            shopName: shop.name,
            assignedAt: new Date(),
            assignedBy: adminId,
            isActive: true
          });
          
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

    const activeShops = cashier.assignedShops.filter(a => a.isActive !== false);
    if (activeShops.length === 1 && !cashier.shopId) {
      cashier.shopId = activeShops[0].shopId;
      cashier.shopName = activeShops[0].shopName;
    }

    cashier.updatedAt = new Date();
    await cashier.save();

    let updatedCashier;
    try {
      updatedCashier = await models.Cashier.findById(id)
        .populate('shopId', 'name location')
        .populate('assignedShops.shopId', 'name location status');
    } catch (populateError) {
      console.warn('Error populating cashier after update:', populateError.message);
      updatedCashier = await models.Cashier.findById(id);
    }

    const responseData = updatedCashier ? updatedCashier.toObject() : cashier.toObject();
    if (!responseData.assignedShops) {
      responseData.assignedShops = [];
    }
    if (!responseData.shopAssignmentHistory) {
      responseData.shopAssignmentHistory = [];
    }
    delete responseData.password;

    res.json({ 
      success: true, 
      data: responseData, 
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
    
    const cashier = await models.Cashier.findById(id);
    if (!cashier) {
      return res.status(404).json({ 
        success: false, 
        message: 'Cashier not found' 
      });
    }

    const assignedShops = (cashier.assignedShops || [])
      .filter(a => a.isActive !== false)
      .map(a => ({
        shopId: a.shopId?._id || a.shopId,
        shopName: a.shopId?.name || a.shopName || 'Unknown Shop',
        shopLocation: a.shopId?.location || null,
        shopStatus: a.shopId?.status || null,
        shopType: a.shopId?.type || null,
        assignedAt: a.assignedAt || null,
        isPrimary: cashier.shopId && (cashier.shopId._id || cashier.shopId).toString() === (a.shopId?._id || a.shopId).toString()
      }));

    res.json({ 
      success: true, 
      data: {
        cashier: {
          id: cashier._id,
          name: cashier.name,
          email: cashier.email
        },
        assignedShops: assignedShops,
        primaryShop: cashier.shopId ? {
          shopId: cashier.shopId._id || cashier.shopId,
          shopName: cashier.shopId.name || cashier.shopName || 'Unknown'
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

// Get all shops with assignment status for a cashier
app.get('/api/cashiers/:id/available-shops', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
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

    const assignedShops = cashier.assignedShops || [];
    const assignedShopIds = assignedShops
      .filter(a => a.isActive !== false)
      .map(a => a.shopId ? a.shopId.toString() : null)
      .filter(id => id !== null);

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

// ==================== CASHIER LOGIN ====================
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

    let assignedShops = [];
    if (cashier.assignedShops && cashier.assignedShops.length > 0) {
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

    await models.Cashier.findByIdAndUpdate(cashier._id, { 
      lastLogin: new Date() 
    });

    res.json({ 
      success: true, 
      user: userData, 
      token, 
      message: '🐻 Login successful! Welcome back!',
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

// ==================== OTHER ROUTES ====================
// [Keep all other existing routes - products, expenses, credits, transactions, etc.]
// They remain unchanged from your original file

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

// ==================== ROOT ENDPOINT ====================
app.get('/', (req, res) => {
  res.json({
    message: process.env.APP_NAME || 'Pamela Management API',
    version: process.env.APP_VERSION || '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    bear: '🐻 Secure System Active',
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
    console.log('🐻 Bear Secure System Active');
    console.log('='.repeat(60));
  });
}