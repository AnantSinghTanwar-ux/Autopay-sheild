const Claim = require('../models/Claim');
const ClaimService = require('../services/claimService');
const { checkTriggers, predictUpcomingDisruptions } = require('../services/weatherService');

// Manually test claim trigger
exports.testTriggerClaim = async (req, res) => {
  try {
    const userId = req.userId;
    const { triggerType, triggerValue } = req.body;
    
    const triggerData = {
      type: triggerType,
      value: triggerValue,
      actualIncome: Math.random() * 300,
      metadata: {
        affectedZones: ['Zone A'],
        gpsTrail: { latitude: 19.0760, longitude: 72.8777 }
      }
    };
    
    const result = await ClaimService.autoTriggerClaim(userId, triggerData);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error triggering claim', error: error.message });
  }
};

// Get claim history
exports.getClaimHistory = async (req, res) => {
  try {
    const userId = req.userId;
    
    const claims = await ClaimService.getClaimHistory(userId);
    
    res.json({
      claims: claims.map(claim => ({
        id: claim._id,
        triggerType: claim.triggerType,
        triggerValue: claim.triggerValue,
        timeWindow: claim.timeWindow,
        expectedIncome: claim.expectedIncome,
        actualIncome: claim.actualIncome,
        calculatedLoss: claim.calculatedLoss,
        payoutAmount: claim.payoutAmount,
        claimStatus: claim.claimStatus,
        fraudStatus: claim.fraudStatus,
        createdAt: claim.createdAt,
        resolvedAt: claim.resolvedAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching claims', error: error.message });
  }
};

// Get specific claim details
exports.getClaimDetails = async (req, res) => {
  try {
    const { claimId } = req.params;
    
    const claim = await Claim.findById(claimId);
    
    if (!claim || claim.userId.toString() !== req.userId) {
      return res.status(404).json({ message: 'Claim not found' });
    }
    
    res.json({
      claim: {
        id: claim._id,
        triggerType: claim.triggerType,
        triggerValue: claim.triggerValue,
        timeWindow: claim.timeWindow,
        expectedIncome: claim.expectedIncome,
        actualIncome: claim.actualIncome,
        calculatedLoss: claim.calculatedLoss,
        payoutAmount: claim.payoutAmount,
        fraudChecks: claim.fraudChecks,
        fraudStatus: claim.fraudStatus,
        claimStatus: claim.claimStatus,
        payoutId: claim.payoutId,
        metadata: claim.metadata,
        createdAt: claim.createdAt,
        resolvedAt: claim.resolvedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching claim', error: error.message });
  }
};

// Check triggers for user's location
exports.checkCurrentTriggers = async (req, res) => {
  try {
    const userId = req.userId;
    const { city } = req.query;
    
    if (!city) {
      return res.status(400).json({ message: 'City parameter required' });
    }
    
    const { triggers, weatherData, orderData } = await checkTriggers(city, { _id: userId });
    
    res.json({
      triggers: triggers.filter(t => t.triggered),
      weatherData,
      orderData,
      summary: {
        activeAlerts: triggers.filter(t => t.triggered).length,
        highestRisk: triggers.length > 0 ? triggers[0].type : 'none'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error checking triggers', error: error.message });
  }
};

// Get pre-loss predictions
exports.getPredictions = async (req, res) => {
  try {
    const { city } = req.query;
    
    if (!city) {
      return res.status(400).json({ message: 'City parameter required' });
    }
    
    const predictions = await predictUpcomingDisruptions(city);
    
    res.json({
      predictions,
      summary: {
        upcomingRisks: predictions.length,
        highestProbability: predictions.length > 0 
          ? Math.max(...predictions.map(p => p.probability))
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching predictions', error: error.message });
  }
};

// Admin: Get all claims stats
exports.getClaimStats = async (req, res) => {
  try {
    const stats = await ClaimService.getClaimStats();
    
    res.json({
      stats
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

// Admin: Get fraud alerts
exports.getFraudAlerts = async (req, res) => {
  try {
    const recentClaims = await Claim.find({
      fraudStatus: 'rejected'
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('userId', 'name email city');
    
    res.json({
      fraudAlerts: recentClaims.map(claim => ({
        id: claim._id,
        user: claim.userId.name,
        email: claim.userId.email,
        city: claim.userId.city,
        triggerType: claim.triggerType,
        fraudStatus: claim.fraudStatus,
        fraudChecks: claim.fraudChecks,
        createdAt: claim.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching fraud alerts', error: error.message });
  }
};

exports.runDemoScenario = async (req, res) => {
  res.json({ message: 'Demo scenario run successfully' });
};

exports.reviewClaimDecision = async (req, res) => {
  res.json({ message: 'Decision reviewed' });
};

exports.getUserHistoryForClaim = async (req, res) => {
  res.json({ history: [] });
};

