const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  weeklyPremium: {
    type: Number,
    required: true,
    min: 20,
    max: 80
  },
  
  // Updated every week
  coverageAmount: {
    type: Number,
    required: true
  },
  
  riskBreakdown: {
    weatherRisk: Number,    // 0-100
    pollutionRisk: Number,  // 0-100
    demandRisk: Number,     // 0-100
    locationRisk: Number    // 0-100
  },
  
  coverageHours: {
    start: Number,
    end: Number
  },
  
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  
  startDate: {
    type: Date,
    required: true
  },
  
  endDate: {
    type: Date,
    required: true
  },
  
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },

  externalRiskContext: {
    source: String,
    weather: {
      cityName: String,
      temperature: Number,
      rainfall: Number,
      aqi: Number,
      observedAt: Date
    },
    locationVerification: {
      status: String,
      withinCityRadius: Boolean,
      distanceKm: Number,
      radiusKm: Number,
      targetType: String,
      targetName: String,
      reason: String
    },
    vpnVerification: {
      status: String,
      source: String,
      ip: String,
      distanceKm: Number,
      thresholdKm: Number,
      proxyDetected: Boolean,
      hostingDetected: Boolean,
      reason: String
    },
    dynamicRisk: {
      riskScore: Number,
      factors: {
        weatherRisk: Number,
        locationRisk: Number,
        timeOfDayRisk: Number,
        historicalDisruptionRisk: Number
      }
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Policy', policySchema);
