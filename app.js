const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

// ==================== ENHANCED CORS CONFIGURATION ====================

// Configure CORS with proper options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://back-pos.vercel.app',
      'http://localhost:3000',
      'https://pos-frontend-psi-teal.vercel.app',
      'http://127.0.0.1:3000',
      process.env.CLIENT_URL
    ].filter(Boolean);

    // Check if the origin is in allowed list or is a subdomain of allowed domains
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Log blocked origins for debugging
      console.log('🚫 CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
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

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests globally
app.options('*', cors(corsOptions));

// Additional CORS headers middleware
app.use((req, res, next) => {
  // Set CORS headers for all responses
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://pos-frontend-psi-teal.vercel.app',
    'http://localhost:3000',
    process.env.CLIENT_URL
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  
  next();
});

// Server Initialization
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`
      🚀 Server running in ${process.env.NODE_ENV || 'development'} mode
      📡 Listening on port ${PORT}
      🌐 Allowed CORS origin: ${corsOptions.origin}
      🛡️ CORS Methods: ${corsOptions.methods.join(', ')}
      🕒 ${new Date().toLocaleString()}
    `);
  });

  // Process Event Handlers
  const shutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  };

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

module.exports = app;