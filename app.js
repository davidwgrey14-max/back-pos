const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5001;

// ==================== CORS CONFIGURATION FOR VERCEL ====================

/**
 * Allowed origins for CORS
 */
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'https://pos-frontend-psi-teal.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean);

// ==================== CORS MIDDLEWARE - VERCEL COMPATIBLE ====================

/**
 * Custom CORS middleware that works with Vercel serverless functions
 */
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Log for debugging
  console.log(`📨 ${req.method} ${req.url}`);
  console.log(`🔗 Origin: ${origin || 'No origin'}`);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    // Set CORS headers for preflight
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (process.env.NODE_ENV === 'development') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-API-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // End preflight request successfully
    return res.status(204).end();
  }
  
  // Set CORS headers for actual requests
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-API-Key');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  next();
};

// Apply CORS middleware FIRST
app.use(corsMiddleware);

// ==================== JSON PARSER ====================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ==================== SERVER START ====================

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

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close(() => process.exit(0));
  });
}

module.exports = app;