const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

// ==================== CORS CONFIGURATION ====================

/**
 * Allowed origins for CORS
 * Add your frontend URLs here
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'https://pos-frontend-psi-teal.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

/**
 * CORS options for the cors middleware
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is allowed
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked origin: ${origin}`);
      // In development, you might want to allow all origins for testing
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-API-Key'
  ],
  exposedHeaders: [
    'Content-Range',
    'X-Content-Range',
    'X-Total-Count'
  ],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// ==================== MIDDLEWARE ====================

// 1. Apply CORS middleware
app.use(cors(corsOptions));

// 2. Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// 3. Additional CORS headers for all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Set allowed origin if present
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Set other CORS headers
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader('Access-Control-Max-Age', '86400');

  next();
});

// 4. JSON parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5. Request logger middleware (optional)
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.url} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// ==================== ROUTES ====================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack || err);

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed'
    });
  }

  // Other errors
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ==================== SERVER INITIALIZATION ====================

/**
 * Start the server if this file is run directly
 */
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║           🚀 SERVER STARTED               ║
╠═══════════════════════════════════════════╣
║ Port:          ${PORT.padEnd(20)}║
║ Environment:   ${(process.env.NODE_ENV || 'development').padEnd(20)}║
║ Allowed Origins: ${ALLOWED_ORIGINS.length > 0 ? 'Configured' : 'None'.padEnd(20)}║
╚═══════════════════════════════════════════╝
    `);
    console.log(`📋 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  });

  // Graceful shutdown handler
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });

    // Force close after 5 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('⚠️ Force shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  // Process event handlers
  process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled Rejection:', err.stack || err);
    shutdown('UNHANDLED_REJECTION');
  });

  process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.stack || err);
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// ==================== EXPORTS ====================

module.exports = app;