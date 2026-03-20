require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const routes = require('./src/routes');
const { errorHandler } = require('./src/middleware/auth');
const { seedDemoUsers } = require('./src/utils/seedDemoData');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autopay-shield')
  .then(async () => {
    console.log('✓ MongoDB connected');
    if ((process.env.NODE_ENV || 'development') === 'development') {
      await seedDemoUsers();
    }
  })
  .catch(err => console.error('✗ MongoDB connection error:', err));

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

module.exports = app;
