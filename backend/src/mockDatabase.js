// Mock in-memory database for testing without MongoDB
// This file stores all data in memory - it will reset when the server restarts

const mockUsers = new Map();
const mockPolicies = new Map();
const mockClaims = new Map();

// Demo user - pre-created
mockUsers.set('worker@example.com', {
  _id: 'demo-user-1',
  name: 'Demo Worker',
  email: 'worker@example.com',
  password: 'password123', // In real app, this would be hashed
  city: 'Mumbai',
  workingZones: ['Zone A', 'Zone B'],
  workingHours: { start: 9, end: 22 },
  riskScore: 45,
  averageEarningsPerHour: 375,
  incomeDNA: {
    last30Days: Array(30).fill(350 + Math.random() * 200),
    peakHours: { start: 18, end: 22 },
    variability: 0.35,
    averageDaily: 3000,
    lastUpdate: new Date()
  },
  createdAt: new Date('2025-01-15')
});

// Admin user - pre-created
mockUsers.set('admin@example.com', {
  _id: 'admin-user-1',
  name: 'Admin User',
  email: 'admin@example.com',
  password: 'admin123',
  city: 'Delhi',
  role: 'admin',
  createdAt: new Date('2025-01-01')
});

module.exports = {
  mockUsers,
  mockPolicies,
  mockClaims,
  
  // User operations
  findUserByEmail: (email) => mockUsers.get(email),
  findUserById: (userId) => {
    for (const [, user] of mockUsers) {
      if (user._id === userId) {
        return user;
      }
    }
    return null;
  },
  updateUser: (userId, updates) => {
    for (const [email, user] of mockUsers) {
      if (user._id === userId) {
        const updatedUser = { ...user, ...updates, updatedAt: new Date() };
        mockUsers.set(email, updatedUser);
        return updatedUser;
      }
    }
    return null;
  },
  createUser: (userData) => {
    if (mockUsers.has(userData.email)) {
      return null; // User exists
    }
    const id = `user-${Date.now()}`;
    mockUsers.set(userData.email, {
      _id: id,
      ...userData,
      peakHours: [18, 19, 20, 21],
      earningsHistory: [],
      createdAt: new Date()
    });
    return mockUsers.get(userData.email);
  },
  
  // Policy operations
  createPolicy: (policyData) => {
    // Keep only one active policy per user in this mock mode
    for (const [id, policy] of mockPolicies) {
      if (policy.userId === policyData.userId && policy.status === 'active') {
        mockPolicies.set(id, { ...policy, status: 'expired', updatedAt: new Date() });
      }
    }

    const id = `policy-${Date.now()}`;
    const policy = {
      _id: id,
      ...policyData,
      createdAt: new Date(),
      status: 'active'
    };
    mockPolicies.set(id, policy);
    return policy;
  },
  findPolicyById: (policyId) => mockPolicies.get(policyId) || null,
  getPolicyByUserId: (userId) => {
    for (const [, policy] of mockPolicies) {
      if (policy.userId === userId && policy.status === 'active') {
        return policy;
      }
    }
    return null;
  },
  
  // Claim operations
  createClaim: (claimData) => {
    const id = `claim-${Date.now()}`;
    const claim = {
      _id: id,
      ...claimData,
      createdAt: new Date(),
      claimStatus: claimData.claimStatus || 'approved',
      fraudStatus: claimData.fraudStatus || 'approved',
      payoutAmount: claimData.payoutAmount || claimData.incomeProtected || 1000
    };
    mockClaims.set(id, claim);
    return claim;
  },
  findClaimById: (claimId) => mockClaims.get(claimId) || null,
  getClaimsByUserId: (userId) => {
    const userClaims = [];
    for (const [, claim] of mockClaims) {
      if (claim.userId === userId) {
        userClaims.push(claim);
      }
    }
    return userClaims.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  getAllClaims: () => Array.from(mockClaims.values())
};
