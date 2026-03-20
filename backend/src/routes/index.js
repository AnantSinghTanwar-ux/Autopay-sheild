const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const authController = require('../controllers/authController');
const policyController = require('../controllers/policyController');
const claimController = require('../controllers/claimController');

// ==================== Auth Routes ====================
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/zone-suggestion', authController.getZoneSuggestion);

// ==================== User Routes ====================
router.get('/user/profile', authenticate, authController.getProfile);
router.get('/user/income-dna', authenticate, authController.getIncomeDna);
router.put('/user/profile', authenticate, authController.updateProfile);
router.delete('/user/me', authenticate, authController.deleteMe);
router.post('/user/log-earnings', authenticate, authController.logEarnings);

// ==================== Policy Routes ====================
router.post('/policy/create', authenticate, policyController.createPolicy);
router.get('/policy/active', authenticate, policyController.getActivePolicy);
router.get('/policy/breakdown', authenticate, policyController.getPolicyBreakdown);
router.post('/policy/renew', authenticate, policyController.renewPolicy);

// ==================== Claim Routes ====================
router.post('/claim/test-trigger', authenticate, claimController.testTriggerClaim);
router.get('/claim/history', authenticate, claimController.getClaimHistory);
router.get('/claim/:claimId', authenticate, claimController.getClaimDetails);
router.get('/claim/check/triggers', authenticate, claimController.checkCurrentTriggers);
router.get('/claim/predict/disruptions', authenticate, claimController.getPredictions);

// ==================== Admin Routes ====================
router.get('/admin/claims/stats', authenticate, claimController.getClaimStats);
router.get('/admin/claims/fraud-alerts', authenticate, claimController.getFraudAlerts);
router.post('/admin/demo/run', authenticate, claimController.runDemoScenario);
router.patch('/admin/claims/:claimId/decision', authenticate, claimController.reviewClaimDecision);
router.get('/admin/claims/:claimId/history', authenticate, claimController.getUserHistoryForClaim);

module.exports = router;
