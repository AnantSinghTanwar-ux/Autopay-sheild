const Claim = require('../models/Claim');
const User = require('../models/User');
const ClaimService = require('../services/claimService');
const { checkTriggers, predictUpcomingDisruptions } = require('../services/weatherService');

const ensureAdmin = async (userId) => {
  const operator = await User.findById(userId);
  const isAdmin = operator?.email === 'admin@example.com';
  return { operator, isAdmin };
};

// Manually test claim trigger
exports.testTriggerClaim = async (req, res) => {
  try {
    const userId = req.userId;
    const { triggerType, triggerValue, gpsTrail } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const demoWindow = {
      start: new Date(Date.now() - 2 * 60 * 60 * 1000),
      end: new Date()
    };

    const triggerData = {
      type: triggerType,
      value: triggerValue,
      actualIncome: Math.random() * 300,
      timeWindow: demoWindow,
      zone: user?.workingZones?.[0],
      metadata: {
        affectedZones: user?.workingZones || ['Zone A'],
        gpsTrail: gpsTrail || user?.gpsLocation || { latitude: 19.076, longitude: 72.8777 },
        source: 'user-demo-simulation'
      }
    };

    const result = await ClaimService.processAutomaticClaim(triggerData, user, { forceDemo: true });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error triggering claim', error: error.message });
  }
};

