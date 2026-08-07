// src/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  visitCount: {
    type: Number,
    default: 0
  },
  lastVisit: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ name: 1 });

// Static method to find or create customer
customerSchema.statics.findOrCreate = async function(customerData) {
  if (!customerData || !customerData.name) {
    return null;
  }

  let customer;
  
  // Try to find by phone if provided
  if (customerData.phone) {
    customer = await this.findOne({ phone: customerData.phone });
  }
  
  // If not found by phone, try by email
  if (!customer && customerData.email) {
    customer = await this.findOne({ email: customerData.email });
  }
  
  // If still not found, create new customer
  if (!customer) {
    customer = await this.create({
      name: customerData.name,
      phone: customerData.phone || '',
      email: customerData.email || '',
      visitCount: 1,
      lastVisit: new Date()
    });
  } else {
    // Update existing customer
    customer.visitCount += 1;
    customer.lastVisit = new Date();
    if (customerData.email && !customer.email) {
      customer.email = customerData.email;
    }
    await customer.save();
  }
  
  return customer;
};

module.exports = mongoose.model('Customer', customerSchema);