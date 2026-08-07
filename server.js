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

// ==================== PERFORMANCE OPTIMIZATIONS ====================

// Add response time middleware
app.use(responseTime());

// Add database query optimizations
mongoose.set('debug', false); // Disable Mongoose debug in production

// Add timeout middleware for specific routes
app.use('/api/transactions/combined', (req, res, next) => {
  req.setTimeout(30000); // 30 seconds timeout
  res.setTimeout(30000);
  next();
});

// ==================== ENHANCED MODELS ====================

const createModels = () => {
  console.log('🔧 Creating enhanced models...');
 
  // Enhanced Product Schema
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

  // Enhanced Shop Schema
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

  // Enhanced Cashier Schema
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

  // Enhanced Expense Schema
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

  // ENHANCED Transaction Schema with PROPER upfront payment tracking
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
   
    // Enhanced Credit Fields
    isCreditTransaction: { type: Boolean, default: false },
    creditStatus: { type: String, enum: ['pending', 'partially_paid', 'paid', 'overdue'] },
    recognizedRevenue: { type: Number, default: 0 },
    outstandingRevenue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    dueDate: Date,
   
    // Credit sale classification fields
    creditShopName: String,
    creditShopId: String,
    shopClassification: String,
   
    // UPDATED: Payment split tracking - upfront payments go to cash/bank_mpesa, only balance to credit
    paymentSplit: {
      cash: { type: Number, default: 0 },
      bank_mpesa: { type: Number, default: 0 },
      credit: { type: Number, default: 0 }
    },
   
    // NEW: Immediate revenue tracking for cashier (INCLUDES UPFRONT PAYMENTS)
    immediateRevenue: { type: Number, default: 0 },
   
    // NEW: Enhanced upfront payment tracking for credit sales
    upfrontPaymentAmount: { type: Number, default: 0 },
    upfrontPaymentMethod: String,
    upfrontPaymentSplit: {
      cash: { type: Number, default: 0 },
      bank_mpesa: { type: Number, default: 0 }
    },
   
    // NEW: Track if this is a credit payment (not a new credit sale)
    isCreditPayment: { type: Boolean, default: false },
    originalCreditId: { type: mongoose.Schema.Types.ObjectId, ref: 'Credit' },
   
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // ENHANCED Credit Schema with proper upfront payment tracking
  const creditSchema = new mongoose.Schema({
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    customerName: { type: String, required: true },
    customerPhone: String,
    customerEmail: String,
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, required: true }, // UPDATED: This shows ONLY the remaining balance
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
   
    // NEW: Enhanced upfront payment tracking for credit sales
    upfrontPaymentAmount: { type: Number, default: 0 },
    upfrontPaymentMethod: String,
    upfrontPaymentSplit: {
      cash: { type: Number, default: 0 },
      bank_mpesa: { type: Number, default: 0 }
    },
   
    // NEW: Immediate revenue from upfront payment
    immediateRevenue: { type: Number, default: 0 },
   
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  });

  // User Schema (for admin)
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

  // Index for automatic expiration
  secureCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  // Create or get models
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

let models = {};

// ==================== EMAIL CONFIGURATION ====================

const createEmailTransporter = () => {
  try {
    const emailUser = process.env.EMAIL_USER || 'davidwgrey14@gmail.com';
    const emailPass = process.env.EMAIL_PASSWORD || 'your-gmail-password';

    console.log('📧 Configuring email transporter...');
   
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
    throw error;
  }
};

let emailTransporter = null;

const initializeEmail = async () => {
  try {
    emailTransporter = createEmailTransporter();
    await emailTransporter.verify();
    console.log('✅ Email transporter is ready and verified');
    return true;
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    console.log('⚠️ Email functionality will be disabled');
    return false;
  }
};

// ==================== STOCK MONITORING SYSTEM ====================

// Stock notification email function - FIXED SYNTAX ERROR
const sendStockAlertEmail = async (products, alertType) => {
  if (!emailTransporter) {
    console.log('⚠️ Email service not configured - skipping stock alert');
    return false;
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com';
   
    // FIXED: Proper template string syntax
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

    // FIXED: Proper template string syntax for the HTML content
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

// Stock monitoring system
class StockMonitor {
  constructor() {
    this.lastNotificationTime = new Map(); // productId -> last notification time
    this.notificationInterval = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
    this.isMonitoring = false;
  }

  // In your StockMonitor class, enhance the checkStockLevels method
  async checkStockLevels() {
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
       
        console.log(`📦 [STOCK MONITOR] ${product.name}: Stock=${currentStock}, Min=${minStockLevel}`);
       
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
        await this.sendStockNotification(outOfStockProducts, 'out_of_stock');
      } else {
        console.log('✅ [STOCK MONITOR] No out of stock products');
      }

      // Send low stock notifications
      if (lowStockProducts.length > 0) {
        console.log(`📧 [STOCK MONITOR] Sending ${lowStockProducts.length} low stock alerts`);
        await this.sendStockNotification(lowStockProducts, 'low_stock');
      } else {
        console.log('✅ [STOCK MONITOR] No low stock products');
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
  }

  // Send stock notification with rate limiting
  async sendStockNotification(products, alertType) {
    const now = Date.now();
   
    for (const product of products) {
      const lastNotification = this.lastNotificationTime.get(product._id.toString());
     
      // Check if we should send notification (always send for out of stock, respect interval for low stock)
      const shouldSend = alertType === 'out_of_stock' ||
                        !lastNotification ||
                        (now - lastNotification) >= this.notificationInterval;

      if (shouldSend) {
        console.log(`📧 Sending ${alertType} alert for product: ${product.name}`);
       
        const emailSent = await sendStockAlertEmail([product], alertType);
       
        if (emailSent) {
          this.lastNotificationTime.set(product._id.toString(), now);
        }
      } else {
        const hoursSinceLastNotification = Math.floor((now - lastNotification) / (60 * 60 * 1000));
        console.log(`⏰ Skipping ${alertType} notification for ${product.name} - last notification ${hoursSinceLastNotification} hours ago`);
      }
    }

    // Also send batch notification for new out of stock items
    if (alertType === 'out_of_stock') {
      const newOutOfStock = products.filter(product => {
        const lastNotification = this.lastNotificationTime.get(product._id.toString());
        return !lastNotification || (now - lastNotification) >= this.notificationInterval;
      });

      if (newOutOfStock.length > 0) {
        await sendStockAlertEmail(newOutOfStock, alertType);
        newOutOfStock.forEach(product => {
          this.lastNotificationTime.set(product._id.toString(), now);
        });
      }
    }
  }

  // Clear notification history for a product (when stock is updated)
  clearProductNotification(productId) {
    this.lastNotificationTime.delete(productId.toString());
    console.log(`🧹 Cleared notification history for product: ${productId}`);
  }

  // Start monitoring service
  startMonitoring(intervalMinutes = 60) { // Check every hour by default
    if (this.isMonitoring) {
      console.log('⚠️ Stock monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    const intervalMs = intervalMinutes * 60 * 1000;

    // Initial check
    this.checkStockLevels();

    // Periodic checks
    this.monitoringInterval = setInterval(() => {
      this.checkStockLevels();
    }, intervalMs);

    console.log(`🔔 Stock monitoring started (checking every ${intervalMinutes} minutes)`);
  }

  // Stop monitoring service
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.isMonitoring = false;
      console.log('🔕 Stock monitoring stopped');
    }
  }

  // Get monitoring status
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      monitoredProducts: this.lastNotificationTime.size,
      lastNotifications: Array.from(this.lastNotificationTime.entries()).map(([id, time]) => ({
        productId: id,
        lastNotification: new Date(time).toISOString()
      }))
    };
  }
}

// Create global stock monitor instance
const stockMonitor = new StockMonitor();

// ==================== STOCK MONITORING DEBUG ENDPOINTS ====================

