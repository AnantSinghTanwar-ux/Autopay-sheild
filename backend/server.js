require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const routes = require('./src/routes');
const { errorHandler } = require('./src/middleware/auth');
const { seedDemoUsers } = require('./src/utils/seedDemoData');

const app = express();
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autopay-shield';
const useMockFallback = (process.env.USE_MOCK_DB_FALLBACK || 'true').toLowerCase() === 'true';

let cachedConnectionPromise = null;

const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cachedConnectionPromise) {
    cachedConnectionPromise = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      maxPoolSize: 10
    })
      .then(async (conn) => {
        await seedDemoUsers();
        return conn;
      })
      .catch((err) => {
        cachedConnectionPromise = null;
        throw err;
      });
  }

  return cachedConnectionPromise;
};

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow any vercel.app subdomain
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, true); // permissive for now
  },
  credentials: true
}));
app.use(express.json());

// Ensure DB is ready before API routes in serverless/runtime contexts.
app.use(async (req, res, next) => {
  if (useMockFallback && req.path.startsWith('/api/') && mongoose.connection.readyState !== 1) {
    // In fallback mode, API routes should not wait on a potentially slow/unavailable DB.
    return next();
  }

  try {
    await connectToDatabase();
    next();
  } catch (err) {
    if (useMockFallback && req.path.startsWith('/api/')) {
      return next();
    }

    res.status(500).json({
      message: 'Database connection failed',
      error: err.message
    });
  }
});

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use(errorHandler);

if (require.main === module) {
  connectToDatabase()
    .then(() => console.log('✓ MongoDB connected'))
    .catch((err) => console.error('✗ MongoDB connection error:', err.message));

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 AutoPay Shield Backend running on http://localhost:${PORT}`);
    console.log(`📚 API Documentation:`);
    console.log(`   POST   /api/auth/register  - Register new user`);
    console.log(`   POST   /api/auth/login     - Login user`);
    console.log(`   POST   /api/policy/create  - Create weekly policy`);
    console.log(`   GET    /api/policy/active  - Get active policy`);
    console.log(`   POST   /api/claim/test-trigger - Test claim trigger\n`);
  });
}

module.exports = app;
