const Claim = require('../models/Claim');
const User = require('../models/User');
const Policy = require('../models/Policy');
const TruthEngine = require('./truthEngineService');
const { predictExpectedIncome } = require('./incomeDnaService');
const { getCurrentWeather } = require('./weatherService');
const { calculateIncomeLoss, calculatePayout } = require('../utils/helpers');

/**
 * Invisible Claim System - Automatic claim creation and processing
 */
class ClaimService {
  static getRecentDuplicateWindowMs() {
    const hours = Number(process.env.CLAIM_DUPLICATE_WINDOW_HOURS || 6);
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  static async findRecentSimilarClaim(userId, triggerType, timeWindow) {
    const lowerBound = new Date(Date.now() - this.getRecentDuplicateWindowMs());
    return Claim.findOne({
      userId,
      triggerType,
      createdAt: { $gte: lowerBound },
      claimStatus: { $in: ['triggered', 'validated', 'paid'] },
      'timeWindow.start': { $lte: timeWindow.end },
      'timeWindow.end': { $gte: timeWindow.start }
    }).sort({ createdAt: -1 });
  }

  static ensureAutomationLog(claim) {
    if (!claim.metadata) claim.metadata = {};
    if (!claim.metadata.automation) claim.metadata.automation = { source: 'invisible-claim-system', processingLog: [] };
    if (!Array.isArray(claim.metadata.automation.processingLog)) claim.metadata.automation.processingLog = [];
    return claim.metadata.automation.processingLog;
  }
  
    static isWithinCoverageHours(policy) {
      const currentHour = new Date().getHours();
      return currentHour >= policy.coverageHours.start && currentHour <= policy.coverageHours.end;
    }

    static getDefaultTimeWindow() {
      return {
        start: new Date(Date.now() - 2 * 60 * 60 * 1000),
        end: new Date()
      };
    }

    static wasUserActiveInWindow(user, timeWindow) {
      const history = Array.isArray(user?.earningsHistory) ? user.earningsHistory : [];
      const startMs = new Date(timeWindow.start).getTime();
      const endMs = new Date(timeWindow.end).getTime();
      const activeEntries = history.filter((entry) => {
        const ts = new Date(entry.date).getTime();
        return ts >= startMs && ts <= endMs;
      });
      return {
        active: activeEntries.length > 0,
        activeEntries
      };
    }

    static deriveActualIncome(triggerEvent, expectedIncome) {
      if (Number.isFinite(triggerEvent?.actualIncome)) {
        return Number(triggerEvent.actualIncome);
      }

      const orderDropPct = Number(triggerEvent?.orderDropPercentage || 0);
      if (orderDropPct > 0) {
        return Math.max(0, Math.round(expectedIncome * (1 - (orderDropPct / 100))));
      }

      return Math.max(0, Math.round(expectedIncome * 0.55));
    }

  /**
   * Automatically trigger a claim based on external disruption
   */
  static async autoTriggerClaim(userId, triggerData) {
    try {
      const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        return await this.processAutomaticClaim(triggerData, user);
      
    } catch (error) {
      console.error('Error in autoTriggerClaim:', error);
      return { claimed: false, error: error.message };
    }
  }

    /**
     * FEATURE 2: Invisible claims with no user action
     */
    static async processAutomaticClaim(triggerEvent, user, options = {}) {
      if (!triggerEvent?.type) {
        return { claimed: false, reason: 'Invalid trigger event payload' };
      }

      const policy = await Policy.findById(user.activePolicy);
      if (!policy || policy.status !== 'active') {
        return { claimed: false, reason: 'No active policy found' };
      }

      if (!options.forceDemo && !this.isWithinCoverageHours(policy)) {
        return { claimed: false, reason: 'Outside coverage hours' };
      }

      const timeWindow = triggerEvent?.timeWindow || this.getDefaultTimeWindow();

      const existingSimilarClaim = await this.findRecentSimilarClaim(user._id, triggerEvent.type, timeWindow);
      if (existingSimilarClaim) {
        return {
          claimed: false,
          reason: 'Similar claim already exists in cooldown window',
          existingClaimId: existingSimilarClaim._id
        };
      }

      const activityCheck = this.wasUserActiveInWindow(user, timeWindow);
      if (!options.forceDemo && !activityCheck.active) {
        return { claimed: false, reason: 'No work activity detected in disruption window' };
      }

      const effectiveActivityCount = options.forceDemo ? Math.max(activityCheck.activeEntries.length, 1) : activityCheck.activeEntries.length;

      const incomePrediction = predictExpectedIncome(user, timeWindow, {
        zone: triggerEvent?.zone || user?.workingZones?.[0]
      });

      const expectedIncome = incomePrediction.expectedIncome;
      const actualIncome = this.deriveActualIncome(triggerEvent, expectedIncome);
      const incomeLoss = calculateIncomeLoss(expectedIncome, actualIncome);
      if (incomeLoss <= 0) {
        return { claimed: false, reason: 'No income loss detected' };
      }

      const payout = calculatePayout(incomeLoss);

      const processingTrace = [
        { step: 'trigger_received', at: new Date(), details: { triggerType: triggerEvent?.type, value: triggerEvent?.value } },
        { step: 'activity_checked', at: new Date(), details: { activeEntries: effectiveActivityCount, forcedDemo: Boolean(options.forceDemo) } },
        { step: 'income_predicted', at: new Date(), details: incomePrediction },
        { step: 'loss_computed', at: new Date(), details: { expectedIncome, actualIncome, incomeLoss, payout } }
      ];

      const claim = new Claim({
        userId: user._id,
        policyId: policy._id,
        triggerType: triggerEvent.type,
        triggerValue: triggerEvent.value,
        timeWindow,
        expectedIncome,
        actualIncome,
        calculatedLoss: incomeLoss,
        payoutAmount: payout,
        claimStatus: 'triggered',
        fraudStatus: 'under_review',
        metadata: {
          ...(triggerEvent.metadata || {}),
          automation: {
            source: 'invisible-claim-system',
            processingLog: processingTrace
          }
        }
      });

      await claim.save();

      const fraudAssessment = await this.validateClaim(claim, user);
      claim.fraudChecks = fraudAssessment.fraudChecks;
      claim.fraudStatus = fraudAssessment.decision === 'approve' ? 'approved' : 'rejected';
      claim.claimStatus = fraudAssessment.decision === 'approve' ? 'validated' : 'rejected';
      if (!claim.metadata) claim.metadata = {};
      claim.metadata.truthEngine = {
        fraudScore: fraudAssessment.fraudScore,
        decision: fraudAssessment.decision,
        riskLevel: fraudAssessment.riskLevel
      };
      const processingLog = this.ensureAutomationLog(claim);
      processingLog.push({
        step: 'truth_engine_completed',
        at: new Date(),
        details: {
          fraudScore: fraudAssessment.fraudScore,
          decision: fraudAssessment.decision
        }
      });

      await claim.save();

      if (fraudAssessment.decision === 'approve') {
        await this.processPayout(claim._id);
        const postPayoutLog = this.ensureAutomationLog(claim);
        postPayoutLog.push({
          step: 'payout_processed',
          at: new Date(),
          details: { payoutAmount: payout }
        });
        await claim.save();
      }

      return {
        claimed: true,
        claimId: claim._id,
        payout,
        fraudAssessment,
        expectedIncome,
        actualIncome,
        incomeLoss,
        processingLog: this.ensureAutomationLog(claim)
      };
    }
  
  /**
   * Validate claim against fraud checks
   */
  static async validateClaim(claim, user) {
    try {
      if (!claim || !user) {
        throw new Error('Claim or user not found');
      }
      
      // Get claim history context (last 90 days) for duplicate + behavior pattern checks
      const existingClaims = await Claim.find({
        userId: user._id,
        _id: { $ne: claim._id },
        createdAt: {
          $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        }
      });
      
      const weatherData = await getCurrentWeather(user.city, user.gpsLocation);

      return TruthEngine.validateClaim(claim, user, {
        existingClaims,
        weatherData
      });
      
    } catch (error) {
      console.error('Error validating claim:', error);
      throw error;
    }
  }
  
  /**
   * Process payout for approved claims
   */
  static async processPayout(claimId) {
    try {
      const claim = await Claim.findById(claimId);
      
      // Simulate payment processing
      const payoutId = `PAY-${Date.now()}`;
      
      claim.payoutId = payoutId;
      claim.claimStatus = 'paid';
      claim.resolvedAt = new Date();
      
      await claim.save();
      
      // Mock notification (in production, send actual payment)
      console.log(`✓ Payout processed: ${payoutId} - ₹${claim.payoutAmount}`);
      
      return {
        payoutId,
        amount: claim.payoutAmount,
        status: 'completed'
      };
      
    } catch (error) {
      console.error('Error processing payout:', error);
      throw error;
    }
  }
  
  /**
   * Get claim history for user
   */
  static async getClaimHistory(userId) {
    try {
      const claims = await Claim.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50);
      
      return claims;
    } catch (error) {
      console.error('Error getting claim history:', error);
      throw error;
    }
  }
  
  /**
   * Get claim statistics for admin
   */
  static async getClaimStats() {
    try {
      const totalClaims = await Claim.countDocuments();
      const approvedClaims = await Claim.countDocuments({ fraudStatus: 'approved' });
      const rejectedClaims = await Claim.countDocuments({ fraudStatus: 'rejected' });
      const underReview = await Claim.countDocuments({ fraudStatus: 'under_review' });
      
      const totalPayouts = await Claim.aggregate([
        { $match: { claimStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$payoutAmount' } } }
      ]);
      
      return {
        totalClaims,
        approvedClaims,
        rejectedClaims,
        underReview,
        totalPayoutsAmount: totalPayouts[0]?.total || 0,
        approvalRate: ((approvedClaims / totalClaims) * 100).toFixed(2) + '%'
      };
    } catch (error) {
      console.error('Error getting claim stats:', error);
      throw error;
    }
  }
}

module.exports = ClaimService;
