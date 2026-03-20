const jwt = require('jsonwebtoken');
const { predictExpectedIncome } = require('../services/incomeDnaService');
const JWT_SECRET = process.env.JWT_SECRET || 'autopay-shield-fallback-secret';

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Mock function to generate weekly premium based on risk
const calculateWeeklyPremium = (riskFactors) => {
  // Simple weighted scoring model
  const weatherWeight = 0.3;
  const pollutionWeight = 0.2;
  const demandWeight = 0.3;
  const locationWeight = 0.2;
  
  const baseScore = 50; // Base risk score
  
  const totalScore = 
    (riskFactors.weatherRisk || 40) * weatherWeight +
    (riskFactors.pollutionRisk || 50) * pollutionWeight +
    (riskFactors.demandRisk || 45) * demandWeight +
    (riskFactors.locationRisk || 50) * locationWeight;
  
  // Map risk score (0-100) to premium (₹20-₹80)
  const premium = 20 + ((totalScore / 100) * 60);
  
  return Math.round(premium);
};

// Calculate income loss based on estimated vs actual income
const calculateIncomeLoss = (expectedIncome, actualIncome) => {
  const loss = expectedIncome - actualIncome;
  return Math.max(0, loss);
};

// Estimate expected income based on Income DNA
const estimateExpectedIncome = (user, timeWindow) => {
  return predictExpectedIncome(user, timeWindow).expectedIncome;
};

// Calculate payout as % of income loss (typically 80-100%)
const calculatePayout = (incomeLoss, coveragePercentage = 0.9) => {
  return Math.round(incomeLoss * coveragePercentage);
};

module.exports = {
  generateToken,
  calculateWeeklyPremium,
  calculateIncomeLoss,
  estimateExpectedIncome,
  calculatePayout
};
