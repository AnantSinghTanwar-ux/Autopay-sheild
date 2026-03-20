const User = require('../models/User');
const Policy = require('../models/Policy');
const Claim = require('../models/Claim');
const mongoose = require('mongoose');
const { generateToken } = require('../utils/helpers');
const { suggestZone } = require('../utils/zoneService');
const { buildIncomeDnaProfile, predictExpectedIncome } = require('../services/incomeDnaService');
const {
  findUserByEmail,
  findUserById,
  createUser,
  updateUser
} = require('../mockDatabase');

const USE_MOCK_FALLBACK = (process.env.USE_MOCK_DB_FALLBACK || 'true').toLowerCase() === 'true';
const isMongoConnected = () => mongoose.connection.readyState === 1;

// Register new user
exports.register = async (req, res) => {
  try {
    const { name, email, password, city, workingZones, workingHours, gpsLocation, autoSelectNearestZone = true } = req.body;

    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const existingUser = findUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      const zoneSuggestion = suggestZone({ city, gpsLocation });
      const effectiveCity = zoneSuggestion.city || city;
      const effectiveZones = Array.isArray(workingZones) && workingZones.length > 0
        ? workingZones
        : (autoSelectNearestZone && zoneSuggestion.nearestZone?.zone ? [zoneSuggestion.nearestZone.zone] : []);

      const mockUser = createUser({
        name,
        email,
        password,
        city: effectiveCity,
        workingZones: effectiveZones,
        workingHours: workingHours || { start: 9, end: 22 },
        riskScore: 50,
        averageEarningsPerHour: 300,
        ...(gpsLocation && { gpsLocation: { ...gpsLocation, lastUpdated: new Date() } })
      });

      const token = generateToken(mockUser._id);

      return res.status(201).json({
        message: 'Registration successful (mock mode)',
        token,
        user: {
          id: mockUser._id,
          name: mockUser.name,
          email: mockUser.email,
          city: mockUser.city,
          workingZones: mockUser.workingZones
        },
        zoneSuggestion
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const zoneSuggestion = suggestZone({ city, gpsLocation });
    const effectiveCity = zoneSuggestion.city || city;
    const effectiveZones = Array.isArray(workingZones) && workingZones.length > 0
      ? workingZones
      : (autoSelectNearestZone && zoneSuggestion.nearestZone?.zone ? [zoneSuggestion.nearestZone.zone] : []);

    const user = new User({
      name,
      email,
      password,
      city: effectiveCity,
      workingZones: effectiveZones,
      workingHours: workingHours || { start: 9, end: 22 },
      riskScore: 50,
      averageEarningsPerHour: 300,
      ...(gpsLocation && { gpsLocation: { ...gpsLocation, lastUpdated: new Date() } })
    });

    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        city: user.city,
        workingZones: user.workingZones
      },
      zoneSuggestion
    });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserByEmail(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = generateToken(user._id);
      return res.json({
        message: 'Login successful (mock mode)',
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          city: user.city
        }
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = generateToken(user._id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        city: user.city
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserById(req.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          city: user.city,
          workingZones: user.workingZones || [],
          workingHours: user.workingHours || { start: 9, end: 22 },
          gpsLocation: user.gpsLocation,
          riskScore: user.riskScore || 50,
          averageEarningsPerHour: user.averageEarningsPerHour || 300,
          peakHours: user.peakHours || [],
          activePolicy: null
        }
      });
    }

    const user = await User.findById(req.userId).populate('activePolicy');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        city: user.city,
        workingZones: user.workingZones,
        workingHours: user.workingHours,
        gpsLocation: user.gpsLocation,
        riskScore: user.riskScore,
        averageEarningsPerHour: user.averageEarningsPerHour,
        peakHours: user.peakHours,
        activePolicy: user.activePolicy
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { city, workingZones, workingHours, gpsLocation, autoSelectNearestZone = false } = req.body;

    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const currentUser = findUserById(req.userId);
      if (!currentUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      const nextCity = city || currentUser.city;
      const nextGps = gpsLocation || currentUser.gpsLocation;
      const zoneSuggestion = suggestZone({ city: nextCity, gpsLocation: nextGps });

      const shouldAutoAssign = autoSelectNearestZone && (!workingZones || workingZones.length === 0);
      const computedZones = shouldAutoAssign && zoneSuggestion.nearestZone?.zone
        ? [zoneSuggestion.nearestZone.zone]
        : workingZones;

      const updated = updateUser(req.userId, {
        ...(city && { city }),
        ...(computedZones && { workingZones: computedZones }),
        ...(workingHours && { workingHours }),
        ...(gpsLocation && { gpsLocation: { ...gpsLocation, lastUpdated: new Date() } })
      });

      return res.json({
        message: 'Profile updated (mock mode)',
        user: {
          id: updated._id,
          name: updated.name,
          city: updated.city,
          workingZones: updated.workingZones,
          workingHours: updated.workingHours,
          gpsLocation: updated.gpsLocation,
          riskScore: updated.riskScore
        },
        zoneSuggestion
      });
    }

    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const nextCity = city || currentUser.city;
    const nextGps = gpsLocation || currentUser.gpsLocation;
    const zoneSuggestion = suggestZone({ city: nextCity, gpsLocation: nextGps });

    const shouldAutoAssign = autoSelectNearestZone && (!workingZones || workingZones.length === 0);
    const computedZones = shouldAutoAssign && zoneSuggestion.nearestZone?.zone
      ? [zoneSuggestion.nearestZone.zone]
      : workingZones;

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        ...(city && { city }),
        ...(computedZones && { workingZones: computedZones }),
        ...(workingHours && { workingHours }),
        ...(gpsLocation && { gpsLocation: { ...gpsLocation, lastUpdated: new Date() } })
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated',
      user: {
        id: user._id,
        name: user.name,
        city: user.city,
        workingZones: user.workingZones,
        workingHours: user.workingHours,
        gpsLocation: user.gpsLocation,
        riskScore: user.riskScore
      },
      zoneSuggestion
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// Suggest nearest zone from city + GPS (public for registration flow)
exports.getZoneSuggestion = async (req, res) => {
  try {
    const { city, gpsLocation } = req.body;
    const suggestion = suggestZone({ city, gpsLocation });
    res.json({ suggestion });
  } catch (error) {
    res.status(500).json({ message: 'Error calculating zone suggestion', error: error.message });
  }
};

// Delete currently authenticated user and related data
exports.deleteMe = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await Promise.all([
      Claim.deleteMany({ userId }),
      Policy.deleteMany({ userId }),
      User.findByIdAndDelete(userId)
    ]);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting account', error: error.message });
  }
};

