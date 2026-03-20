const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const JWT_SECRET = process.env.JWT_SECRET || 'autopay-shield-fallback-secret';
const USE_MOCK_FALLBACK = (process.env.USE_MOCK_DB_FALLBACK || 'true').toLowerCase() === 'true';

// Middleware to verify JWT token
const authenticate = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);

    // Guard against stale tokens created before MongoDB migration (e.g., demo-user-1)
    if (!USE_MOCK_FALLBACK && !mongoose.Types.ObjectId.isValid(decoded.userId)) {
      return res.status(401).json({ message: 'Session expired. Please log in again.' });
    }

    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token', error: error.message });
  }
};

// Middleware for error handling
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};

module.exports = {
  authenticate,
  errorHandler
};
