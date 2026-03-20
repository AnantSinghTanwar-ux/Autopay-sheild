const DEFAULT_EARNING_PER_HOUR = 300;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getDurationHours = (timeWindow) => {
  if (!timeWindow?.start || !timeWindow?.end) return 0;
  const ms = new Date(timeWindow.end).getTime() - new Date(timeWindow.start).getTime();
  return Math.max(0, ms / (1000 * 60 * 60));
};

const getHoursInWindow = (timeWindow) => {
  const start = new Date(timeWindow.start);
  const end = new Date(timeWindow.end);
  const hours = [];

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return hours;
  }

  const cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(cursor);
    next.setHours(cursor.getHours() + 1, 0, 0, 0);
    const chunkEnd = next < end ? next : end;
    const durationHours = (chunkEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60);
    hours.push({ hour: cursor.getHours(), durationHours });
    cursor.setTime(chunkEnd.getTime());
  }

  return hours;
};

const buildIncomeDnaProfile = (user) => {
  const history = Array.isArray(user?.earningsHistory) ? user.earningsHistory : [];
  const baseEarningsPerHour = user?.averageEarningsPerHour > 0
    ? Number(user.averageEarningsPerHour)
    : DEFAULT_EARNING_PER_HOUR;

  const hourBuckets = {};
  const zoneBuckets = {};

  for (const entry of history) {
    const date = new Date(entry.date);
    if (Number.isNaN(date.getTime())) continue;

    const hour = date.getHours();
    const earnings = Number(entry.earnings || 0);
    const hoursWorked = Number(entry.hoursWorked || 1) || 1;
    const eph = earnings / Math.max(hoursWorked, 0.5);

    if (!hourBuckets[hour]) {
      hourBuckets[hour] = { totalEarningsPerHour: 0, samples: 0 };
    }
    hourBuckets[hour].totalEarningsPerHour += eph;
    hourBuckets[hour].samples += 1;

    const zone = entry.location || 'unknown';
    if (!zoneBuckets[zone]) {
      zoneBuckets[zone] = { totalEarnings: 0, totalHours: 0, samples: 0 };
    }
    zoneBuckets[zone].totalEarnings += earnings;
    zoneBuckets[zone].totalHours += hoursWorked;
    zoneBuckets[zone].samples += 1;
  }

  const hourlyEarnings = {};
  Object.entries(hourBuckets).forEach(([hour, bucket]) => {
    hourlyEarnings[hour] = Number((bucket.totalEarningsPerHour / Math.max(bucket.samples, 1)).toFixed(2));
  });

  const zoneProductivity = {};
  Object.entries(zoneBuckets).forEach(([zone, bucket]) => {
    const zoneEph = bucket.totalEarnings / Math.max(bucket.totalHours, 1);
    const productivityIndex = clamp(zoneEph / Math.max(baseEarningsPerHour, 1), 0.6, 1.6);
    zoneProductivity[zone] = {
      earningsPerHour: Number(zoneEph.toFixed(2)),
      productivityIndex: Number(productivityIndex.toFixed(2)),
      samples: bucket.samples
    };
  });

  const peakHours = Object.entries(hourlyEarnings)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([hour]) => Number(hour));

  return {
    baseEarningsPerHour,
    hourlyEarnings,
    zoneProductivity,
    peakHours,
    historySamples: history.length
  };
};

// FEATURE 1: Personalized Income DNA prediction
const predictExpectedIncome = (user, timeWindow, options = {}) => {
  const profile = buildIncomeDnaProfile(user);
  const hourChunks = getHoursInWindow(timeWindow);

  if (hourChunks.length === 0) {
    return {
      expectedIncome: 0,
      expectedPerHour: profile.baseEarningsPerHour,
      usedHours: [],
      dnaProfile: profile
    };
  }

  const zone = options.zone || options.location || null;
  const zoneStats = zone && profile.zoneProductivity[zone] ? profile.zoneProductivity[zone] : null;
  const zoneMultiplier = zoneStats ? zoneStats.productivityIndex : 1;

  let expectedIncome = 0;
  const usedHours = [];

  for (const chunk of hourChunks) {
    const hourBase = profile.hourlyEarnings[chunk.hour] || profile.baseEarningsPerHour;
    const weightedHourEph = hourBase * zoneMultiplier;
    const chunkIncome = weightedHourEph * chunk.durationHours;
    expectedIncome += chunkIncome;

    usedHours.push({
      hour: chunk.hour,
      durationHours: Number(chunk.durationHours.toFixed(2)),
      earningsPerHour: Number(weightedHourEph.toFixed(2)),
      estimatedIncome: Number(chunkIncome.toFixed(2))
    });
  }

  const durationHours = getDurationHours(timeWindow);
  return {
    expectedIncome: Math.round(expectedIncome),
    expectedPerHour: Number((expectedIncome / Math.max(durationHours, 1)).toFixed(2)),
    zoneMultiplier: Number(zoneMultiplier.toFixed(2)),
    zoneProductivity: zoneStats || null,
    usedHours,
    dnaProfile: profile
  };
};

module.exports = {
  buildIncomeDnaProfile,
  predictExpectedIncome
};
