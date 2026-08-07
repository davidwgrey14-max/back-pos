const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  category: {
    type: String,
    required: [true, 'Expense category is required'],
    enum: ['rent', 'utilities', 'salaries', 'supplies', 'maintenance', 'marketing', 'transport', 'other'],
    lowercase: true
  },
  amount: {
    type: Number,
    required: [true, 'Expense amount is required'],
    min: [0, 'Amount cannot be negative'],
    set: v => parseFloat(parseFloat(v).toFixed(2))
  },
  date: {
    type: Date,
    required: [true, 'Expense date is required'],
    default: Date.now
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['cash', 'mpesa'],
    default: 'cash',
    lowercase: true
  },
  description: {
    type: String,
    default: ''
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: [true, 'Shop is required for expense tracking']
  },
  shopName: {
    type: String,
    default: ''
  },
  recordedBy: {
    type: String,
    default: 'System'
  },
  notes: {
    type: String,
    default: ''
  },
  referenceNumber: {
    type: String,
    default: function() {
      return `EXP-${Date.now().toString().slice(-6)}`;
    }
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Virtual for formatted date
expenseSchema.virtual('formattedDate').get(function() {
  return this.date.toLocaleDateString('en-KE');
});

// Virtual for formatted amount
expenseSchema.virtual('formattedAmount').get(function() {
  return `KSh ${this.amount.toFixed(2)}`;
});

// Ensure virtuals are included in JSON output
expenseSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

expenseSchema.set('toObject', { virtuals: true });

// Indexes for better performance
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, date: -1 });
expenseSchema.index({ shop: 1, date: -1 });
expenseSchema.index({ createdBy: 1, date: -1 });
expenseSchema.index({ paymentMethod: 1 });
expenseSchema.index({ status: 1 });

// Pre-save middleware to ensure proper formatting
expenseSchema.pre('save', function(next) {
  if (this.isModified('category')) {
    this.category = this.category.toLowerCase();
  }
  if (this.isModified('paymentMethod')) {
    this.paymentMethod = this.paymentMethod.toLowerCase();
  }
  if (this.isModified('amount')) {
    this.amount = parseFloat(parseFloat(this.amount).toFixed(2));
  }
  
  // Ensure shopName is set if not provided
  if (this.isModified('shop') && !this.shopName) {
    // This would ideally be populated from the Shop model
    // For now, we'll set a default
    this.shopName = 'Unknown Shop';
  }
  
  next();
});

// Static method to get expenses by shop
expenseSchema.statics.getByShop = function(shopId, startDate, endDate) {
  const match = { shop: shopId };
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return this.find(match).sort({ date: -1 });
};

// Static method to get category totals
expenseSchema.statics.getCategoryTotals = function(startDate, endDate, shopId) {
  const match = {};
  if (startDate && endDate) {
    match.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  if (shopId) match.shop = shopId;
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { totalAmount: -1 } }
  ]);
};

module.exports = mongoose.model('Expense', expenseSchema);