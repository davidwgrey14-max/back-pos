const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [2, 'Product name must be at least 2 characters long'],
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    minlength: [2, 'Category must be at least 2 characters long'],
    maxlength: [50, 'Category cannot exceed 50 characters']
  },
  buyingPrice: {
    type: Number,
    required: [true, 'Buying price is required'],
    min: [0, 'Buying price cannot be negative'],
    validate: {
      validator: function(value) {
        return value >= 0;
      },
      message: 'Buying price must be a positive number'
    }
  },
  minSellingPrice: {
    type: Number,
    required: [true, 'Selling price is required'],
    min: [0, 'Selling price cannot be negative'],
    validate: {
      validator: function(value) {
        return value >= 0;
      },
      message: 'Selling price must be a positive number'
    }
  },
  currentStock: {
    type: Number,
    default: 0,
    min: [0, 'Stock cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Stock must be a whole number'
    }
  },
  minStockLevel: {
    type: Number,
    default: 5,
    min: [0, 'Minimum stock level cannot be negative'],
    validate: {
      validator: Number.isInteger,
      message: 'Minimum stock level must be a whole number'
    }
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
  unit: {
    type: String,
    default: 'pcs',
    enum: {
      values: ['pcs', 'kg', 'g', 'l', 'ml', 'pack', 'box', 'bottle', 'can'],
      message: 'Invalid unit type'
    }
  },
  supplier: {
    type: String,
    trim: true,
    maxlength: [100, 'Supplier name cannot exceed 100 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: [true, 'Shop is required']
  },
  shopName: {
    type: String,
    required: [true, 'Shop name is required'],
    trim: true,
    minlength: [2, 'Shop name must be at least 2 characters long'],
    maxlength: [100, 'Shop name cannot exceed 100 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastRestocked: {
    type: Date,
    default: Date.now
  },
  reorderPoint: {
    type: Number,
    default: 10,
    min: [0, 'Reorder point cannot be negative']
  },
  stockHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    type: {
      type: String,
      enum: ['purchase', 'sale', 'adjustment', 'return']
    },
    quantity: Number,
    newStock: Number,
    reference: String,
    notes: String,
    shopName: String,
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop'
    }
  }],
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
productSchema.index({ name: 1, shop: 1 }, { unique: true });
productSchema.index({ name: 1, shopName: 1 }, { unique: true });
productSchema.index({ barcode: 1 });
productSchema.index({ category: 1 });
productSchema.index({ shop: 1 });
productSchema.index({ shopName: 1 });
productSchema.index({ currentStock: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ createdAt: -1 });

// ✅ ENHANCED PRE-SAVE: Force shopName to be set from shop reference
productSchema.pre('save', async function(next) {
  console.log('🔄 PRE-SAVE HOOK TRIGGERED for product:', this.name);
  
  // Generate barcode if not provided
  if (!this.barcode) {
    this.barcode = `PROD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  }
  
  // Validate that selling price is not less than buying price
  if (this.minSellingPrice < this.buyingPrice) {
    return next(new Error('Selling price cannot be less than buying price'));
  }
  
  // ✅ CRITICAL: ALWAYS set shopName from shop reference if available
  if (this.shop) {
    try {
      console.log('🔍 Pre-save: Looking up shop with ID:', this.shop);
      const Shop = mongoose.model('Shop');
      const shopData = await Shop.findById(this.shop);
      
      if (shopData) {
        this.shopName = shopData.name;
        console.log('✅ Pre-save: Set shopName to:', this.shopName, 'for shop ID:', this.shop);
      } else {
        console.error('❌ Pre-save: Shop not found with ID:', this.shop);
      }
    } catch (error) {
      console.error('❌ Pre-save: Error fetching shop:', error);
      // Continue without throwing to allow manual shopName setting
    }
  }
  
  // Ensure shopName is properly formatted
  if (this.shopName) {
    this.shopName = this.shopName.trim();
  }
  
  console.log('✅ PRE-SAVE COMPLETE - Final product data:', {
    name: this.name,
    shop: this.shop,
    shopName: this.shopName
  });
  
  next();
});

// Virtuals and methods remain the same...
productSchema.virtual('profitMargin').get(function() {
  if (this.buyingPrice === 0) return 0;
  return ((this.minSellingPrice - this.buyingPrice) / this.buyingPrice) * 100;
});

productSchema.virtual('profitAmount').get(function() {
  return this.minSellingPrice - this.buyingPrice;
});

productSchema.virtual('stockStatus').get(function() {
  if (this.currentStock === 0) {
    return 'out_of_stock';
  } else if (this.currentStock <= this.minStockLevel) {
    return 'low_stock';
  } else {
    return 'in_stock';
  }
});

productSchema.virtual('needsReorder').get(function() {
  return this.currentStock <= this.minStockLevel;
});

module.exports = mongoose.model('Product', productSchema);