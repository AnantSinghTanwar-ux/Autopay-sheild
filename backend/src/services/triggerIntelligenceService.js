const Claim = require('../models/Claim');
const { buildIncomeDnaProfile } = require('./incomeDnaService');
const { CITY_ZONES } = require('../utils/zoneService');

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getDeterministicNoise = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const estimateTrafficIndex = (zone, hour, city = '') => {
  const seed = `${city}-${zone}`.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const noise = getDeterministicNoise(seed + hour);
  const peakBoost = (hour >= 12 && hour <= 15) || (hour >= 18 && hour <= 21) ? 16 : 0;
  return clamp(Math.round(35 + noise * 38 + peakBoost), 15, 95);
};

const buildZoneSignals = (user, context = {}) => {
  const city = context.city || user?.city;
  const zonesInCity = Object.keys(CITY_ZONES[city] || {});
  const fallbackZones = Array.isArray(user?.workingZones) && user.workingZones.length > 0
    ? user.workingZones
    : ['Zone A', 'Zone B', 'Zone C', 'Zone D'];
  const zones = zonesInCity.length > 0 ? zonesInCity : fallbackZones;

  const weather = context.weather || {};
  const rain = Number(weather.rainfall || 0);
  const heat = Number(weather.temperature || 32);
  const aqi = Number(weather.aqi || 120);
  const hour = new Date().getHours();

  return zones.map((zone) => {
    const zoneBiasSeed = `${city}-${zone}-weather`.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const weatherBias = Number((getDeterministicNoise(zoneBiasSeed + hour) * 12 - 6).toFixed(2));
    const weatherRisk = clamp(Math.round((rain * 4.2) + Math.max(0, heat - 35) * 2 + Math.max(0, aqi - 140) * 0.15 + weatherBias), 0, 95);
    const trafficRisk = estimateTrafficIndex(zone, hour, city);
    const totalRisk = clamp(Math.round((weatherRisk * 0.55) + (trafficRisk * 0.45)), 0, 100);

    return {
      zone,
      weatherRisk,
      trafficRisk,
      totalRisk
    };
  });
};

// FEATURE 4: Smart order-drop trigger
const detectOrderDrop = (zoneData) => {
  const current = Number(zoneData?.currentOrders || 0);
  const historicalAverage = Number(zoneData?.historicalAverageOrders || 0);

  if (historicalAverage <= 0) {
    return {
      triggered: false,
      dropPercentage: 0,
      reason: 'Insufficient historical order data'
    };
  }

  const dropPercentage = Number((((historicalAverage - current) / historicalAverage) * 100).toFixed(2));
  const triggered = dropPercentage > 40;

  return {
    triggered,
    dropPercentage,
    threshold: 40,
    reason: triggered
      ? `Order drop detected: ${dropPercentage}% below historical average`
      : `Order drop within normal range: ${dropPercentage}%`
  };
};

// FEATURE 5: Pre-loss AI suggestion
const generateSmartSuggestion = (user, forecastData = [], context = {}) => {
  const dna = buildIncomeDnaProfile(user);
  const zoneSignals = buildZoneSignals(user, context);

  if (!Array.isArray(forecastData) || forecastData.length === 0) {
    const ranked = zoneSignals
      .map((zoneSignal) => ({
        ...zoneSignal,
        opportunityScore: clamp(100 - zoneSignal.totalRisk, 0, 100)
      }))
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
    const best = ranked[0];

    return {
      title: best ? `Best zone now: ${best.zone}` : 'No major disruptions predicted',
      message: best
        ? `Low disruption pattern currently. Prefer ${best.zone} with lower weather-risk and traffic load in the next 1-2 hours.`
        : 'Continue in your current zone. No high-risk alert in the next 2-3 hours.',
      confidence: 0.7,
      recommendedZone: best?.zone,
      metrics: best ? {
        bestZoneRisk: best.totalRisk,
        bestZoneTrafficRisk: best.trafficRisk,
        bestZoneWeatherRisk: best.weatherRisk
      } : undefined,
      zoneRanking: ranked
    };
  }

  const zoneForecast = {};
  for (const zoneSignal of zoneSignals) {
    const zone = zoneSignal.zone;
    const risk = forecastData
      .filter((item) => !item.zone || item.zone === zone)
      .reduce((sum, item) => sum + Number(item.probability || 0), 0);

    const productivity = dna.zoneProductivity?.[zone]?.productivityIndex || 1;
    const opportunityScore = (productivity * 100) - (risk * 60) - (zoneSignal.totalRisk * 0.8);
    zoneForecast[zone] = {
      risk,
      productivity,
      weatherRisk: zoneSignal.weatherRisk,
      trafficRisk: zoneSignal.trafficRisk,
      totalRisk: zoneSignal.totalRisk,
      opportunityScore
    };
  }

  const sorted = Object.entries(zoneForecast).sort(([, a], [, b]) => b.opportunityScore - a.opportunityScore);
  const [bestZone, best] = sorted[0];
  const [worstZone, worst] = sorted[sorted.length - 1];

  const upside = Number((((best.opportunityScore - worst.opportunityScore) / Math.max(Math.abs(worst.opportunityScore), 1)) * 100).toFixed(0));

  return {
    title: `Move to ${bestZone} for better earnings`,
    message: `Disruption and traffic risk are higher in ${worstZone}. Shift to ${bestZone} for an estimated ${Math.max(upside, 15)}% higher expected earnings in the next window.`,
    recommendedZone: bestZone,
    avoidZone: worstZone,
    confidence: 0.78,
    metrics: {
      bestZoneRisk: Number(best.totalRisk.toFixed(2)),
      bestZoneTrafficRisk: Number(best.trafficRisk.toFixed(2)),
      bestZoneWeatherRisk: Number(best.weatherRisk.toFixed(2)),
      bestZoneProductivity: best.productivity,
      projectedUpsidePercent: Math.max(upside, 15)
    },
    zoneRanking: sorted.map(([zone, value]) => ({ zone, ...value }))
  };
};

// FEATURE 6: Dynamic risk score
const calculateRiskScore = async (user, context = {}) => {
  const weatherRisk = Number(context.weatherRisk || 45);
  const locationRisk = Number(context.locationRisk || 45);

  const currentHour = new Date().getHours();
  const peakHours = Array.isArray(user?.peakHours) ? user.peakHours : [];
  const timeOfDayRisk = peakHours.includes(currentHour) ? 35 : 55;

  const disruptionCount = await Claim.countDocuments({
    userId: user._id,
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  const historicalDisruptionRisk = clamp(20 + disruptionCount * 7, 20, 90);

  const riskScore = Math.round(
    (weatherRisk * 0.3) +
    (locationRisk * 0.3) +
    (timeOfDayRisk * 0.2) +
    (historicalDisruptionRisk * 0.2)
  );

  return {
    riskScore: clamp(riskScore, 0, 100),
    factors: {
      weatherRisk,
      locationRisk,
      timeOfDayRisk,
      historicalDisruptionRisk
    }
  };
};

module.exports = {
  detectOrderDrop,
  generateSmartSuggestion,
  calculateRiskScore
};
