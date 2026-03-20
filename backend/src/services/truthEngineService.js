const FraudDetectionEngine = require('./fraudDetectionEngine');

const CHECK_WEIGHTS = {
  gpsValidation: 35,
  activityValidation: 25,
  weatherMismatch: 20,
  duplicateCheck: 20,
  claimHistoryPattern: 25
};

// FEATURE 3: Truth Engine facade returning fraudScore + decision
const validateClaim = (claim, user, context = {}) => {
  const assessment = FraudDetectionEngine.assessFraud(
    claim,
    user,
    context.existingClaims || [],
    context.weatherData || {}
  );

  const checks = assessment.fraudChecks || {};
  let fraudScore = 0;

  for (const [checkName, weight] of Object.entries(CHECK_WEIGHTS)) {
    const status = checks?.[checkName]?.status;
    if (status === 'failed') fraudScore += weight;
    if (status === 'pending') fraudScore += Math.round(weight * 0.4);
  }

  const decision = fraudScore >= 45 ? 'reject' : 'approve';

  return {
    fraudScore,
    decision,
    fraudChecks: checks,
    riskLevel: assessment.riskLevel
  };
};

module.exports = {
  validateClaim
};
