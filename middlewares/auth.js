const asyncHandler = require('./async');
const ErrorResponse = require('../utils/errorResponse');
const Cashier = require('../models/Cashier');
const Admin = require('../models/Admin');

// Simple session-based protection
exports.protect = asyncHandler(async (req, res, next) => {
  console.log('🛡️ Auth middleware - Checking session');

  // Get user data from session or headers
  let userData = null;
  
  if (req.session && req.session.user) {
    userData = req.session.user;
    console.log('🛡️ User data from session:', userData.email);
  } else if (req.headers['x-user-data']) {
    try {
      userData = JSON.parse(req.headers['x-user-data']);
      console.log('🛡️ User data from headers:', userData.email);
    } catch (error) {
      console.log('🛡️ Error parsing user data from headers');
    }
  } else if (req.body.user) {
    userData = req.body.user;
    console.log('🛡️ User data from body:', userData.email);
  }

  // Make sure user data exists
  if (!userData || !userData.email) {
    console.log('🛡️ No user data provided');
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }

  try {
    let user = null;
    
    // Find user based on role
    if (userData.role === 'admin') {
      console.log('🛡️ Looking for admin with email:', userData.email);
      user = await Admin.findOne({ email: userData.email });
      
      if (user) {
        console.log('🛡️ Admin found:', user.email);
        user.role = 'admin';
        user.id = user._id.toString();
      } else {
        console.log('🛡️ Admin not found for email:', userData.email);
        return next(new ErrorResponse('Admin account not found', 404));
      }
    } else if (userData.role === 'cashier') {
      console.log('🛡️ Looking for cashier with email:', userData.email);
      user = await Cashier.findOne({ email: userData.email });
      
      if (user) {
        console.log('🛡️ Cashier found:', user.email);
        user.role = 'cashier';
        user.id = user._id.toString();
      } else {
        console.log('🛡️ Cashier not found for email:', userData.email);
        return next(new ErrorResponse('Cashier account not found', 404));
      }
    } else {
      console.log('🛡️ Unknown role in user data:', userData.role);
      return next(new ErrorResponse('Invalid user role', 401));
    }

    if (!user) {
      console.log('🛡️ No user found');
      return next(new ErrorResponse('No user found with this email', 404));
    }

    if (user.status && user.status !== 'active') {
      console.log('🛡️ Account deactivated:', user.email);
      return next(new ErrorResponse('Account is deactivated', 401));
    }

    console.log('🛡️ Authentication successful for:', user.email);
    req.user = user;
    next();
  } catch (err) {
    console.error('🛡️ Auth error:', err.message);
    return next(new ErrorResponse('Not authorized to access this route', 401));
  }
});

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.log('🛡️ Authorization failed. User role:', req.user?.role, 'Required roles:', roles);
      return next(
        new ErrorResponse(
          `User role ${req.user?.role} is not authorized to access this route`,
          403
        )
      );
    }
    console.log('🛡️ Authorization successful for role:', req.user.role);
    next();
  };
};

// Optional auth middleware (doesn't fail if no user data)
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  let userData = null;
  
  if (req.session && req.session.user) {
    userData = req.session.user;
  } else if (req.headers['x-user-data']) {
    try {
      userData = JSON.parse(req.headers['x-user-data']);
    } catch (error) {
      // Ignore parsing errors for optional auth
    }
  }

  if (!userData) {
    req.user = null;
    return next();
  }

  try {
    let user = null;
    
    if (userData.role === 'admin') {
      user = await Admin.findOne({ email: userData.email });
      if (user) {
        user.role = 'admin';
        user.id = user._id.toString();
      }
    } else if (userData.role === 'cashier') {
      user = await Cashier.findOne({ email: userData.email });
      if (user) {
        user.role = 'cashier';
        user.id = user._id.toString();
      }
    }

    req.user = user;
    next();
  } catch (err) {
    // Don't fail on auth errors for optional auth
    req.user = null;
    next();
  }
});

// Development bypass middleware (for testing)
exports.devBypass = (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('🛡️ Development mode - bypassing auth');
    // Create a mock admin user for development
    req.user = {
      _id: 'dev_admin_id',
      name: 'Development Admin',
      email: 'dev@example.com',
      role: 'admin',
      status: 'active'
    };
  }
  next();
};