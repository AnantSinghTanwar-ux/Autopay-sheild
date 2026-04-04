const User = require('../models/User');
const { generateToken } = require('../utils/helpers');

// Register new user
exports.register = async (req, res) => {
  try {
    const { name, email, password, city, workingZones, workingHours } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    user = new User({
      name,
      email,
      password,
      city,
      workingZones: workingZones || [],
      workingHours: workingHours || { start: 9, end: 22 },
      riskScore: 50,
      averageEarningsPerHour: 300,
      peakHours: [18, 19, 20, 21],
      earningsHistory: []
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
        city: user.city
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch && user.password !== password) {
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
        riskScore: user.riskScore,
        averageEarningsPerHour: user.averageEarningsPerHour,
        peakHours: user.peakHours || [18, 19, 20, 21],
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
    const { workingZones, workingHours, gpsLocation, city, autoSelectNearestZone } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (city) user.city = city;
    if (workingZones) user.workingZones = workingZones;
    if (workingHours) user.workingHours = workingHours;
    if (gpsLocation) {
      user.gpsLocation = { ...gpsLocation, lastUpdated: new Date() };
    }

    // Zone suggestion based on GPS
    const { suggestZone } = require('../utils/zoneService');
    const effectiveCity = city || user.city || 'Mumbai';
    const effectiveGps = gpsLocation || user.gpsLocation;
    const zoneSuggestion = suggestZone({ city: effectiveCity, gpsLocation: effectiveGps });

    // Auto-assign nearest zone if requested and no zones are explicitly set
    if (autoSelectNearestZone && zoneSuggestion?.nearestZone?.zone) {
      const currentZones = workingZones || user.workingZones || [];
      if (currentZones.length === 0) {
        user.workingZones = [zoneSuggestion.nearestZone.zone];
      }
    }

    await user.save();

    res.json({
      message: 'Profile updated',
      user: {
        id: user._id,
        name: user.name,
        city: user.city,
        workingZones: user.workingZones,
        workingHours: user.workingHours,
        riskScore: user.riskScore
      },
      zoneSuggestion
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// Log earnings (for Income DNA)
exports.logEarnings = async (req, res) => {
  try {
    const { earnings, ordersCompleted, hoursWorked, location } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!Array.isArray(user.earningsHistory)) {
      user.earningsHistory = [];
    }

    user.earningsHistory.push({
      date: new Date(),
      earnings: Number(earnings) || 0,
      ordersCompleted: Number(ordersCompleted) || 0,
      hoursWorked: Number(hoursWorked) || 1,
      location
    });

    if (user.earningsHistory.length > 30) {
      user.earningsHistory = user.earningsHistory.slice(-30);
    }

    const totalEarnings = user.earningsHistory.reduce((sum, entry) => sum + entry.earnings, 0);
    const totalHours = user.earningsHistory.reduce((sum, entry) => sum + entry.hoursWorked, 0);
    user.averageEarningsPerHour = Math.round(totalEarnings / Math.max(totalHours, 1)) || 300;

    const hourCounts = {};
    user.earningsHistory.forEach(entry => {
      const hour = new Date(entry.date).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + entry.earnings;
    });
    user.peakHours = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([hour]) => parseInt(hour));

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

exports.getZoneSuggestion = async (req, res) => { res.json({ zones: [] }); };
exports.getIncomeDna = async (req, res) => { res.json({ dna: {} }); };
exports.deleteMe = async (req, res) => { res.json({ message: 'Deleted' }); };