// Test stock alert email directly
app.post('/api/stock/test-email', async (req, res) => {
  try {
    const { alertType = 'low_stock' } = req.body;
   
    console.log('📧 TEST: Starting stock alert email test...');
   
    // Get a sample product for testing
    const sampleProduct = await models.Product.findOne({ isActive: true })
      .populate('shop', 'name location')
      .lean();

    if (!sampleProduct) {
      console.log('❌ TEST: No active products found');
      return res.status(404).json({
        success: false,
        message: 'No active products found for testing'
      });
    }

    const testProduct = {
      ...sampleProduct,
      shopName: sampleProduct.shop?.name || sampleProduct.shopName || 'Test Shop'
    };

    console.log('📧 TEST: Sending stock alert email for:', {
      product: testProduct.name,
      stock: testProduct.currentStock,
      minLevel: testProduct.minStockLevel,
      alertType: alertType
    });
   
    const emailSent = await sendStockAlertEmail([testProduct], alertType);
   
    if (emailSent) {
      console.log('✅ TEST: Stock alert email sent successfully');
      res.json({
        success: true,
        message: `Test ${alertType} alert sent successfully for ${testProduct.name}`,
        product: {
          name: testProduct.name,
          currentStock: testProduct.currentStock,
          minStockLevel: testProduct.minStockLevel
        }
      });
    } else {
      console.log('❌ TEST: Failed to send stock alert email');
      res.status(500).json({
        success: false,
        message: 'Failed to send test email - check server logs'
      });
    }
  } catch (error) {
    console.error('❌ TEST: Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
});
// Add this debug endpoint to check collections and auth state
app.get('/api/debug/collections', async (req, res) => {
  try {
    console.log('🔍 Checking database collections...');
    
    // Check connection state
    const isConnected = mongoose.connection.readyState === 1;
    
    // Get collection names
    let collections = [];
    let collectionNames = [];
    let counts = {};
    
    if (isConnected) {
      collections = await mongoose.connection.db.listCollections().toArray();
      collectionNames = collections.map(c => c.name);
      
      // Get counts for each collection
      for (const name of collectionNames) {
        try {
          counts[name] = await mongoose.connection.db.collection(name).countDocuments();
        } catch (err) {
          counts[name] = 'Error';
        }
      }
    }
    
    // Check models
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
    
    // Get users (if model exists)
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
// Check monitored products details
app.get('/api/stock/monitored-products', async (req, res) => {
  try {
    const status = stockMonitor.getStatus();
    const monitoredProductIds = status.lastNotifications.map(n => n.productId);
   
    console.log('📋 Getting monitored products:', monitoredProductIds);
   
    const monitoredProducts = await models.Product.find({
      _id: { $in: monitoredProductIds }
    }).populate('shop', 'name location');
   
    const productDetails = monitoredProducts.map(p => ({
      id: p._id,
      name: p.name,
      currentStock: p.currentStock,
      minStockLevel: p.minStockLevel,
      shopName: p.shop?.name || p.shopName,
      status: (p.currentStock || 0) === 0 ? 'out_of_stock' :
             (p.currentStock || 0) <= (p.minStockLevel || 5) ? 'low_stock' : 'normal'
    }));
   
    console.log('📋 MONITORED PRODUCTS DETAILS:', productDetails);
   
    res.json({
      success: true,
      data: productDetails,
      totalMonitored: productDetails.length
    });
  } catch (error) {
    console.error('Error getting monitored products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get monitored products',
      error: error.message
    });
  }
});

// Check email configuration status
app.get('/api/debug/email-status', async (req, res) => {
  try {
    const emailStatus = {
      isConfigured: !!emailTransporter,
      adminEmail: process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com',
      emailUser: process.env.EMAIL_USER,
      hasEmailPassword: !!process.env.EMAIL_PASSWORD,
      appName: process.env.APP_NAME || 'Shop Management'
    };
   
    console.log('📧 EMAIL CONFIGURATION CHECK:', emailStatus);
   
    // Test email connection if transporter exists
    if (emailTransporter) {
      try {
        await emailTransporter.verify();
        emailStatus.connection = 'verified';
        emailStatus.verifiedAt = new Date().toISOString();
        console.log('✅ Email transporter verified successfully');
      } catch (verifyError) {
        emailStatus.connection = 'failed';
        emailStatus.verifyError = verifyError.message;
        console.error('❌ Email verification failed:', verifyError);
      }
    } else {
      emailStatus.connection = 'no_transporter';
      console.log('❌ No email transporter configured');
    }
   
    res.json({
      success: true,
      data: emailStatus
    });
  } catch (error) {
    console.error('Error checking email status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check email status',
      error: error.message
    });
  }
});

// Manual stock check with detailed logging
app.post('/api/stock/check-now-detailed', async (req, res) => {
  try {
    console.log('🔍 MANUAL STOCK CHECK WITH DETAILS TRIGGERED');
   
    const products = await models.Product.find({ isActive: true })
      .populate('shop', 'name location')
      .lean();

    console.log(`📊 Found ${products.length} active products`);
   
    const outOfStockProducts = [];
    const lowStockProducts = [];

    products.forEach(product => {
      const currentStock = product.currentStock || 0;
      const minStockLevel = product.minStockLevel || 5;
     
      console.log(`📦 ${product.name}: Stock=${currentStock}, Min=${minStockLevel}, Low=${currentStock <= minStockLevel}, Out=${currentStock === 0}`);
     
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

    console.log(`🚨 Stock Check Results: ${outOfStockProducts.length} out of stock, ${lowStockProducts.length} low stock`);
   
    // Send alerts
    if (outOfStockProducts.length > 0) {
      console.log(`📧 Sending ${outOfStockProducts.length} out of stock alerts`);
      await stockMonitor.sendStockNotification(outOfStockProducts, 'out_of_stock');
    }
   
    if (lowStockProducts.length > 0) {
      console.log(`📧 Sending ${lowStockProducts.length} low stock alerts`);
      await stockMonitor.sendStockNotification(lowStockProducts, 'low_stock');
    }

    res.json({
      success: true,
      data: {
        outOfStock: outOfStockProducts.length,
        lowStock: lowStockProducts.length,
        totalProducts: products.length,
        outOfStockProducts: outOfStockProducts.map(p => p.name),
        lowStockProducts: lowStockProducts.map(p => p.name),
        timestamp: new Date().toISOString()
      },
      message: `Manual stock check completed: ${outOfStockProducts.length} out of stock, ${lowStockProducts.length} low stock`
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

// ==================== SECURE CODE AUTHENTICATION ====================

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
          Stanzo Bar Management - Secure Login
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

  // Calculate COGS for transactions array - includes complete sales + credit sales made
  calculateCOGS: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
   
    return transactions.reduce((sum, transaction) => {
      const cost = CalculationUtils.safeNumber(transaction.cost);
      return sum + cost;
    }, 0);
  },

  // Calculate revenue with proper upfront payment recognition
  calculateRevenue: (transactions) => {
    if (!Array.isArray(transactions)) return 0;
   
    return transactions.reduce((sum, transaction) => {
      // For credit payments, use the payment amount as revenue
      if (transaction.isCreditPayment) {
        return sum + CalculationUtils.safeNumber(transaction.totalAmount);
      }
     
      // For regular transactions, use recognized revenue (includes immediate revenue for credit sales)
      return sum + CalculationUtils.safeNumber(transaction.recognizedRevenue || transaction.immediateRevenue || transaction.totalAmount);
    }, 0);
  },

  // Calculate cost from items with product data integration
  calculateCostFromItems: async (transaction, products = []) => {
    try {
      // If cost is already provided and valid, use it
      if (transaction.cost && CalculationUtils.safeNumber(transaction.cost) > 0) {
        return CalculationUtils.safeNumber(transaction.cost);
      }
     
      if (transaction.totalCost && CalculationUtils.safeNumber(transaction.totalCost) > 0) {
        return CalculationUtils.safeNumber(transaction.totalCost);
      }

      // Calculate cost from items
      if (transaction.items && Array.isArray(transaction.items)) {
        let totalCost = 0;
       
        for (const item of transaction.items) {
          const quantity = CalculationUtils.safeNumber(item.quantity, 1);
         
          // Try to get cost from different sources in priority order
          let itemCost = 0;
         
          // Priority 1: Direct cost field in item
          if (item.cost && CalculationUtils.safeNumber(item.cost) > 0) {
            itemCost = CalculationUtils.safeNumber(item.cost);
          }
          // Priority 2: Buying price field in item
          else if (item.buyingPrice && CalculationUtils.safeNumber(item.buyingPrice) > 0) {
            itemCost = CalculationUtils.safeNumber(item.buyingPrice);
          }
          // Priority 3: Look up product buying price from products array
          else if (item.productId && products.length > 0) {
            const product = products.find(p =>
              p._id && item.productId &&
              (p._id.toString() === item.productId.toString() ||
               (p._id && item.productId._id && p._id.toString() === item.productId._id.toString()))
            );
           
            if (product) {
              itemCost = CalculationUtils.safeNumber(product.buyingPrice);
            }
          }
          // Priority 4: Use a default cost estimation (30% of price as fallback)
          else if (item.price && CalculationUtils.safeNumber(item.price) > 0) {
            itemCost = CalculationUtils.safeNumber(item.price) * 0.3; // Estimate 30% cost
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

  // Process single transaction with comprehensive upfront payment tracking
  processSingleTransaction: async (transaction, products = []) => {
    try {
      if (!transaction) return CalculationUtils.createFallbackTransaction();

      // Handle credit payments differently
      if (transaction.isCreditPayment) {
        return {
          ...transaction,
          totalAmount: CalculationUtils.safeNumber(transaction.totalAmount),
          cost: 0, // Credit payments don't have COGS
          profit: CalculationUtils.safeNumber(transaction.totalAmount), // Profit equals payment amount
          profitMargin: 100, // 100% profit margin for payments
          isCreditTransaction: false,
          isCreditPayment: true,
          recognizedRevenue: CalculationUtils.safeNumber(transaction.totalAmount),
          outstandingRevenue: 0,
          amountPaid: CalculationUtils.safeNumber(transaction.totalAmount),
          immediateRevenue: CalculationUtils.safeNumber(transaction.totalAmount), // Track immediate revenue
          creditStatus: null,
          itemsCount: 0, // Credit payments don't have items
          displayDate: transaction.displayDate ||
                      new Date(transaction.saleDate || transaction.createdAt).toLocaleString('en-KE'),
          _processedAt: new Date().toISOString(),
          _isValid: true
        };
      }

      // Multiple ways to detect credit transactions
      const isCredit = transaction.paymentMethod === 'credit' ||
                      transaction.isCredit === true ||
                      transaction.transactionType === 'credit' ||
                      transaction.isCreditTransaction === true ||
                      transaction.status === 'credit';
     
      // Use server-calculated values when available, otherwise calculate
      const totalAmount = CalculationUtils.safeNumber(transaction.totalAmount) ||
                         CalculationUtils.safeNumber(transaction.amount) || 0;
     
      // Use the new cost calculation function with products data
      const cost = await CalculationUtils.calculateCostFromItems(transaction, products);
     
      // Credit management revenue recognition logic
      const amountPaid = CalculationUtils.safeNumber(transaction.amountPaid) ||
                        CalculationUtils.safeNumber(transaction.paidAmount) || 0;
     
      // For credit transactions, recognized revenue is the amount paid immediately
      const recognizedRevenue = isCredit ? amountPaid : totalAmount;
     
      const outstandingRevenue = isCredit ?
        (CalculationUtils.safeNumber(transaction.outstandingRevenue) ||
         CalculationUtils.safeNumber(transaction.balanceDue) ||
         Math.max(0, totalAmount - amountPaid)) : 0;

      // Track immediate revenue (INCLUDES UPFRONT PAYMENTS)
      const immediateRevenue = isCredit ? amountPaid : totalAmount;

      // Calculate profit metrics based on recognized revenue
      const profit = CalculationUtils.calculateProfit(recognizedRevenue, cost);
      const profitMargin = CalculationUtils.calculateProfitMargin(recognizedRevenue, profit);

      // Enhanced date handling
      const saleDate = transaction.saleDate || transaction.createdAt || transaction.date;
      const displayDate = transaction.displayDate ||
                         (saleDate ? new Date(saleDate).toLocaleString('en-KE') : 'Date Unknown');

      // Determine credit status
      let creditStatus = 'completed';
      if (isCredit) {
        if (outstandingRevenue <= 0) {
          creditStatus = 'paid';
        } else if (amountPaid > 0) {
          creditStatus = 'partially_paid';
        } else {
          creditStatus = 'pending';
        }
       
        // Check if overdue
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
        immediateRevenue, // Track immediate revenue including upfront payments
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

  // Process comprehensive data with proper upfront payment revenue recognition
  processComprehensiveData: async (rawData, selectedShop) => {
    const transactions = rawData.transactions || [];
    const expenses = rawData.expenses || [];
    const credits = rawData.credits || [];
    const products = rawData.products || [];
    const shops = rawData.shops || [];
    const cashiers = rawData.cashiers || [];

    console.log('🔄 Processing comprehensive data with enhanced upfront payment support...', {
      transactions: transactions.length,
      products: products.length
    });

    // Enhanced sales with profit calculation using the new processSingleTransaction
    const salesWithProfit = await Promise.all(
      transactions.map(transaction =>
        CalculationUtils.processSingleTransaction(transaction, products)
      )
    );

    // Filter transactions based on shop if provided
    const filteredTransactions = selectedShop && selectedShop !== 'all' ?
      salesWithProfit.filter(t =>
        t.shop === selectedShop || t.shopId === selectedShop
      ) : salesWithProfit;

    // Calculate all required metrics
    const totalTransactions = filteredTransactions.length;
    const creditTransactions = filteredTransactions.filter(t => t.isCreditTransaction);
    const nonCreditTransactions = filteredTransactions.filter(t => !t.isCreditTransaction);
    const creditPayments = filteredTransactions.filter(t => t.isCreditPayment);

    // REVENUE CALCULATIONS: Use immediateRevenue which includes upfront payments
    const totalRevenue = CalculationUtils.calculateRevenue(filteredTransactions);
    const creditSales = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const nonCreditSales = nonCreditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const creditPaymentRevenue = creditPayments.reduce((sum, t) => sum + t.totalAmount, 0);
   
    // COGS CALCULATION: Sum up all transaction costs (both complete + credit sales)
    const costOfGoodsSold = CalculationUtils.calculateCOGS(filteredTransactions);
   
    const grossProfit = totalRevenue - costOfGoodsSold;
   
    // Expense calculations
    const totalExpenses = expenses.reduce((sum, e) => sum + CalculationUtils.safeNumber(e.amount), 0);
    const netProfit = grossProfit - totalExpenses;
   
    // PAYMENT METHOD CALCULATIONS: Include upfront payments in cash/bank_mpesa
    let totalCash = 0;
    let totalMpesaBank = 0;
    let totalCredit = 0;

    filteredTransactions.forEach(transaction => {
      // Use paymentSplit if available (includes upfront payments for credit sales)
      if (transaction.paymentSplit) {
        totalCash += CalculationUtils.safeNumber(transaction.paymentSplit.cash);
        totalMpesaBank += CalculationUtils.safeNumber(transaction.paymentSplit.bank_mpesa);
        totalCredit += CalculationUtils.safeNumber(transaction.paymentSplit.credit);
      } else {
        // Fallback calculation based on paymentMethod
        if (transaction.paymentMethod === 'cash') {
          totalCash += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transaction.paymentMethod)) {
          totalMpesaBank += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (transaction.paymentMethod === 'credit') {
          totalCredit += CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue);
        } else if (transaction.paymentMethod === 'cash_bank_mpesa') {
          // Split evenly as fallback
          const half = CalculationUtils.safeNumber(transaction.immediateRevenue || transaction.recognizedRevenue) / 2;
          totalCash += half;
          totalMpesaBank += half;
        }
      }
    });
   
    // CREDIT CALCULATIONS: outstandingCredit shows only remaining balance
    const outstandingCredit = credits
      .filter(credit => credit.status !== 'paid' &&
        (!selectedShop || selectedShop === 'all' ||
         credit.shop === selectedShop || credit.shopId === selectedShop))
      .reduce((sum, credit) => sum + CalculationUtils.safeNumber(credit.balanceDue), 0);
   
    const totalCreditGiven = creditTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
    const recognizedCreditRevenue = creditTransactions.reduce((sum, t) => sum + t.recognizedRevenue, 0);
    const immediateRevenueTotal = filteredTransactions.reduce((sum, t) => sum + (t.immediateRevenue || 0), 0);

    // Enhanced financial stats matching the image requirements
    const financialStats = {
      // Core metrics from image
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

      // NEW: Immediate revenue tracking
      immediateRevenue: immediateRevenueTotal,

      // Additional detailed metrics
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

      // COGS breakdown for analysis
      cogsBreakdown: {
        total: costOfGoodsSold,
        fromCreditSales: CalculationUtils.calculateCOGS(creditTransactions),
        fromCompleteSales: CalculationUtils.calculateCOGS(nonCreditTransactions),
        fromCreditPayments: CalculationUtils.calculateCOGS(creditPayments)
      },

      // Metadata
      _cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
      _revenueCalculation: 'immediate_revenue_includes_upfront_payments',
      _paymentTracking: 'payment_split_enhanced_with_upfront',
      _upfrontPaymentSupport: true,
      _calculatedAt: new Date().toISOString()
    };

    console.log('💰 Final Financial Calculation with Upfront Payments:', {
      totalTransactions,
      totalRevenue,
      immediateRevenue: immediateRevenueTotal,
      costOfGoodsSold,
      grossProfit,
      netProfit,
      totalCash,
      totalMpesaBank,
      outstandingCredit,
      creditPaymentRevenue
    });

    // Sales performance summary
    const salesPerformanceSummary = {
      totalSales: financialStats.totalSales,
      creditSales: financialStats.creditSalesCount,
      creditPayments: financialStats.creditPaymentsCount,
      nonCreditSales: financialStats.nonCreditSalesCount,
      totalRevenue: financialStats.totalRevenue,
      creditSalesRevenue: financialStats.creditSales,
      creditPaymentRevenue: financialStats.creditPaymentRevenue,
      nonCreditSalesRevenue: financialStats.nonCreditSales,
      totalExpenses: financialStats.totalExpenses,
      grossProfit: financialStats.grossProfit,
      netProfit: financialStats.netProfit,
      costOfGoodsSold: financialStats.costOfGoodsSold,
      totalMpesaBank: financialStats.totalMpesaBank,
      totalCash: financialStats.totalCash,
      outstandingCredit: financialStats.outstandingCredit,
      totalCreditGiven: financialStats.totalCreditGiven,
      immediateRevenue: financialStats.immediateRevenue,
      _cogsMethodology: 'complete_sales_plus_credit_sales_made_exclude_payments',
      _revenueMethodology: 'immediate_revenue_includes_upfront_payments',
      _upfrontPaymentSupport: true
    };

    // Calculate top products
    const topProducts = CalculationUtils.calculateTopProducts(filteredTransactions, 10);
   
    // Calculate shop performance
    const shopPerformance = CalculationUtils.calculateShopPerformance(filteredTransactions, shops);

    return {
      salesWithProfit: filteredTransactions,
      financialStats,
      salesPerformanceSummary,
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

// Add this to check if monitoring is active
app.get('/api/stock/monitoring/status', async (req, res) => {
  try {
    const status = stockMonitor.getStatus();
    console.log('📊 Stock Monitoring Status:', status);
   
    res.json({
      success: true,
      data: status,
      isMonitoring: stockMonitor.isMonitoring,
      lastCheck: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting monitoring status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get monitoring status',
      error: error.message
    });
  }
});

// Debug endpoint to check product data
app.get('/api/debug/products-stock', async (req, res) => {
  try {
    const products = await models.Product.find({ isActive: true })
      .populate('shop', 'name location')
      .lean();

    const stockAnalysis = products.map(p => ({
      name: p.name,
      currentStock: p.currentStock,
      minStockLevel: p.minStockLevel,
      shopName: p.shop?.name || p.shopName,
      isLowStock: (p.currentStock || 0) <= (p.minStockLevel || 5),
      isOutOfStock: (p.currentStock || 0) === 0
    }));

    console.log('📦 Product Stock Analysis:', stockAnalysis);

    res.json({
      success: true,
      data: stockAnalysis,
      totalProducts: products.length,
      lowStockCount: stockAnalysis.filter(p => p.isLowStock && !p.isOutOfStock).length,
      outOfStockCount: stockAnalysis.filter(p => p.isOutOfStock).length
    });
  } catch (error) {
    console.error('Error analyzing product stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze product stock',
      error: error.message
    });
  }
});

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
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
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

// ==================== DATABASE CONNECTION ====================

let isConnected = false;
let connectionRetryCount = 0;
const MAX_RETRY_COUNT = 3;

// MOVE createDefaultAdmin function HERE, before connectDB
const createDefaultAdmin = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'davidwgrey14@gmail.com';
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    
    console.log(`👤 Setting up default admin: ${adminEmail}`);
    
    // Check if admin already exists
    const existingAdmin = await models.User.findOne({ email: adminEmail });
    
    if (existingAdmin) {
      console.log('✅ Admin user already exists:', {
        email: existingAdmin.email,
        name: existingAdmin.name,
        role: existingAdmin.role
      });
      
      // Update last login timestamp
      existingAdmin.lastLogin = new Date();
      await existingAdmin.save();
      return existingAdmin;
    }

    // Create new admin user
    const adminUser = await models.User.create({
      email: adminEmail,
      name: adminName,
      role: 'admin',
      isActive: true,
      lastLogin: new Date()
    });

    console.log('✅ Default admin user created successfully:', {
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
      id: adminUser._id
    });

    return adminUser;
    
  } catch (error) {
    console.error('❌ Error creating default admin user:', error.message);
    
    // Don't crash the app if admin creation fails
    console.log('⚠️ Application will continue without default admin user');
    return null;
  }
};

const connectDB = async () => {
  try {
    // Prevent multiple connection attempts
    if (isConnected) {
      console.log('✅ MongoDB already connected');
      return;
    }

    const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017/stanzo_db';
    
    console.log('🔗 Connecting to MongoDB...');
    console.log(`📊 Connection attempt: ${connectionRetryCount + 1}/${MAX_RETRY_COUNT}`);
    console.log(`📍 Database: ${connectionString.split('@').pop() || connectionString}`);

    const connectionOptions = {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50,
      minPoolSize: 10,
      retryWrites: true,
      retryReads: true,
      bufferCommands: false,
      connectTimeoutMS: 30000,
      heartbeatFrequencyMS: 10000,
      maxIdleTimeMS: 30000
    };

    console.log('⚙️ Using optimized connection options:', {
      serverSelectionTimeoutMS: connectionOptions.serverSelectionTimeoutMS,
      maxPoolSize: connectionOptions.maxPoolSize,
      minPoolSize: connectionOptions.minPoolSize,
      bufferCommands: connectionOptions.bufferCommands
    });

    // Set up MongoDB connection events
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB connected successfully');
      isConnected = true;
      connectionRetryCount = 0;
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
      isConnected = true;
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        console.log('🛑 MongoDB connection closed through app termination');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
        process.exit(1);
      }
    });

    // Attempt connection
    await mongoose.connect(connectionString, connectionOptions);
    
    // Verify connection
    await mongoose.connection.db.admin().ping();
    console.log('🏓 MongoDB ping successful - connection verified');

    // Initialize models
    models = createModels();
    console.log('📦 Database models initialized');

    // Initialize email service
    const emailInitialized = await initializeEmail();
    if (emailInitialized) {
      console.log('📧 Email service initialized successfully');
    } else {
      console.log('⚠️ Email service initialization failed - running in limited mode');
    }

    // Create default admin - NOW THIS WILL WORK
    await createDefaultAdmin();
    
    console.log('🎉 Database initialization completed successfully');
    
  } catch (error) {
    connectionRetryCount++;
    console.error(`❌ MongoDB connection failed (attempt ${connectionRetryCount}/${MAX_RETRY_COUNT}):`, error.message);
    
    // Retry logic with exponential backoff
    if (connectionRetryCount < MAX_RETRY_COUNT) {
      const retryDelay = Math.min(1000 * Math.pow(2, connectionRetryCount), 30000);
      console.log(`🔄 Retrying connection in ${retryDelay / 1000} seconds...`);
      
      setTimeout(() => {
        connectDB().catch(err => {
          console.error('❌ Retry failed:', err.message);
        });
      }, retryDelay);
    } else {
      console.error('💥 Maximum connection retries reached. Exiting application.');
      process.exit(1);
    }
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

    console.log('📊 Fetching optimized transaction data with filters:', filters);

    // Build filter more efficiently
    let filter = {
      status: { $in: ['completed', 'credit'] }
    };

    // Date filter - only apply if dates are provided
    if (startDate && endDate) {
      filter.saleDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Shop filter
    if (shopId && shopId !== 'all') {
      filter.$or = [
        { shop: shopId },
        { shopId: shopId }
      ];
    }

    // OPTIMIZATION: Use lean() and select only necessary fields
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
        .maxTimeMS(30000), // 30 second timeout for this query
      
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

    console.log(`✅ Optimized data fetched: ${transactions.length} transactions`);

    // Process data
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

// ==================== UPDATED TRANSACTION CREATION WITH PROPER UPFRONT PAYMENT SUPPORT ====================

app.post('/api/transactions', async (req, res) => {
  try {
    const transactionData = req.body;
   
    console.log('💳 Creating transaction with enhanced upfront payment support:', {
      paymentMethod: transactionData.paymentMethod,
      totalAmount: transactionData.totalAmount,
      amountPaidNow: transactionData.amountPaidNow,
      isCreditPayment: transactionData.isCreditPayment,
      originalCreditId: transactionData.originalCreditId,
      upfrontPaymentMethod: transactionData.upfrontPaymentMethod,
      upfrontPaymentAmount: transactionData.upfrontPaymentAmount
    });

    // Check for duplicate transaction
    if (transactionData.transactionNumber) {
      const existingTransaction = await models.Transaction.findOne({
        transactionNumber: transactionData.transactionNumber
      });
     
      if (existingTransaction) {
        console.log('⚠️ Duplicate transaction detected:', transactionData.transactionNumber);
        return res.status(409).json({
          success: false,
          message: 'Transaction with this number already exists'
        });
      }
    }

    // Handle credit payment (part payment of existing credit)
    if (transactionData.isCreditPayment && transactionData.originalCreditId) {
      return await handleCreditPayment(transactionData, res);
    }

    // Auto-populate shop and cashier information
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

    // Calculate detailed metrics for each item and reduce stock
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

      // REDUCE STOCK FOR THE PRODUCT (only for new sales, not credit payments)
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

            // Check if stock is now low or out of stock
            const minStockLevel = CalculationUtils.safeNumber(product.minStockLevel || 5);
            if (newStock === 0 || newStock <= minStockLevel) {
              const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';
              await sendStockAlertEmail([{
                ...product.toObject(),
                shopName: product.shop?.name || product.shopName || 'Unknown Shop'
              }], alertType);
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

    // Handle credit transactions with upfront payment support
    const amountPaidNow = CalculationUtils.safeNumber(transactionData.amountPaidNow) || 0;
    const isCreditTransaction = transactionData.paymentMethod === 'credit';
   
    let recognizedRevenue = totalAmount;
    let outstandingRevenue = 0;
    let amountPaid = totalAmount;
    let creditStatus = 'completed';
    let immediateRevenue = totalAmount; // Default for non-credit transactions

    if (isCreditTransaction) {
      // For credit sales with partial payment
      amountPaid = amountPaidNow;
      recognizedRevenue = amountPaidNow; // Only recognize what's paid immediately
      outstandingRevenue = Math.max(0, totalAmount - amountPaidNow);
      immediateRevenue = amountPaidNow; // Immediate revenue is the upfront payment
     
      // Determine credit status based on payment
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

    // Payment split tracking with upfront payment support
    transactionData.paymentSplit = {
      cash: 0,
      bank_mpesa: 0,
      credit: 0
    };

    // Handle credit transactions with upfront payment
    if (isCreditTransaction) {
      transactionData.isCreditTransaction = true;
      transactionData.creditStatus = creditStatus;
      transactionData.recognizedRevenue = recognizedRevenue;
      transactionData.outstandingRevenue = outstandingRevenue;
      transactionData.amountPaid = amountPaid;
      transactionData.status = 'credit';
     
      // Track immediate revenue for cashier dashboard (UPFRONT PAYMENT)
      transactionData.immediateRevenue = immediateRevenue;
     
      // Store credit shop classification
      transactionData.creditShopName = transactionData.creditShopName || transactionData.shopName;
      transactionData.creditShopId = transactionData.creditShopId || transactionData.shopId;
      transactionData.shopClassification = transactionData.shopClassification || transactionData.shopName;
     
      // Upfront payment tracking
      transactionData.upfrontPaymentAmount = amountPaidNow;
      transactionData.upfrontPaymentMethod = transactionData.upfrontPaymentMethod || 'cash';
     
      if (transactionData.upfrontPaymentSplit) {
        transactionData.upfrontPaymentSplit = transactionData.upfrontPaymentSplit;
      }
     
      // PAYMENT SPLIT LOGIC: Upfront payment goes to cash/bank_mpesa, only balance to credit
      if (amountPaidNow > 0) {
        // For credit sales with upfront payment, track the payment method
        if (transactionData.upfrontPaymentMethod === 'cash') {
          transactionData.paymentSplit.cash = amountPaidNow;
        } else if (transactionData.upfrontPaymentMethod === 'bank_mpesa') {
          transactionData.paymentSplit.bank_mpesa = amountPaidNow;
        } else if (transactionData.upfrontPaymentMethod === 'cash_bank_mpesa' && transactionData.upfrontPaymentSplit) {
          transactionData.paymentSplit.cash = CalculationUtils.safeNumber(transactionData.upfrontPaymentSplit.cash);
          transactionData.paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.upfrontPaymentSplit.bank_mpesa);
        }
        // CREDIT UPDATE: Only show the remaining balance (outstandingRevenue) on credit side
        transactionData.paymentSplit.credit = outstandingRevenue;
      } else {
        // No upfront payment, entire amount is credit
        transactionData.paymentSplit.credit = totalAmount;
      }
     
      // Set due date if not provided (default 30 days)
      if (!transactionData.dueDate) {
        transactionData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      // Non-credit transactions
      transactionData.isCreditTransaction = false;
      transactionData.recognizedRevenue = recognizedRevenue;
      transactionData.outstandingRevenue = 0;
      transactionData.amountPaid = amountPaid;
      transactionData.status = 'completed';
      transactionData.immediateRevenue = immediateRevenue;
     
      // Update payment split for non-credit transactions
      if (transactionData.paymentMethod === 'cash') {
        transactionData.paymentSplit.cash = totalAmount;
      } else if (['mpesa', 'bank', 'card', 'bank_mpesa'].includes(transactionData.paymentMethod)) {
        transactionData.paymentSplit.bank_mpesa = totalAmount;
      } else if (transactionData.paymentMethod === 'cash_bank_mpesa' && transactionData.paymentSplit) {
        // Use provided split
        transactionData.paymentSplit.cash = CalculationUtils.safeNumber(transactionData.paymentSplit.cash);
        transactionData.paymentSplit.bank_mpesa = CalculationUtils.safeNumber(transactionData.paymentSplit.bank_mpesa);
      }
    }

    // Generate transaction number if not provided
    if (!transactionData.transactionNumber) {
      transactionData.transactionNumber = `TXN-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 5)}`;
    }

    const transaction = new models.Transaction(transactionData);
    await transaction.save();
   
    await transaction.populate('shop', 'name location type');
    await transaction.populate('cashierId', 'name email');
    await transaction.populate('items.productId', 'name buyingPrice');

    // Create credit record ONLY if this is a credit transaction AND doesn't already exist
    if (isCreditTransaction && !transactionData.isCreditPayment) {
      // Check if credit record already exists to prevent duplication
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
          balanceDue: outstandingRevenue, // This now shows only the remaining balance
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
         
          // Enhanced upfront payment tracking
          upfrontPaymentAmount: amountPaidNow,
          upfrontPaymentMethod: transactionData.upfrontPaymentMethod || 'cash',
          upfrontPaymentSplit: transactionData.upfrontPaymentSplit || {
            cash: 0,
            bank_mpesa: 0
          },
          // Immediate revenue from upfront payment
          immediateRevenue: amountPaidNow
        };

        // Add initial payment to history if partial payment was made
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
          balanceDue: credit.balanceDue, // This now shows only the remaining balance
          status: credit.status,
          upfrontPaymentAmount: credit.upfrontPaymentAmount,
          upfrontPaymentMethod: credit.upfrontPaymentMethod,
          immediateRevenue: credit.immediateRevenue
        });
      } else {
        console.log('⚠️ Credit record already exists for transaction:', transaction._id);
      }
    }

    console.log('✅ Transaction created successfully with upfront payment support:', {
      transactionId: transaction._id,
      totalAmount: totalAmount,
      amountPaid: amountPaid,
      recognizedRevenue: recognizedRevenue,
      outstandingRevenue: outstandingRevenue, // This is what will be displayed on credit side
      immediateRevenue: transactionData.immediateRevenue, // Includes upfront payments
      cost: totalCost,
      profit: profit,
      paymentMethod: transactionData.paymentMethod,
      isCredit: isCreditTransaction,
      paymentSplit: transactionData.paymentSplit, // Credit side now only shows balance due
      upfrontPaymentAmount: transactionData.upfrontPaymentAmount,
      upfrontPaymentMethod: transactionData.upfrontPaymentMethod,
      itemsSold: transactionData.itemsCount
    });

    res.status(201).json({
      success: true,
      data: transaction,
      message: `Transaction created successfully${isCreditTransaction ? ' with credit record' : ''}`,
      creditDetails: isCreditTransaction ? {
        totalAmount,
        amountPaid: amountPaidNow,
        balanceDue: outstandingRevenue, // Show only balance due
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

// Handle credit payment (part payment of existing credit)
async function handleCreditPayment(transactionData, res) {
  try {
    console.log('💰 Processing credit payment:', {
      originalCreditId: transactionData.originalCreditId,
      paymentAmount: transactionData.totalAmount,
      paymentMethod: transactionData.paymentMethod
    });

    // Find the original credit record
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

    // Update the credit record
    originalCredit.amountPaid = newAmountPaid;
    originalCredit.balanceDue = newBalanceDue; // This now shows only the remaining balance
   
    // Update status
    let newStatus = originalCredit.status;
    if (newBalanceDue <= 0) {
      newStatus = 'paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partially_paid';
    }
    originalCredit.status = newStatus;

    // Add payment to history
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

    // Update the original transaction
    if (originalCredit.transactionId) {
      await models.Transaction.findByIdAndUpdate(originalCredit.transactionId, {
        amountPaid: newAmountPaid,
        recognizedRevenue: newAmountPaid,
        outstandingRevenue: newBalanceDue, // This now shows only the remaining balance
        creditStatus: newStatus,
        updatedAt: new Date()
      });
    }

    // Enhanced payment split for credit payments
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

    // Create a new transaction record for the payment
    const paymentTransactionData = {
      ...transactionData,
      isCreditPayment: true,
      originalCreditId: originalCredit._id,
      transactionNumber: `PAY-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 5)}`,
      // For credit payments, the revenue should be recognized immediately
      recognizedRevenue: paymentAmount,
      outstandingRevenue: 0,
      amountPaid: paymentAmount,
      immediateRevenue: paymentAmount, // Track immediate revenue
      isCreditTransaction: false, // This is a payment, not a new credit
      creditStatus: null,
      status: 'completed',
      paymentSplit: paymentSplit // Include payment split
    };

    const paymentTransaction = new models.Transaction(paymentTransactionData);
    await paymentTransaction.save();

    console.log('✅ Credit payment processed successfully:', {
      creditId: originalCredit._id,
      paymentAmount,
      newAmountPaid,
      newBalanceDue, // This now shows only the remaining balance
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

// ==================== STOCK MONITORING ENDPOINTS ====================

// Manual stock check endpoint
app.post('/api/stock/check-now', async (req, res) => {
  try {
    const result = await stockMonitor.checkStockLevels();
   
    res.json({
      success: true,
      data: result,
      message: `Stock check completed: ${result.outOfStock} out of stock, ${result.lowStock} low stock`
    });
  } catch (error) {
    console.error('Error in manual stock check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check stock levels',
      error: error.message
    });
  }
});

// Stock monitoring control endpoints
app.post('/api/stock/monitoring/start', async (req, res) => {
  try {
    const { intervalMinutes = 60 } = req.body;
    stockMonitor.startMonitoring(intervalMinutes);
   
    res.json({
      success: true,
      message: `Stock monitoring started (checking every ${intervalMinutes} minutes)`,
      data: stockMonitor.getStatus()
    });
  } catch (error) {
    console.error('Error starting stock monitoring:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start stock monitoring',
      error: error.message
    });
  }
});

app.post('/api/stock/monitoring/stop', async (req, res) => {
  try {
    stockMonitor.stopMonitoring();
   
    res.json({
      success: true,
      message: 'Stock monitoring stopped',
      data: stockMonitor.getStatus()
    });
  } catch (error) {
    console.error('Error stopping stock monitoring:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop stock monitoring',
      error: error.message
    });
  }
});

app.get('/api/stock/monitoring/status', async (req, res) => {
  try {
    res.json({
      success: true,
      data: stockMonitor.getStatus()
    });
  } catch (error) {
    console.error('Error getting monitoring status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get monitoring status',
      error: error.message
    });
  }
});

// Get current stock alerts
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

// ==================== COMPLETE API ENDPOINTS ====================

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
    stockMonitoring: stockMonitor.isMonitoring ? 'active' : 'inactive',
    cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced'
  });
});

// ==================== AUTHENTICATION ROUTES ====================
// Fix SecureCode collection if missing
app.post('/api/debug/fix-securecode', async (req, res) => {
  try {
    console.log('🔧 Attempting to fix SecureCode collection...');
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    let message = '';
    let secureCodeCreated = false;
    
    if (!collectionNames.includes('securecodes')) {
      console.log('⚠️ SecureCode collection not found. Creating it...');
      
      // Create the collection by inserting a temporary document and then deleting it
      const tempCode = new models.SecureCode({
        email: 'temp@temp.com',
        code: 'temp',
        expiresAt: new Date(),
        used: true
      });
      
      await tempCode.save();
      await models.SecureCode.deleteOne({ email: 'temp@temp.com' });
      
      secureCodeCreated = true;
      message = '✅ SecureCode collection created successfully!';
      console.log(message);
    } else {
      message = '✅ SecureCode collection already exists.';
      console.log(message);
    }
    
    // Create indexes
    if (models.SecureCode) {
      await models.SecureCode.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await models.SecureCode.collection.createIndex({ email: 1 });
      console.log('✅ Indexes created on SecureCode collection');
    }
    
    res.json({
      success: true,
      message: message,
      secureCodeCreated: secureCodeCreated,
      collections: collectionNames,
      hasSecureCode: collectionNames.includes('securecodes')
    });
  } catch (error) {
    console.error('❌ Error fixing SecureCode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fix SecureCode',
      error: error.message
    });
  }
});
// Request secure login code
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
// Verify secure login code - COMPLETELY REWRITTEN AND FIXED
app.post('/api/auth/verify-code',
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }).isNumeric()
  ],
  async (req, res) => {
    try {
      // 1. VALIDATE INPUT
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({
          success: false,
          message: 'Invalid input data',
          details: errors.array()
        });
      }

      const { email, code } = req.body;
      console.log('🔐 Secure code verification for:', email);

      // 2. CHECK IF MODELS EXIST
      if (!models.SecureCode) {
        console.error('❌ SecureCode model not initialized');
        return res.status(500).json({
          success: false,
          message: 'System configuration error. Please contact administrator.'
        });
      }

      // 3. FIND SECURE CODE
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
        console.log('⚠️ No secure code found for:', email);
        return res.status(404).json({
          success: false,
          message: 'No secure code found for this email. Please request a new code.'
        });
      }

      // 4. CHECK IF CODE IS EXPIRED
      const now = new Date();
      if (now > secureCode.expiresAt) {
        console.log('⚠️ Secure code expired for:', email);
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

      // 5. CHECK IF CODE IS ALREADY USED
      if (secureCode.used) {
        console.log('⚠️ Secure code already used for:', email);
        return res.status(400).json({
          success: false,
          message: 'Secure code has already been used. Please request a new code.'
        });
      }

      // 6. CHECK ATTEMPTS
      if (secureCode.attempts >= 5) {
        console.log('⚠️ Too many attempts for:', email);
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

      // 7. VERIFY CODE
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
        console.log(`⚠️ Invalid code attempt for ${email}. ${attemptsRemaining} attempts remaining`);
        
        return res.status(400).json({
          success: false,
          message: 'Invalid secure code',
          attemptsRemaining: attemptsRemaining
        });
      }

      // 8. MARK CODE AS USED
      secureCode.used = true;
      try {
        await secureCode.save();
        console.log('✅ Secure code marked as used for:', email);
      } catch (saveError) {
        console.error('❌ Error marking code as used:', saveError);
        // Continue anyway since code was valid
      }

      // 9. FIND USER - CHECK BOTH MODELS WITH ERROR HANDLING
      let user = null;
      let userModelFound = false;

      // Try User model
      if (models.User) {
        try {
          user = await models.User.findOne({ email });
          if (user) {
            userModelFound = true;
            console.log('✅ User found in User model:', email);
          }
        } catch (userError) {
          console.error('❌ Error finding user in User model:', userError);
        }
      }

      // Try Cashier model if user not found
      if (!user && models.Cashier) {
        try {
          user = await models.Cashier.findOne({ email });
          if (user) {
            console.log('✅ User found in Cashier model:', email);
          }
        } catch (cashierError) {
          console.error('❌ Error finding user in Cashier model:', cashierError);
        }
      }

      // 10. HANDLE USER NOT FOUND
      if (!user) {
        console.log('⚠️ No user account found for:', email);
        // Don't delete the secure code to prevent abuse
        return res.status(404).json({
          success: false,
          message: 'User account not found. Please contact administrator.'
        });
      }

      // 11. CHECK IF USER IS ACTIVE
      if (user.isActive === false) {
        console.log('⚠️ User account is inactive:', email);
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact administrator.'
        });
      }

      // 12. UPDATE LAST LOGIN
      try {
        user.lastLogin = new Date();
        await user.save();
        console.log('✅ Last login updated for:', email);
      } catch (updateError) {
        console.error('❌ Error updating last login:', updateError);
        // Continue anyway - this is not critical
      }

      // 13. GENERATE TOKEN
      let token;
      try {
        token = generateAuthToken(
          user._id, 
          user.email, 
          user.role || 'cashier'
        );
        console.log('✅ Token generated for:', email);
      } catch (tokenError) {
        console.error('❌ Error generating token:', tokenError);
        return res.status(500).json({
          success: false,
          message: 'Error generating authentication token. Please try again.'
        });
      }

      // 14. BUILD USER DATA
      const userData = {
        _id: user._id,
        name: user.name || 'User',
        email: user.email,
        role: user.role || 'cashier',
        isActive: user.isActive !== false,
        lastLogin: user.lastLogin || new Date()
      };

      // Add shop info for cashiers
      if (user.role === 'cashier') {
        if (user.shopId) {
          userData.shopId = user.shopId;
        }
        if (user.shopName) {
          userData.shopName = user.shopName;
        }
      }

      // Add admin-specific fields
      if (user.role === 'admin') {
        userData.isAdmin = true;
      }

      // 15. SET SESSION (if session middleware is available)
      try {
        if (req.session) {
          req.session.user = userData;
          req.session.token = token;
          console.log('✅ Session set for:', email);
        } else {
          console.log('⚠️ Session middleware not available');
        }
      } catch (sessionError) {
        console.error('❌ Error setting session:', sessionError);
        // Continue anyway - session is not critical for JWT auth
      }

      // 16. RETURN SUCCESS
      console.log('✅ Secure code verification successful for:', email);
      
      return res.status(200).json({
        success: true,
        user: userData,
        token: token,
        message: 'Login successful'
      });

    } catch (error) {
      // 17. CATCH ANY UNEXPECTED ERRORS
      console.error('❌ Unexpected error in verify-code:', error);
      console.error('❌ Error stack:', error.stack);
      
      return res.status(500).json({
        success: false,
        message: 'An unexpected error occurred. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);
// Cashier login



// Cashier login - UPDATED to check both User and Cashier models
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
    
    // Search in both User and Cashier models
    let user = await models.User.findOne({ 
      email: normalizedEmail,
      role: { $in: ['cashier', 'admin'] }
    });
    
    let cashier = null;
    
    // If not found in User model, try Cashier model
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

    // If found in User model, check if password is set
    if (user) {
      // For User model, we need to check if they have a password
      // Since User model doesn't have password field by default, we need to check
      // if the user was created as a cashier through admin dashboard
      
      // Check if cashier exists with same email
      cashier = await models.Cashier.findOne({ 
        email: normalizedEmail,
        status: 'active'
      }).populate('shopId', 'name location');
      
      // If no cashier record exists, create one from user data
      if (!cashier) {
        // For admin users, allow login without password check
        if (user.role === 'admin') {
          // Admin can login as cashier
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
          // For cashier users, they should have a password
          if (!user.password) {
            return res.status(401).json({
              success: false,
              message: 'Invalid credentials. Please contact administrator.'
            });
          }
          
          // Verify password for User model
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

    // If we have a cashier from Cashier model, verify password
    if (cashier && cashier.password && cashier.password.startsWith('$2b$')) {
      const isPasswordValid = await bcrypt.compare(password, cashier.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
      }
    }

    // Update last login for cashier
    if (cashier._id && models.Cashier) {
      try {
        await models.Cashier.findByIdAndUpdate(cashier._id, {
          lastLogin: new Date()
        });
      } catch (err) {
        console.log('Could not update cashier last login:', err.message);
      }
    }

    // Generate token
    const token = generateAuthToken(cashier._id, cashier.email, cashier.role || 'cashier');

    // Prepare user data for response
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

    // Set session
    if (req.session) {
      req.session.user = userData;
      req.session.token = token;
    }

    console.log('✅ Cashier login successful:', {
      email: normalizedEmail,
      role: userData.role,
      name: userData.name
    });

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
// ==================== COMBINED TRANSACTION ENDPOINTS ====================

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

    console.log(`✅ Enhanced combined transaction data generated in ${processingTime}ms`);

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

// SPECIFIC METRICS ENDPOINT - Returns exactly the 12 metrics shown in the image
app.get('/api/transactions/metrics', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId
    } = req.query;

    console.log('📈 Fetching specific transaction metrics...', req.query);

    const filters = {
      startDate,
      endDate,
      shopId,
      cashierId
    };

    const transactionData = await getAllTransactionData(filters);

    // Extract exactly the 12 metrics shown in the image
    const metrics = {
      // 1. Total Sales
      totalSales: {
        amount: transactionData.financialStats.totalRevenue,
        count: transactionData.financialStats.totalSales,
        description: `${transactionData.financialStats.totalSales} transactions`
      },
     
      // 2. Credit Sales
      creditSales: {
        amount: transactionData.financialStats.creditSales,
        count: transactionData.financialStats.creditSalesCount,
        description: `${transactionData.financialStats.creditSalesCount} credit transactions`
      },
     
      // 3. Non-Credit Sales
      nonCreditSales: {
        amount: transactionData.financialStats.nonCreditSales,
        count: transactionData.financialStats.nonCreditSalesCount,
        description: `${transactionData.financialStats.nonCreditSalesCount} complete transactions`
      },
     
      // 4. Total Revenue
      totalRevenue: {
        amount: transactionData.financialStats.totalRevenue,
        description: 'From credit & non-credit sales'
      },
     
      // 5. Expenses
      expenses: {
        amount: transactionData.financialStats.totalExpenses,
        description: 'Total operational costs'
      },
     
      // 6. Gross Profit
      grossProfit: {
        amount: transactionData.financialStats.grossProfit,
        description: 'Revenue - Cost of Goods'
      },
     
      // 7. Net Profit
      netProfit: {
        amount: transactionData.financialStats.netProfit,
        description: 'After all expenses'
      },
     
      // 8. Cost of Goods Sold
      costOfGoodsSold: {
        amount: transactionData.financialStats.costOfGoodsSold,
        description: 'For credit & non-credit sales'
      },
     
      // 9. Total Mpesa/Bank
      totalMpesaBank: {
        amount: transactionData.financialStats.totalMpesaBank,
        description: 'Digital payments'
      },
     
      // 10. Total Cash
      totalCash: {
        amount: transactionData.financialStats.totalCash,
        description: 'Cash payments'
      },
     
      // 11. Outstanding Credit
      outstandingCredit: {
        amount: transactionData.financialStats.outstandingCredit,
        description: 'Unpaid credit balance'
      },
     
      // 12. Total Credit Given
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

// ENHANCED TRANSACTIONS WITH CREDIT DETAILS
app.get('/api/transactions/with-credits', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      shopId,
      cashierId,
      includeCreditDetails = 'true'
    } = req.query;

    const filters = {
      startDate,
      endDate,
      shopId,
      cashierId
    };

    const transactionData = await getAllTransactionData(filters);

    // Enhance transactions with credit information
    const transactionsWithCredits = transactionData.salesWithProfit.map(transaction => {
      const creditInfo = transactionData.credits.find(credit =>
        credit.transactionId && credit.transactionId._id &&
        credit.transactionId._id.toString() === transaction._id.toString()
      );

      return {
        ...transaction,
        creditDetails: creditInfo ? {
          creditId: creditInfo._id,
          customerName: creditInfo.customerName,
          customerPhone: creditInfo.customerPhone,
          totalAmount: creditInfo.totalAmount,
          amountPaid: creditInfo.amountPaid,
          balanceDue: creditInfo.balanceDue, // This now shows only the remaining balance
          dueDate: creditInfo.dueDate,
          status: creditInfo.status,
          paymentHistory: creditInfo.paymentHistory,
          shopClassification: creditInfo.shopClassification,
          upfrontPaymentAmount: creditInfo.upfrontPaymentAmount, // Include upfront payment details
          upfrontPaymentMethod: creditInfo.upfrontPaymentMethod,
          immediateRevenue: creditInfo.immediateRevenue
        } : null
      };
    });

    res.json({
      success: true,
      data: {
        transactions: transactionsWithCredits,
        summary: transactionData.financialStats,
        credits: includeCreditDetails === 'true' ? transactionData.credits : [],
        metrics: transactionData.financialStats
      },
      message: 'Transactions with credit details fetched successfully',
      cogsMethodology: 'complete_sales_plus_credit_sales_made_exclude_payments',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled',
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    });

  } catch (error) {
    console.error('❌ Error fetching transactions with credits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions with credit details',
      error: error.message
    });
  }
});

// ==================== BASIC CRUD ENDPOINTS ====================

// Products API
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
   
    // Auto-populate shop information if shop ID is provided
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

    // Check stock level for new product
    if ((product.currentStock || 0) <= (product.minStockLevel || 5)) {
      const alertType = (product.currentStock || 0) === 0 ? 'out_of_stock' : 'low_stock';
      await sendStockAlertEmail([{
        ...product.toObject(),
        shopName: product.shop?.name || product.shopName || 'Unknown Shop'
      }], alertType);
    }
   
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

    // Clear notification history if stock was updated to sufficient level
    const oldStock = oldProduct?.currentStock || 0;
    const newStock = product.currentStock || 0;
    const minStock = product.minStockLevel || 5;
   
    if (oldStock <= minStock && newStock > minStock) {
      stockMonitor.clearProductNotification(id);
      console.log(`✅ Stock updated to sufficient level for ${product.name}`);
    }

    // Send immediate notification if stock becomes critical
    if (newStock === 0 || (oldStock > minStock && newStock <= minStock)) {
      const alertType = newStock === 0 ? 'out_of_stock' : 'low_stock';
      await sendStockAlertEmail([{
        ...product.toObject(),
        shopName: product.shop?.name || product.shopName || 'Unknown Shop'
      }], alertType);
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

// Shops API
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

// Cashiers API
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

    // Hash password if provided
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

// PUT endpoint for cashiers (for full updates)
app.put('/api/cashiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('🔄 PUT request for cashier:', { id, updateData });

    // Find the cashier first to ensure it exists
    const existingCashier = await models.Cashier.findById(id);
    if (!existingCashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    // Hash password if provided and not empty
    if (updateData.password && updateData.password.trim() !== '') {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      // Remove password from update data if empty or not provided
      delete updateData.password;
    }

    const cashier = await models.Cashier.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedAt: new Date()
      },
      {
        new: true,
        runValidators: true,
        context: 'query'
      }
    ).populate('shopId', 'name location');

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found after update'
      });
    }

    console.log('✅ Cashier updated successfully via PUT:', cashier.name);

    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating cashier via PUT:', error);
   
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }
   
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

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

// Expenses API
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
   
    console.log('💰 Creating expense with shop validation:', {
      shop: expenseData.shop,
      shopId: expenseData.shopId
    });

    // Better shop validation and population
    if (expenseData.shop) {
      const shop = await models.Shop.findById(expenseData.shop);
      if (shop) {
        expenseData.shopName = shop.name;
        expenseData.shopId = shop._id.toString();
        console.log('✅ Shop found and populated:', shop.name);
      } else {
        console.warn('⚠️ Shop not found with ID:', expenseData.shop);
        return res.status(400).json({
          success: false,
          message: 'Selected shop not found'
        });
      }
    } else {
      console.warn('⚠️ No shop provided in expense data');
      expenseData.shopName = 'No Shop Assigned';
    }

    const expense = new models.Expense(expenseData);
    await expense.save();
   
    await expense.populate('shop', 'name location');

    console.log('✅ Expense created successfully with shop:', {
      expenseId: expense._id,
      shop: expense.shopName,
      shopId: expense.shopId
    });

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

// ==================== ENHANCED CREDIT API ENDPOINTS ====================

// Create credit record - WITH DEDUPLICATION CHECK
app.post('/api/credits', async (req, res) => {
  try {
    const creditData = req.body;
   
    console.log('💳 Creating credit record with deduplication check:', {
      transactionId: creditData.transactionId,
      customerName: creditData.customerName,
      upfrontPaymentAmount: creditData.upfrontPaymentAmount
    });

    // Check for duplicate credit record
    if (creditData.transactionId) {
      const existingCredit = await models.Credit.findOne({
        transactionId: creditData.transactionId
      });
     
      if (existingCredit) {
        console.log('⚠️ Credit record already exists for transaction:', creditData.transactionId);
        return res.status(409).json({
          success: false,
          message: 'Credit record already exists for this transaction',
          data: existingCredit
        });
      }
    }

    // Auto-populate shop and cashier information if not provided
    if (creditData.transactionId) {
      const transaction = await models.Transaction.findById(creditData.transactionId);
      if (transaction) {
        if (!creditData.shop) creditData.shop = transaction.shop;
        if (!creditData.shopId) creditData.shopId = transaction.shopId;
        if (!creditData.shopName) creditData.shopName = transaction.shopName;
        if (!creditData.cashierId) creditData.cashierId = transaction.cashierId;
        if (!creditData.cashierName) creditData.cashierName = transaction.cashierName;
        // Copy upfront payment details from transaction
        if (!creditData.upfrontPaymentAmount) creditData.upfrontPaymentAmount = transaction.upfrontPaymentAmount;
        if (!creditData.upfrontPaymentMethod) creditData.upfrontPaymentMethod = transaction.upfrontPaymentMethod;
        if (!creditData.upfrontPaymentSplit) creditData.upfrontPaymentSplit = transaction.upfrontPaymentSplit;
        if (!creditData.immediateRevenue) creditData.immediateRevenue = transaction.immediateRevenue;
      }
    }

    // Set default values
    if (!creditData.status) {
      creditData.status = creditData.balanceDue > 0 ? 'pending' : 'paid';
    }

    if (!creditData.dueDate) {
      creditData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default
    }

    // Initialize payment history if partial payment
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

    console.log('✅ Credit record created successfully with upfront payment tracking:', {
      creditId: credit._id,
      customerName: credit.customerName,
      totalAmount: credit.totalAmount,
      balanceDue: credit.balanceDue, // This now shows only the remaining balance
      status: credit.status,
      upfrontPaymentAmount: credit.upfrontPaymentAmount,
      upfrontPaymentMethod: credit.upfrontPaymentMethod,
      immediateRevenue: credit.immediateRevenue
    });

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

// Enhanced Credits API
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

    // Include transaction details if requested
    let enhancedCredits = credits;
    if (includeTransactions === 'true') {
      enhancedCredits = await Promise.all(credits.map(async (credit) => {
        if (credit.transactionId) {
          const transaction = await models.Transaction.findById(credit.transactionId)
            .populate('shop', 'name location type')
            .populate('cashierId', 'name email')
            .populate('items.productId', 'name buyingPrice');
          return {
            ...credit.toObject(),
            transactionDetails: transaction
          };
        }
        return credit;
      }));
    }

    res.json({
      success: true,
      data: enhancedCredits,
      count: credits.length,
      summary: {
        totalCredits: credits.length,
        totalCreditAmount: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.totalAmount), 0),
        totalPaid: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.amountPaid), 0),
        totalOutstanding: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.balanceDue), 0), // This now shows only the remaining balance
        overdueCount: credits.filter(c =>
          c.dueDate && new Date(c.dueDate) < new Date() && c.balanceDue > 0
        ).length,
        totalUpfrontPayments: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.upfrontPaymentAmount), 0), // Total upfront payments
        totalImmediateRevenue: credits.reduce((sum, c) => sum + CalculationUtils.safeNumber(c.immediateRevenue), 0) // Total immediate revenue
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

// Update credit record
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

// Delete credit record
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

// Get credit by ID
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

    // Include transaction details if requested
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

// Handle credit payment with proper state management
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

    // Add payment to history
    credit.paymentHistory.push({
      amount: paymentAmount,
      paymentMethod,
      recordedBy: recordedBy || 'System',
      cashierName: cashierName || credit.cashierName,
      paymentDate: new Date(),
      notes: notes || `Payment of ${CalculationUtils.formatCurrency(paymentAmount)}`
    });

    // Update amounts
    credit.amountPaid = newAmountPaid;
    credit.balanceDue = newBalanceDue; // This now shows only the remaining balance

    // Update status
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

    // Update corresponding transaction to reflect payment
    if (credit.transactionId) {
      await models.Transaction.findByIdAndUpdate(credit.transactionId, {
        amountPaid: newAmountPaid,
        recognizedRevenue: newAmountPaid,
        outstandingRevenue: newBalanceDue, // This now shows only the remaining balance
        creditStatus: newStatus,
        updatedAt: new Date()
      });
    }

    await credit.populate('transactionId');
    await credit.populate('shop', 'name location type');
    await credit.populate('cashierId', 'name email');

    console.log('✅ Payment recorded successfully for credit:', {
      creditId: req.params.id,
      paymentAmount,
      newAmountPaid,
      newBalanceDue, // This now shows only the remaining balance
      status: newStatus
    });

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

// ==================== ADDITIONAL UTILITY ENDPOINTS ====================

// Shop performance endpoint
app.get('/api/transactions/shop-performance/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { startDate, endDate } = req.query;
   
    const shop = await models.Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found'
      });
    }

    const filters = { shopId, startDate, endDate };
    const transactionData = await getAllTransactionData(filters);

    res.json({
      success: true,
      data: {
        performance: transactionData.financialStats,
        transactions: transactionData.salesWithProfit,
        credits: transactionData.credits,
        expenses: transactionData.expenses,
        shopDetails: shop
      },
      message: 'Shop performance data fetched successfully',
      cogsMethodology: 'complete_sales_plus_credit_sales_made_exclude_payments',
      creditPartialPayment: 'supported',
      immediateRevenueTracking: 'enabled',
      creditDisplayLogic: 'balance_due_only',
      upfrontPaymentTracking: 'enhanced'
    });

  } catch (error) {
    console.error('❌ Error fetching shop performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop performance data',
      error: error.message
    });
  }
});

// Debug endpoint
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: process.env.APP_NAME || 'Pamela Management API',
    version: process.env.APP_VERSION || '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      metrics: '/api/transactions/metrics',
      combined: '/api/transactions/combined',
      withCredits: '/api/transactions/with-credits',
      cashierMetrics: '/api/cashier/dashboard-metrics',
      stockMonitoring: '/api/stock/monitoring/status',
      stockAlerts: '/api/stock/alerts'
    },
    cogsCalculation: 'complete_sales_plus_credit_sales_made_exclude_payments',
    creditPartialPayment: 'supported',
    immediateRevenueTracking: 'enabled',
    creditDisplayLogic: 'balance_due_only',
    upfrontPaymentTracking: 'enhanced',
    stockMonitoring: 'active_with_6_hour_reminders'
  });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// PATCH endpoint for cashiers (for partial updates)
