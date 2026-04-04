const Policy = require('../models/Policy');
const User = require('../models/User');
const { calculateWeeklyPremium } = require('../utils/helpers');

// Calculate and create weekly policy
exports.createPolicy = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Calculate risk factors
    const riskFactors = {
      weatherRisk: Math.floor(Math.random() * 50) + 30,
      pollutionRisk: Math.floor(Math.random() * 60) + 20,
      demandRisk: Math.floor(Math.random() * 40) + 30,
      locationRisk: Math.floor(Math.random() * 30) + 35
    };
    
    // Calculate premium
    const weeklyPremium = calculateWeeklyPremium(riskFactors);
    
    // Calculate coverage based on average earnings
    const weeklyEarnings = user.averageEarningsPerHour * 7 * 10; // 7 days, ~10 hours/day
    const coverageAmount = Math.round(weeklyEarnings * 0.3); // Cover 30% of weekly earnings
    
    // Create policy
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const policy = new Policy({
      userId,
      weeklyPremium,
      coverageAmount,
      riskBreakdown: riskFactors,
      coverageHours: user.workingHours,
      status: 'active',
      startDate,
      endDate,
      paymentStatus: 'paid' // Assume immediate payment for hackathon
    });
    
    await policy.save();
    
    // Update user's active policy
    user.activePolicy = policy._id;
    user.riskScore = Math.round(
      (riskFactors.weatherRisk + riskFactors.pollutionRisk + 
       riskFactors.demandRisk + riskFactors.locationRisk) / 4
    );
    await user.save();
    
    res.status(201).json({
      message: 'Policy created successfully',
      policy: {
        id: policy._id,
        weeklyPremium,
        coverageAmount,
        riskBreakdown: riskFactors,
        startDate,
        endDate,
        status: 'active'
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating policy', error: error.message });
  }
};

// Get active policy
exports.getActivePolicy = async (req, res) => {
  try {
    const userId = req.userId;
    
    const user = await User.findById(userId).populate('activePolicy');
    
    if (!user || !user.activePolicy) {
      return res.status(404).json({ message: 'No active policy' });
    }
    
    const policy = user.activePolicy;
    
    // Calculate days remaining
    const daysRemaining = Math.ceil(
      (new Date(policy.endDate) - new Date()) / (1000 * 60 * 60 * 24)
    );
    
    res.json({
      policy: {
        id: policy._id,
        weeklyPremium: policy.weeklyPremium,
        coverageAmount: policy.coverageAmount,
        riskBreakdown: policy.riskBreakdown,
        startDate: policy.startDate,
        endDate: policy.endDate,
        daysRemaining: Math.max(0, daysRemaining),
        status: policy.status,
        paymentStatus: policy.paymentStatus
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching policy', error: error.message });
  }
};

// Get policy breakdown (why premium is calculated this way)
exports.getPolicyBreakdown = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).populate('activePolicy');
    
    if (!user || !user.activePolicy) {
      return res.status(404).json({ message: 'No active policy' });
    }
    
    const policy = user.activePolicy;
    
    // Calculate contribution of each risk factor
    const totalRisk = Object.values(policy.riskBreakdown).reduce((a, b) => a + b);
    const weights = {
      weatherRisk: 0.3,
      pollutionRisk: 0.2,
      demandRisk: 0.3,
      locationRisk: 0.2
    };
    
    const breakdown = {
      totalRiskScore: Math.round(totalRisk / 4),
      riskFactors: Object.entries(policy.riskBreakdown).map(([factor, value]) => ({
        factor: factor.replace('Risk', ''),
        score: value,
        weight: (weights[factor] * 100).toFixed(1) + '%',
        contribution: Math.round((value * weights[factor]) / 100)
      })),
      premiumCalculation: {
        basePremium: 20,
        riskMultiplier: (policy.weeklyPremium - 20) / 60,
        finalPremium: `₹${policy.weeklyPremium}`,
        explanation: `Based on your location (${user.city}), working hours (${user.workingHours.start}-${user.workingHours.end}), and historical risk patterns.`
      }
    };
    
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching breakdown', error: error.message });
  }
};

// Renew policy (for next week)
exports.renewPolicy = async (req, res) => {
  try {
    const userId = req.userId;
    
    const oldPolicy = await Policy.findOne({ userId, status: 'active' });
    if (oldPolicy) {
      oldPolicy.status = 'expired';
      await oldPolicy.save();
    }
    
    // Create new policy
    const newPolicy = new Policy({
      userId,
      weeklyPremium: oldPolicy?.weeklyPremium || 50,
      coverageAmount: oldPolicy?.coverageAmount || 5000,
      riskBreakdown: oldPolicy?.riskBreakdown || { weatherRisk: 50, pollutionRisk: 50, demandRisk: 50, locationRisk: 50 },
      coverageHours: oldPolicy?.coverageHours || { start: 9, end: 22 },
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentStatus: 'paid'
    });
    
    await newPolicy.save();
    
    const user = await User.findByIdAndUpdate(
      userId,
      { activePolicy: newPolicy._id },
      { new: true }
    );
    
    res.json({
      message: 'Policy renewed',
      policy: {
        id: newPolicy._id,
        weeklyPremium: newPolicy.weeklyPremium,
        coverageAmount: newPolicy.coverageAmount,
        startDate: newPolicy.startDate,
        endDate: newPolicy.endDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error renewing policy', error: error.message });
  }
};
