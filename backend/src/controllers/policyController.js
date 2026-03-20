const Policy = require('../models/Policy');
const User = require('../models/User');
const mongoose = require('mongoose');
const { calculateWeeklyPremium } = require('../utils/helpers');
const { getLiveRiskFactors, STRICT_LOCATION_VERIFICATION } = require('../services/weatherService');
const { evaluateNetworkRisk, STRICT_VPN_CHECK } = require('../utils/networkRiskService');
const { calculateRiskScore } = require('../services/triggerIntelligenceService');
const { findUserById, updateUser, createPolicy: createMockPolicy, getPolicyByUserId } = require('../mockDatabase');

const USE_MOCK_FALLBACK = (process.env.USE_MOCK_DB_FALLBACK || 'true').toLowerCase() === 'true';
const isMongoConnected = () => mongoose.connection.readyState === 1;

// Calculate and create weekly policy
exports.createPolicy = async (req, res) => {
  try {
    const userId = req.userId;

    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const riskFactors = {
        weatherRisk: 48,
        pollutionRisk: 44,
        demandRisk: 46,
        locationRisk: 35
      };

      const weeklyPremium = calculateWeeklyPremium(riskFactors);
      const weeklyEarnings = (user.averageEarningsPerHour || 300) * 7 * 10;
      const coverageAmount = Math.round(weeklyEarnings * 0.3);
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      const policy = createMockPolicy({
        userId,
        weeklyPremium,
        coverageAmount,
        riskBreakdown: riskFactors,
        coverageHours: user.workingHours || { start: 9, end: 22 },
        startDate,
        endDate,
        paymentStatus: 'paid',
        externalRiskContext: {
          source: 'mock-fallback',
          locationVerification: { status: 'pending' },
          vpnVerification: { status: 'pending' }
        }
      });

      updateUser(userId, { activePolicy: policy._id, riskScore: 45 });

      return res.status(201).json({
        message: 'Policy created successfully (mock mode)',
        policy: {
          id: policy._id,
          weeklyPremium,
          coverageAmount,
          riskBreakdown: riskFactors,
          coverageHours: policy.coverageHours,
          startDate,
          endDate,
          status: 'active',
          dataSource: 'mock-fallback',
          registeredCity: user.city,
          weatherCity: user.city,
          locationVerification: { status: 'pending' },
          vpnVerification: { status: 'pending' },
          dynamicRisk: { riskScore: 45 }
        }
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const liveRisk = await getLiveRiskFactors(user.city, user.gpsLocation, user);
    const riskFactors = liveRisk.riskFactors;
    const vpnVerification = await evaluateNetworkRisk(req, user.gpsLocation);

    // Only block if GPS location exists AND it's far from registered city
    const hasGpsData = user.gpsLocation?.latitude && user.gpsLocation?.longitude;
    if (STRICT_LOCATION_VERIFICATION && hasGpsData && liveRisk.locationVerification?.status === 'failed') {
      const target = liveRisk.locationVerification?.targetName || user.city;
      const targetType = liveRisk.locationVerification?.targetType || 'city';
      return res.status(403).json({
        message: `Location verification failed. You are ${liveRisk.locationVerification.distanceKm} km from ${targetType} ${target}. Move closer or update your profile zones/city.`,
        locationVerification: liveRisk.locationVerification,
        dataSource: liveRisk.source
      });
    }

    if (STRICT_VPN_CHECK && vpnVerification?.status === 'failed') {
      return res.status(403).json({
        message: `Network verification failed. ${vpnVerification.reason}`,
        vpnVerification,
        dataSource: liveRisk.source
      });
    }

    const dynamicRisk = await calculateRiskScore(user, {
      weatherRisk: riskFactors.weatherRisk,
      locationRisk: riskFactors.locationRisk
    });

    // FEATURE 6: dynamic risk nudges premium in real time.
    const basePremium = calculateWeeklyPremium(riskFactors);
    const dynamicPremiumMultiplier = 0.85 + (dynamicRisk.riskScore / 100) * 0.3;
    const weeklyPremium = Math.max(20, Math.min(80, Math.round(basePremium * dynamicPremiumMultiplier)));
    const weeklyEarnings = user.averageEarningsPerHour * 7 * 10;
    const coverageAmount = Math.round(weeklyEarnings * 0.3);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const policy = new Policy({
      userId,
      weeklyPremium,
      coverageAmount,
      riskBreakdown: riskFactors,
      coverageHours: user.workingHours,
      status: 'active',
      startDate,
      endDate,
      paymentStatus: 'paid',
      externalRiskContext: {
        source: liveRisk.source,
        weather: {
          cityName: liveRisk.weather.cityName || user.city,
          temperature: liveRisk.weather.temperature,
          rainfall: liveRisk.weather.rainfall,
          aqi: liveRisk.weather.aqi,
          observedAt: liveRisk.weather.observedAt
        },
        locationVerification: liveRisk.locationVerification
        ,
        vpnVerification
      }
    });

    await policy.save();

    user.activePolicy = policy._id;
    user.riskScore = dynamicRisk.riskScore;
    await user.save();

    res.status(201).json({
      message: 'Policy created successfully',
      policy: {
        id: policy._id,
        weeklyPremium,
        coverageAmount,
        riskBreakdown: riskFactors,
        coverageHours: policy.coverageHours,
        startDate,
        endDate,
        status: 'active',
        dataSource: liveRisk.source,
        registeredCity: user.city,
        weatherCity: liveRisk.weather.cityName || user.city,
        locationVerification: liveRisk.locationVerification,
        vpnVerification,
        dynamicRisk
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating policy', error: error.message });
  }
};

// Get active policy
exports.getActivePolicy = async (req, res) => {
  try {
    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserById(req.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const policy = getPolicyByUserId(req.userId);
      if (!policy) {
        return res.status(404).json({ message: 'No active policy' });
      }

      const daysRemaining = Math.ceil((new Date(policy.endDate) - new Date()) / (1000 * 60 * 60 * 24));

      return res.json({
        policy: {
          id: policy._id,
          weeklyPremium: policy.weeklyPremium,
          coverageAmount: policy.coverageAmount,
          riskBreakdown: policy.riskBreakdown,
          coverageHours: policy.coverageHours,
          startDate: policy.startDate,
          endDate: policy.endDate,
          daysRemaining: Math.max(0, daysRemaining),
          status: policy.status,
          paymentStatus: policy.paymentStatus,
          externalRiskContext: policy.externalRiskContext || { source: 'mock-fallback' }
        }
      });
    }

    const user = await User.findById(req.userId).populate('activePolicy');

    if (!user || !user.activePolicy) {
      return res.status(404).json({ message: 'No active policy' });
    }

    const policy = user.activePolicy;
    let liveLocationVerification = policy.externalRiskContext?.locationVerification;
    let liveSource = policy.externalRiskContext?.source;
    let liveVpnVerification = policy.externalRiskContext?.vpnVerification;

    try {
      const liveRisk = await getLiveRiskFactors(user.city, user.gpsLocation, user);
      liveLocationVerification = liveRisk.locationVerification;
      liveSource = liveRisk.source;
      liveVpnVerification = await evaluateNetworkRisk(req, user.gpsLocation);
    } catch (error) {
      // Keep persisted values if fresh lookup fails.
    }

    const daysRemaining = Math.ceil((new Date(policy.endDate) - new Date()) / (1000 * 60 * 60 * 24));

    res.json({
      policy: {
        id: policy._id,
        weeklyPremium: policy.weeklyPremium,
        coverageAmount: policy.coverageAmount,
        riskBreakdown: policy.riskBreakdown,
        coverageHours: policy.coverageHours,
        startDate: policy.startDate,
        endDate: policy.endDate,
        daysRemaining: Math.max(0, daysRemaining),
        status: policy.status,
        paymentStatus: policy.paymentStatus,
        externalRiskContext: {
          ...(policy.externalRiskContext || {}),
          source: liveSource || policy.externalRiskContext?.source || 'unknown',
          locationVerification: liveLocationVerification || policy.externalRiskContext?.locationVerification,
          vpnVerification: liveVpnVerification || policy.externalRiskContext?.vpnVerification
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching policy', error: error.message });
  }
};

// Get policy breakdown
exports.getPolicyBreakdown = async (req, res) => {
  try {
    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserById(req.userId);
      const policy = getPolicyByUserId(req.userId);
      if (!user || !policy) {
        return res.status(404).json({ message: 'No active policy' });
      }

      const totalRisk = Object.values(policy.riskBreakdown || {}).reduce((a, b) => a + b, 0);
      const weights = {
        weatherRisk: 0.3,
        pollutionRisk: 0.2,
        demandRisk: 0.3,
        locationRisk: 0.2
      };

      return res.json({
        totalRiskScore: Math.round(totalRisk / 4),
        riskFactors: Object.entries(policy.riskBreakdown || {}).map(([factor, value]) => ({
          factor: factor.replace('Risk', ''),
          score: value,
          weight: ((weights[factor] || 0) * 100).toFixed(1) + '%',
          contribution: Math.round((value * (weights[factor] || 0)) / 100)
        })),
        premiumCalculation: {
          basePremium: 20,
          riskMultiplier: (policy.weeklyPremium - 20) / 60,
          finalPremium: `INR ${policy.weeklyPremium}`,
          explanation: `Mock fallback mode for ${user.city}.`
        }
      });
    }

    const user = await User.findById(req.userId).populate('activePolicy');

    if (!user || !user.activePolicy) {
      return res.status(404).json({ message: 'No active policy' });
    }

    const policy = user.activePolicy;

    const totalRisk = Object.values(policy.riskBreakdown || {}).reduce((a, b) => a + b, 0);
    const weights = {
      weatherRisk: 0.3,
      pollutionRisk: 0.2,
      demandRisk: 0.3,
      locationRisk: 0.2
    };

    const breakdown = {
      totalRiskScore: Math.round(totalRisk / 4),
      riskFactors: Object.entries(policy.riskBreakdown || {}).map(([factor, value]) => ({
        factor: factor.replace('Risk', ''),
        score: value,
        weight: ((weights[factor] || 0) * 100).toFixed(1) + '%',
        contribution: Math.round((value * (weights[factor] || 0)) / 100)
      })),
      premiumCalculation: {
        basePremium: 20,
        riskMultiplier: (policy.weeklyPremium - 20) / 60,
        finalPremium: `INR ${policy.weeklyPremium}`,
        explanation: `Based on your location (${user.city}), working hours (${user.workingHours.start}-${user.workingHours.end}), and historical risk patterns.`
      }
    };

    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching breakdown', error: error.message });
  }
};

// Renew policy
exports.renewPolicy = async (req, res) => {
  try {
    const userId = req.userId;

    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const oldPolicy = getPolicyByUserId(userId);
      const newPolicy = createMockPolicy({
        userId,
        weeklyPremium: oldPolicy?.weeklyPremium || 50,
        coverageAmount: oldPolicy?.coverageAmount || 5000,
        riskBreakdown: oldPolicy?.riskBreakdown || {
          weatherRisk: 50,
          pollutionRisk: 50,
          demandRisk: 50,
          locationRisk: 50
        },
        coverageHours: oldPolicy?.coverageHours || { start: 9, end: 22 },
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paymentStatus: 'paid',
        externalRiskContext: { source: 'mock-fallback' }
      });

      updateUser(userId, { activePolicy: newPolicy._id });

      return res.json({
        message: 'Policy renewed (mock mode)',
        policy: {
          id: newPolicy._id,
          weeklyPremium: newPolicy.weeklyPremium,
          coverageAmount: newPolicy.coverageAmount,
          startDate: newPolicy.startDate,
          endDate: newPolicy.endDate
        }
      });
    }

    const oldPolicy = await Policy.findOne({ userId, status: 'active' });
    if (oldPolicy) {
      oldPolicy.status = 'expired';
      await oldPolicy.save();
    }

    const newPolicy = new Policy({
      userId,
      weeklyPremium: oldPolicy?.weeklyPremium || 50,
      coverageAmount: oldPolicy?.coverageAmount || 5000,
      riskBreakdown: oldPolicy?.riskBreakdown || {
        weatherRisk: 50,
        pollutionRisk: 50,
        demandRisk: 50,
        locationRisk: 50
      },
      coverageHours: oldPolicy?.coverageHours || { start: 9, end: 22 },
      status: 'active',
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentStatus: 'paid'
    });

    await newPolicy.save();

    await User.findByIdAndUpdate(userId, { activePolicy: newPolicy._id }, { new: true });

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
