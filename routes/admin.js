const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const { protect, authorize } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

// Admin login - FIXED TOKEN STRUCTURE
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔐 Admin login attempt:', { email });

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get or create admin account
    const admin = await Admin.getAdminAccount();
    
    // Check if email matches
    if (email !== admin.email) {
      console.log('❌ Email mismatch:', email, 'expected:', admin.email);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Verify password
    const isPasswordCorrect = await admin.correctPassword(password, admin.password);
    
    if (!isPasswordCorrect) {
      console.log('❌ Password incorrect for admin:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Generate JWT token - USE CONSISTENT STRUCTURE
    const token = jwt.sign(
      { 
        id: admin._id.toString(), // Ensure it's a string
        role: 'admin' // Middleware expects 'role' field
      },
      process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_production',
      { expiresIn: '7d' } // 7 days expiration
    );

    console.log('✅ Admin login successful:', {
      adminId: admin._id,
      email: admin.email,
      tokenLength: token.length
    });

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id.toString(),
        email: admin.email,
        role: 'admin',
        name: 'Administrator'
      },
      expiresIn: '7d',
      message: 'Admin login successful'
    });

  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
});

// Check token validity
router.get('/check', protect, authorize('admin'), (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: req.user,
    valid: true
  });
});

// Get admin dashboard data (protected)
router.get('/dashboard', protect, authorize('admin'), async (req, res) => {
  try {
    console.log('📊 Dashboard request from admin:', req.user.email);
    
    // Your dashboard logic here
    const dashboardData = {
      totalUsers: 1, // At least the admin
      activeUsers: 1,
      totalCashiers: 0,
      totalClubs: 0,
      user: req.user
    };
    
    res.status(200).json({
      success: true,
      data: dashboardData,
      message: 'Dashboard data retrieved successfully'
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving dashboard data'
    });
  }
});

// Test route without auth
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Admin route is working',
    timestamp: new Date().toISOString()
  });
});

// Logout route
router.post('/logout', protect, authorize('admin'), (req, res) => {
  console.log('👋 Admin logout:', req.user.email);
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Profile route
router.get('/profile', protect, authorize('admin'), (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
});

module.exports = router;