// Log earnings (for Income DNA)
exports.logEarnings = async (req, res) => {
  try {
    const { earnings, ordersCompleted, hoursWorked, location } = req.body;

    if (!isMongoConnected() && USE_MOCK_FALLBACK) {
      const user = findUserById(req.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const history = Array.isArray(user.earningsHistory) ? user.earningsHistory : [];
      history.push({
        date: new Date(),
        earnings,
        ordersCompleted,
        hoursWorked,
        location
      });

      const last30 = history.slice(-30);
      const totalEarnings = last30.reduce((sum, entry) => sum + (entry.earnings || 0), 0);
      const totalHours = last30.reduce((sum, entry) => sum + (entry.hoursWorked || 0), 0);
      const averageEarningsPerHour = Math.round(totalEarnings / Math.max(totalHours, 1)) || 300;

      const hourCounts = {};
      last30.forEach((entry) => {
        const hour = new Date(entry.date).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + (entry.earnings || 0);
      });
      const peakHours = Object.entries(hourCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([hour]) => parseInt(hour, 10));

      updateUser(req.userId, {
        earningsHistory: last30,
        averageEarningsPerHour,
        peakHours
      });

      return res.json({
        message: 'Earnings logged (mock mode)',
        averageEarningsPerHour,
        peakHours
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.earningsHistory.push({
      date: new Date(),
      earnings,
      ordersCompleted,
      hoursWorked,
      location
    });

    if (user.earningsHistory.length > 30) {
      user.earningsHistory = user.earningsHistory.slice(-30);
    }

    const totalEarnings = user.earningsHistory.reduce((sum, entry) => sum + (entry.earnings || 0), 0);
    const totalHours = user.earningsHistory.reduce((sum, entry) => sum + (entry.hoursWorked || 0), 0);
    user.averageEarningsPerHour = Math.round(totalEarnings / Math.max(totalHours, 1)) || 300;

    const hourCounts = {};
    user.earningsHistory.forEach((entry) => {
      const hour = new Date(entry.date).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + (entry.earnings || 0);
    });

    user.peakHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([hour]) => parseInt(hour, 10));

    await user.save();

    res.json({
      message: 'Earnings logged',
      averageEarningsPerHour: user.averageEarningsPerHour,
      peakHours: user.peakHours
    });
  } catch (error) {
    res.status(500).json({ message: 'Error logging earnings', error: error.message });
  }
};

// FEATURE 1: Inspect personalized Income DNA and expected income projection
exports.getIncomeDna = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const timeWindow = {
      start: new Date(),
      end: new Date(Date.now() + 2 * 60 * 60 * 1000)
    };

    const profile = buildIncomeDnaProfile(user);
    const prediction = predictExpectedIncome(user, timeWindow, {
      zone: user?.workingZones?.[0]
    });

    res.json({
      profile,
      prediction,
      message: 'Income DNA generated from historical earnings, peak-hour patterns, and zone productivity.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error generating Income DNA', error: error.message });
  }
};
