const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  phone: String,
  city: {
    type: String,
    required: true
  },
  workingZones: [String], // e.g., ["Zone A", "Zone B"]
  workingHours: {
    start: Number, // 24-hour format (9)
    end: Number    // 24-hour format (22)
  },
  
  // Income DNA
  earningsHistory: [{
    date: Date,
    earnings: Number,
    ordersCompleted: Number,
    hoursWorked: Number,
    location: String
  }],
  
  averageEarningsPerHour: {
    type: Number,
    default: 0
  },
  
  peakHours: [Number], // e.g., [12, 13, 18, 19, 20]
  
  // Risk scoring
  riskScore: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  
  // Active subscription
  activePolicy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Policy'
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  gpsLocation: {
    latitude: Number,
    longitude: Number,
    lastUpdated: Date
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
