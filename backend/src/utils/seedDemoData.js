const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');

const now = new Date();

const baseWindow = {
  start: new Date(now.getTime() - 2 * 60 * 60 * 1000),
  end: now
};

const buildFraudChecks = ({ gps = 'passed', activity = 'passed', weather = 'passed', duplicate = 'passed' }) => ({
  gpsValidation: {
    status: gps,
    userWasInZone: gps !== 'failed'
  },
  activityValidation: {
    status: activity,
    userWasActive: activity !== 'failed'
  },
  weatherMismatch: {
    status: weather,
    isValid: weather !== 'failed'
  },
  duplicateCheck: {
    status: duplicate,
    isDuplicate: duplicate === 'failed'
  }
});

async function ensureActivePolicy(user) {
  let policy = await Policy.findOne({ userId: user._id, status: 'active' });
  if (!policy) {
    policy = await Policy.create({
      userId: user._id,
      weeklyPremium: 48,
      coverageAmount: 3500,
      riskBreakdown: {
        weatherRisk: 42,
        pollutionRisk: 38,
        demandRisk: 44,
        locationRisk: 30
      },
      coverageHours: user.workingHours || { start: 9, end: 22 },
      startDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      endDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      paymentStatus: 'paid'
    });
    console.log(`✓ Seeded active policy for: ${user.email}`);
  }

  if (!user.activePolicy || user.activePolicy.toString() !== policy._id.toString()) {
    user.activePolicy = policy._id;
    await user.save();
  }

  return policy;
}

async function ensureSeedClaim({
  seedTag,
  user,
  policy,
  triggerType,
  triggerValue,
  expectedIncome,
  actualIncome,
  calculatedLoss,
  payoutAmount,
  fraudStatus,
  claimStatus,
  fraudScore,
  fraudChecks
}) {
  const existing = await Claim.findOne({ 'metadata.seedTag': seedTag });
  if (existing) return;

  await Claim.create({
    userId: user._id,
    policyId: policy._id,
    triggerType,
    triggerValue,
    timeWindow: baseWindow,
    expectedIncome,
    actualIncome,
    calculatedLoss,
    payoutAmount,
    fraudChecks,
    fraudStatus,
    claimStatus,
    payoutId: claimStatus === 'paid' ? `PAY-SEED-${seedTag}` : undefined,
    metadata: {
      seedTag,
      automation: {
        source: 'seed-demo-data',
        processingLog: [
          { step: 'seeded_claim_created', at: now, details: { seedTag, fraudStatus, claimStatus } }
        ]
      },
      truthEngine: {
        fraudScore,
        decision: fraudStatus === 'rejected' ? 'reject' : 'approve',
        riskLevel: fraudScore >= 60 ? 'high' : fraudScore >= 35 ? 'medium' : 'low'
      }
    },
    resolvedAt: claimStatus === 'paid' || claimStatus === 'rejected' ? now : undefined,
    createdAt: new Date(now.getTime() - Math.floor(Math.random() * 180) * 60 * 1000)
  });

  console.log(`✓ Seeded demo claim: ${seedTag}`);
}

async function seedDemoUsers() {
  const demoUsers = [
    {
      name: 'Demo Worker',
      email: 'worker@example.com',
      password: 'password123',
      city: 'Mumbai',
      workingZones: ['Zone A', 'Zone B'],
      workingHours: { start: 9, end: 22 },
      riskScore: 45,
      averageEarningsPerHour: 375,
      peakHours: [18, 19, 20, 21]
    },
    {
      name: 'Safe Rider',
      email: 'safe.worker@example.com',
      password: 'password123',
      city: 'Mumbai',
      workingZones: ['Zone A', 'Zone C'],
      workingHours: { start: 9, end: 22 },
      riskScore: 18,
      averageEarningsPerHour: 420,
      peakHours: [12, 13, 19, 20]
    },
    {
      name: 'Balanced Rider',
      email: 'balanced.worker@example.com',
      password: 'password123',
      city: 'Mumbai',
      workingZones: ['Zone B'],
      workingHours: { start: 10, end: 23 },
      riskScore: 46,
      averageEarningsPerHour: 335,
      peakHours: [17, 18, 21]
    },
    {
      name: 'Risky Rider',
      email: 'risky.worker@example.com',
      password: 'password123',
      city: 'Mumbai',
      workingZones: ['Zone D'],
      workingHours: { start: 8, end: 21 },
      riskScore: 82,
      averageEarningsPerHour: 290,
      peakHours: [16, 17, 20]
    },
    {
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'admin123',
      city: 'Delhi',
      workingZones: ['Zone A'],
      workingHours: { start: 9, end: 22 },
      riskScore: 35,
      averageEarningsPerHour: 320,
      peakHours: [17, 18, 19]
    }
  ];

  const usersByEmail = {};

  for (const userData of demoUsers) {
    let user = await User.findOne({ email: userData.email });
    if (!user) {
      const user = new User(userData);
      await user.save();
      console.log(`✓ Seeded demo user: ${userData.email}`);
      usersByEmail[userData.email] = user;
    } else {
      usersByEmail[userData.email] = user;
    }
  }

  const workerEmails = [
    'worker@example.com',
    'safe.worker@example.com',
    'balanced.worker@example.com',
    'risky.worker@example.com'
  ];

  const policiesByEmail = {};
  for (const email of workerEmails) {
    const user = usersByEmail[email];
    if (!user) continue;
    policiesByEmail[email] = await ensureActivePolicy(user);
  }

  await ensureSeedClaim({
    seedTag: 'seed-safe-approved',
    user: usersByEmail['safe.worker@example.com'],
    policy: policiesByEmail['safe.worker@example.com'],
    triggerType: 'rain',
    triggerValue: 112,
    expectedIncome: 780,
    actualIncome: 420,
    calculatedLoss: 360,
    payoutAmount: 324,
    fraudStatus: 'approved',
    claimStatus: 'paid',
    fraudScore: 16,
    fraudChecks: buildFraudChecks({ gps: 'passed', activity: 'passed', weather: 'passed', duplicate: 'passed' })
  });

  await ensureSeedClaim({
    seedTag: 'seed-balanced-under-review',
    user: usersByEmail['balanced.worker@example.com'],
    policy: policiesByEmail['balanced.worker@example.com'],
    triggerType: 'order_drop',
    triggerValue: 48,
    expectedIncome: 640,
    actualIncome: 310,
    calculatedLoss: 330,
    payoutAmount: 298,
    fraudStatus: 'under_review',
    claimStatus: 'triggered',
    fraudScore: 44,
    fraudChecks: buildFraudChecks({ gps: 'pending', activity: 'passed', weather: 'passed', duplicate: 'passed' })
  });

  await ensureSeedClaim({
    seedTag: 'seed-risky-rejected',
    user: usersByEmail['risky.worker@example.com'],
    policy: policiesByEmail['risky.worker@example.com'],
    triggerType: 'pollution',
    triggerValue: 246,
    expectedIncome: 590,
    actualIncome: 130,
    calculatedLoss: 460,
    payoutAmount: 414,
    fraudStatus: 'rejected',
    claimStatus: 'rejected',
    fraudScore: 82,
    fraudChecks: buildFraudChecks({ gps: 'failed', activity: 'failed', weather: 'passed', duplicate: 'failed' })
  });
}

module.exports = { seedDemoUsers };
