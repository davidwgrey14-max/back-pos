const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const Cashier = require('../models/Cashier');
const Club = require('../models/shops');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Generate JWT token with consistent structure
const generateToken = (id, role) => {
  return jwt.sign(
    { 
      id: id.toString(), // Ensure ID is string
      role: role 
    }, 
    process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_production',
    { expiresIn: '7d' } // Extended to 7 days for better user experience
  );
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  try {
    const { email, password } = req.body;
    
    console.log('🔐 Admin login attempt:', { email });
    
    // Check if admin exists in database
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      console.log('❌ Admin not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, admin.password);
    
    if (!isMatch) {
      console.log('❌ Password mismatch for admin:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    // Generate JWT token with consistent structure
    const token = generateToken(admin._id, 'admin');

    console.log('✅ Admin login successful:', {
      adminId: admin._id,
      email: admin.email,
      tokenLength: token.length
    });

    return res.json({
      success: true,
      token,
      admin: {
        id: admin._id.toString(), // Ensure string ID
        email: admin.email,
        role: 'admin',
        name: 'Administrator'
      },
      expiresIn: '7d'
    });

  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication'
    });
  }
};

// Enhanced token verification middleware
exports.verifyToken = (req, res, next) => {
  let token = req.header('Authorization');
  
  // Try different token locations
  if (!token) {
    token = req.header('x-auth-token');
  }
  
  if (!token) {
    token = req.query.token;
  }

  // Remove Bearer prefix if present
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7, token.length);
  }

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  try {
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_production'
    );
    
    console.log('🔐 Token verified:', {
      id: decoded.id,
      role: decoded.role,
      exp: new Date(decoded.exp * 1000).toISOString()
    });
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
        code: 'TOKEN_EXPIRED'
      });
    } else if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        code: 'INVALID_TOKEN'
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Token verification failed.',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }
  }
};

// Middleware to check if user is admin
exports.requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    console.log('✅ Admin access granted:', req.user.id);
    next();
  } else {
    console.log('❌ Admin access denied. User role:', req.user?.role);
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
};

// Check token validity without failing
exports.checkToken = async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.json({
        valid: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'fallback_jwt_secret_change_in_production'
    );
    
    // Check if admin still exists
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.json({
        valid: false,
        message: 'Admin account not found'
      });
    }

    res.json({
      valid: true,
      admin: {
        id: admin._id,
        email: admin.email,
        role: 'admin'
      },
      expiresAt: new Date(decoded.exp * 1000)
    });
  } catch (error) {
    res.json({
      valid: false,
      message: error.message
    });
  }
};

exports.getDashboardData = async (req, res) => {
  try {
    console.log('📊 Fetching dashboard data for admin:', req.user.id);
    
    const [totalUsers, activeUsers, totalCashiers, totalClubs] = await Promise.all([
      Admin.countDocuments({}),
      Admin.countDocuments({ status: 'active' }),
      Cashier.countDocuments({}),
      Club.countDocuments({})
    ]);
    
    res.status(200).json({ 
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        totalUsers,
        activeUsers,
        totalCashiers, 
        totalClubs,
        user: req.user
      }
    });
  } catch (err) {
    console.error('❌ Dashboard data error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving dashboard data'
    });
  }
};

exports.createCashier = async (req, res) => {
  try {
    const { username, password, email, club } = req.body;
    
    // Check if cashier already exists
    const existingUser = await Cashier.findOne({ 
      $or: [{ username }, { email }] 
    });
      
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        message: 'Cashier already exists' 
      });
    }

    // Create new cashier
    const cashier = new Cashier({
      username,
      password: await bcrypt.hash(password, 10),
      email,
      club,
      role: 'cashier',
      status: 'active'
    });

    await cashier.save();
    
    res.status(201).json({
      success: true,
      message: 'Cashier created successfully',
      data: {
        id: cashier._id,
        username: cashier.username,
        email: cashier.email,
        club: cashier.club
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error creating cashier'
    });
  }
};

exports.getAllCashiers = async (req, res) => {
  try {
    const cashiers = await Cashier.find({}, '-password');
    
    res.status(200).json({
      success: true,
      message: 'Cashiers retrieved successfully',
      data: cashiers
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error retrieving cashiers'
    });
  }
};

exports.createClub = async (req, res) => {
  try {
    const { name, location, manager } = req.body;
    
    const club = new Club({
      name,
      location,
      manager
    });

    await club.save();
    
    res.status(201).json({
      success: true,
      message: 'Club created successfully',
      data: club
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error creating club'
    });
  }
};

exports.getAllClubs = async (req, res) => {
  try {
    const clubs = await Club.find({});
    
    res.status(200).json({
      success: true,
      message: 'Clubs retrieved successfully',
      data: clubs
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error retrieving clubs'
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const [admins, cashiers] = await Promise.all([
      Admin.find({}, '-password'),
      Cashier.find({}, '-password')
    ]);
    
    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: [...admins, ...cashiers]
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Server error retrieving users'
    });
  }
};

// Enhanced logout endpoint
exports.logout = (req, res) => {
  console.log('👋 Admin logout:', req.user?.id);
  res.json({
    success: true,
    message: 'Logged out successfully.'
  });
};