// Get claim history
exports.getClaimHistory = async (req, res) => {
  try {
    const claims = await ClaimService.getClaimHistory(req.userId);

    res.json({
      claims: claims.map((claim) => ({
        id: claim._id,
        triggerType: claim.triggerType,
        triggerValue: claim.triggerValue,
        timeWindow: claim.timeWindow,
        expectedIncome: claim.expectedIncome,
        actualIncome: claim.actualIncome,
        calculatedLoss: claim.calculatedLoss,
        payoutAmount: claim.payoutAmount,
        fraudChecks: claim.fraudChecks,
        fraudScore: claim.metadata?.truthEngine?.fraudScore,
        truthDecision: claim.metadata?.truthEngine?.decision,
        claimStatus: claim.claimStatus,
        fraudStatus: claim.fraudStatus,
        automationLog: claim.metadata?.automation?.processingLog || [],
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
    const { city } = req.query;

    if (!city) {
      return res.status(400).json({ message: 'City parameter required' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { triggers, weatherData, orderData, orderDropSignal, locationVerification } = await checkTriggers(city, user);
    const autoProcess = (req.query.autoProcess || 'true').toLowerCase() === 'true';
    let automaticClaims = [];

    if (autoProcess) {
      automaticClaims = await Promise.all(
        triggers
          .filter((t) => t.triggered)
          .map((trigger) => ClaimService.processAutomaticClaim({
            type: trigger.type,
            value: trigger.value,
            zone: user?.workingZones?.[0],
            orderDropPercentage: orderDropSignal?.dropPercentage,
            metadata: {
              affectedZones: user?.workingZones || [],
              gpsTrail: user?.gpsLocation || null,
              weatherData,
              orderData
            }
          }, user))
      );
    }

    res.json({
      triggers: triggers.filter((t) => t.triggered),
      weatherData,
      orderData,
      orderDropSignal,
      locationVerification,
      automaticClaims,
      summary: {
        activeAlerts: triggers.filter((t) => t.triggered).length,
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

    const user = await User.findById(req.userId);
    const forecastResult = await predictUpcomingDisruptions(city, user);
    const predictions = forecastResult?.predictions || [];

    res.json({
      predictions,
      smartSuggestion: forecastResult?.smartSuggestion,
      summary: {
        upcomingRisks: predictions.length,
        highestProbability: predictions.length > 0
          ? Math.max(...predictions.map((p) => p.probability))
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
    const { isAdmin } = await ensureAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const stats = await ClaimService.getClaimStats();
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

// Admin: Get fraud alerts
exports.getFraudAlerts = async (req, res) => {
  try {
    const { isAdmin } = await ensureAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const recentClaims = await Claim.find({
      fraudStatus: { $in: ['under_review', 'rejected', 'approved'] }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'name email city');

    res.json({
      fraudAlerts: recentClaims.map((claim) => ({
        id: claim._id,
        user: claim.userId?.name || 'Unknown',
        email: claim.userId?.email || 'Unknown',
        city: claim.userId?.city || 'Unknown',
        triggerType: claim.triggerType,
        fraudStatus: claim.fraudStatus,
        claimStatus: claim.claimStatus,
        fraudScore: claim.metadata?.truthEngine?.fraudScore,
        fraudChecks: claim.fraudChecks,
        createdAt: claim.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching fraud alerts', error: error.message });
  }
};

// Admin Demo: one-click automatic claim scenario for hackathon presentation
exports.runDemoScenario = async (req, res) => {
  try {
    const { isAdmin } = await ensureAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { targetUserEmail = 'worker@example.com', triggerType = 'order_drop', triggerValue = 55 } = req.body || {};
    const targetUser = await User.findOne({ email: targetUserEmail });
    if (!targetUser) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    if (!targetUser.activePolicy) {
      return res.status(400).json({ message: 'Target user has no active policy. Create a policy first.' });
    }

    const demoWindow = {
      start: new Date(Date.now() - 2 * 60 * 60 * 1000),
      end: new Date()
    };

    const result = await ClaimService.processAutomaticClaim({
      type: triggerType,
      value: triggerValue,
      orderDropPercentage: triggerType === 'order_drop' ? Number(triggerValue) : undefined,
      zone: targetUser?.workingZones?.[0],
      timeWindow: demoWindow,
      metadata: {
        source: 'admin-demo',
        affectedZones: targetUser?.workingZones || [],
        gpsTrail: targetUser?.gpsLocation || null,
        note: 'Generated from admin hackathon demo endpoint'
      }
    }, targetUser, { forceDemo: true });

    res.json({
      message: 'Demo scenario executed',
      result
    });
  } catch (error) {
    res.status(500).json({ message: 'Error running admin demo scenario', error: error.message });
  }
};

// Admin override: approve or reject a specific claim
exports.reviewClaimDecision = async (req, res) => {
  try {
    const { isAdmin } = await ensureAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { claimId } = req.params;
    const { decision, reason } = req.body || {};

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be approve or reject' });
    }

    const claim = await Claim.findById(claimId);
    if (!claim) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    if (decision === 'approve') {
      claim.fraudStatus = 'approved';
      claim.claimStatus = claim.claimStatus === 'paid' ? 'paid' : 'validated';
      if (!claim.payoutId && claim.payoutAmount > 0) {
        await ClaimService.processPayout(claim._id);
      } else {
        await claim.save();
      }
    } else {
      claim.fraudStatus = 'rejected';
      claim.claimStatus = 'rejected';
      claim.resolvedAt = new Date();
      await claim.save();
    }

    const updated = await Claim.findById(claim._id);
    if (reason) {
      if (!updated.metadata) updated.metadata = {};
      updated.metadata.adminReview = {
        decision,
        reason,
        reviewedAt: new Date()
      };
      await updated.save();
    }

    res.json({
      message: `Claim ${decision}d successfully`,
      claim: {
        id: updated._id,
        claimStatus: updated.claimStatus,
        fraudStatus: updated.fraudStatus,
        payoutId: updated.payoutId,
        payoutAmount: updated.payoutAmount
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error reviewing claim', error: error.message });
  }
};

// Admin: Get selected user's past claim history to support review decisions
exports.getUserHistoryForClaim = async (req, res) => {
  try {
    const { isAdmin } = await ensureAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { claimId } = req.params;
    const targetClaim = await Claim.findById(claimId).populate('userId', 'name email city');
    if (!targetClaim) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    const claims = await Claim.find({ userId: targetClaim.userId._id })
      .sort({ createdAt: -1 })
      .limit(30);

    const groupedMap = new Map();
    for (const claim of claims) {
      const day = new Date(claim.createdAt).toISOString().slice(0, 10);
      const key = [
        claim.triggerType,
        claim.fraudStatus,
        claim.claimStatus,
        claim.metadata?.truthEngine?.fraudScore ?? 'na',
        day
      ].join('|');

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          id: claim._id,
          triggerType: claim.triggerType,
          triggerValue: claim.triggerValue,
          fraudStatus: claim.fraudStatus,
          claimStatus: claim.claimStatus,
          fraudScore: claim.metadata?.truthEngine?.fraudScore,
          payoutAmount: claim.payoutAmount,
          createdAt: claim.createdAt,
          resolvedAt: claim.resolvedAt,
          occurrenceCount: 1
        });
      } else {
        const existing = groupedMap.get(key);
        existing.occurrenceCount += 1;
      }
    }

    const groupedClaims = Array.from(groupedMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const now = Date.now();
    const d30 = now - 30 * 24 * 60 * 60 * 1000;
    const claims30d = claims.filter((c) => new Date(c.createdAt).getTime() >= d30);
    const rejected30d = claims30d.filter((c) => c.fraudStatus === 'rejected').length;
    const underReview30d = claims30d.filter((c) => c.fraudStatus === 'under_review').length;

    res.json({
      user: {
        id: targetClaim.userId._id,
        name: targetClaim.userId.name,
        email: targetClaim.userId.email,
        city: targetClaim.userId.city
      },
      historyProfile: {
        totalClaims: claims.length,
        claimsLast30d: claims30d.length,
        rejectedLast30d: rejected30d,
        underReviewLast30d: underReview30d,
        rejectionRate30d: claims30d.length > 0 ? Number(((rejected30d / claims30d.length) * 100).toFixed(1)) : 0
      },
      claims: groupedClaims
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user history for claim', error: error.message });
  }
};