app.patch('/api/cashiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log('🔄 PATCH request for cashier:', { id, updateData });

    // Find the cashier first to ensure it exists
    const existingCashier = await models.Cashier.findById(id);
    if (!existingCashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    // Hash password if provided and not empty
    if (updateData.password && updateData.password.trim() !== '') {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      // Remove password from update data if empty or not provided
      delete updateData.password;
    }

    // Update only the provided fields
    const cashier = await models.Cashier.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedAt: new Date()
      },
      {
        new: true,
        runValidators: true,
        context: 'query'
      }
    ).populate('shopId', 'name location');

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found after update'
      });
    }

    console.log('✅ Cashier updated successfully via PATCH:', cashier.name);

    res.json({
      success: true,
      data: cashier,
      message: 'Cashier updated successfully'
    });
  } catch (error) {
    console.error('❌ Error updating cashier via PATCH:', error);
   
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }
   
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update cashier',
      error: error.message
    });
  }
});

// ==================== SERVER START ====================

const startServer = async () => {
  try {
    console.log('🚀 Starting Complete Pamela Management Server...');
    console.log(`📋 App: ${process.env.APP_NAME || 'Pamala Management'}`);
   
    await connectDB();
   
    // Start stock monitoring service (check every hour, send reminders every 6 hours)
    stockMonitor.startMonitoring(60); // Check every 60 minutes
   
    const server = app.listen(PORT, () => {
      console.log(`\n🎉 Complete Server Started Successfully!`);
      console.log('='.repeat(60));
      console.log(`📍 Port: ${PORT}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`📊 Database: ${mongoose.connection.name}`);
      console.log(`🔔 Stock Monitoring: ACTIVE ✅ (6-hour reminders)`);
      console.log(`📧 Email Alerts: ENABLED ✅`);
      console.log(`🧮 COGS Calculation: Complete Sales + Credit Sales Made (Exclude Payments)`);
      console.log(`💳 Credit Partial Payment: SUPPORTED ✅`);
      console.log(`💰 Immediate Revenue Tracking: ENABLED ✅`);
      console.log(`📈 Credit Display: BALANCE DUE ONLY ✅`);
      console.log(`💵 Upfront Payment Tracking: ENHANCED ✅`);
      console.log(`⚡ Performance Optimizations: ENABLED ✅`);
      console.log('='.repeat(60));
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 SIGTERM received, shutting down gracefully...');
      stockMonitor.stopMonitoring();
      server.close(() => {
        console.log('💤 Process terminated');
        process.exit(0);
      });
    });

    return server;

  } catch (error) {
    console.error('💥 Server startup failed:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;