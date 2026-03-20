const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Policy',
    required: true
  },
  
  triggerType: {
    type: String,
    enum: ['rain', 'heat', 'pollution', 'order_drop', 'zone_restriction'],
    required: true
  },
  
  triggerValue: Number, // e.g., rainfall mm, temperature, AQI, order drop %
  
  timeWindow: {
    start: Date,
    end: Date
  },
  
  // Income loss calculation
  expectedIncome: Number,
  actualIncome: Number,
  calculatedLoss: Number,
  
  // Fraud checks
  fraudChecks: {
    gpsValidation: {
      status: String, // 'passed', 'failed', 'pending'
      userWasInZone: Boolean
    },
    activityValidation: {
      status: String,
      userWasActive: Boolean
    },
    duplicateCheck: {
      status: String,
      isDuplicate: Boolean
    },
    weatherMismatch: {
      status: String,
      isValid: Boolean
    }
  },
  
  fraudStatus: {
    type: String,
    enum: ['approved', 'rejected', 'under_review'],
    default: 'under_review'
  },
  
  claimStatus: {
    type: String,
    enum: ['triggered', 'validated', 'rejected', 'paid'],
    default: 'triggered'
  },
  
  payoutAmount: Number,
  payoutId: String, // Reference to payment transaction
  
  metadata: {
    weatherData: Object,
    orderData: Object,
    gpsTrail: Object,
    automation: {
      source: String,
      processingLog: [Object]
    },
    truthEngine: {
      fraudScore: Number,
      decision: String,
      riskLevel: String
    }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  resolvedAt: Date
});

module.exports = mongoose.model('Claim', claimSchema);
