const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Shop name is required'],
    unique: true,
    trim: true,
    minlength: [2, 'Shop name must be at least 2 characters'],
    maxlength: [50, 'Shop name cannot exceed 50 characters']
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
    maxlength: [100, 'Location cannot exceed 100 characters']
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better search performance
shopSchema.index({ name: 1 });
shopSchema.index({ location: 1 });

const Shop = mongoose.models.Shop || mongoose.model('Shop', shopSchema);
module.exports = Shop;