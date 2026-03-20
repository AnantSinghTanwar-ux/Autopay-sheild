const CITY_CENTERS = {
  Mumbai: { latitude: 19.076, longitude: 72.8777 },
  Delhi: { latitude: 28.6139, longitude: 77.209 },
  Bangalore: { latitude: 12.9716, longitude: 77.5946 },
  Hyderabad: { latitude: 17.385, longitude: 78.4867 },
  Chennai: { latitude: 13.0827, longitude: 80.2707 },
  Kolkata: { latitude: 22.5726, longitude: 88.3639 }
};

// Zone anchors are rough operational centers for assignment.
const CITY_ZONES = {
  Mumbai: {
    'Zone A': { latitude: 19.109, longitude: 72.874 },
    'Zone B': { latitude: 19.041, longitude: 72.862 },
    'Zone C': { latitude: 19.175, longitude: 72.956 },
    'Zone D': { latitude: 18.987, longitude: 72.836 }
  },
  Delhi: {
    'Zone A': { latitude: 28.7041, longitude: 77.1025 },
    'Zone B': { latitude: 28.6328, longitude: 77.2197 },
    'Zone C': { latitude: 28.5355, longitude: 77.391 },
    'Zone D': { latitude: 28.4595, longitude: 77.0266 }
  },
  Bangalore: {
    'Zone A': { latitude: 13.0352, longitude: 77.597 },
    'Zone B': { latitude: 12.9719, longitude: 77.6412 },
    'Zone C': { latitude: 12.91, longitude: 77.5858 },
    'Zone D': { latitude: 12.9784, longitude: 77.7478 }
  },
  Hyderabad: {
    'Zone A': { latitude: 17.455, longitude: 78.46 },
    'Zone B': { latitude: 17.385, longitude: 78.4867 },
    'Zone C': { latitude: 17.323, longitude: 78.401 },
    'Zone D': { latitude: 17.452, longitude: 78.569 }
  },
  Chennai: {
    'Zone A': { latitude: 13.0827, longitude: 80.2707 },
    'Zone B': { latitude: 13.0475, longitude: 80.211 },
    // Kattankulathur / GST corridor cluster
    'Zone C': { latitude: 12.8222, longitude: 80.0444 },
    'Zone D': { latitude: 13.1209, longitude: 80.2921 }
  },
  Kolkata: {
    'Zone A': { latitude: 22.5726, longitude: 88.3639 },
    'Zone B': { latitude: 22.6199, longitude: 88.4467 },
    'Zone C': { latitude: 22.4986, longitude: 88.3054 },
    'Zone D': { latitude: 22.472, longitude: 88.412 }
  }
};

const toRad = (degrees) => (degrees * Math.PI) / 180;

const calculateDistanceKm = (from, to) => {
  if (!from || !to) return null;
  const R = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
};

const normalizeGps = (gpsLocation) => {
  if (!gpsLocation?.latitude || !gpsLocation?.longitude) return null;
  return {
    latitude: Number(gpsLocation.latitude),
    longitude: Number(gpsLocation.longitude)
  };
};

const inferNearestCity = (gpsLocation) => {
  const gps = normalizeGps(gpsLocation);
  if (!gps) return null;

  let nearest = null;
  for (const [city, coords] of Object.entries(CITY_CENTERS)) {
    const distanceKm = calculateDistanceKm(gps, coords);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { city, distanceKm };
    }
  }

  return nearest;
};

const getNearestZoneForCity = (city, gpsLocation) => {
  const gps = normalizeGps(gpsLocation);
  if (!city || !gps) return null;

  const zoneMap = CITY_ZONES[city];
  if (!zoneMap) return null;

  let nearest = null;
  for (const [zone, coords] of Object.entries(zoneMap)) {
    const distanceKm = calculateDistanceKm(gps, coords);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { zone, distanceKm };
    }
  }

  return nearest;
};

const suggestZone = ({ city, gpsLocation }) => {
  const gps = normalizeGps(gpsLocation);
  if (!gps) {
    return {
      city: city || null,
      nearestCity: null,
      nearestZone: null,
      message: 'Enable location access to auto-detect nearest zone.'
    };
  }

  const nearestCity = inferNearestCity(gps);
  const effectiveCity = city || nearestCity?.city || null;
  const nearestZone = effectiveCity ? getNearestZoneForCity(effectiveCity, gps) : null;

  let message = 'Nearest zone detected from current location.';
  if (city && nearestCity && nearestCity.city !== city) {
    message = `You are currently closer to ${nearestCity.city}.`;
  }

  return {
    city: effectiveCity,
    nearestCity,
    nearestZone,
    message
  };
};

module.exports = {
  CITY_ZONES,
  CITY_CENTERS,
  suggestZone,
  getNearestZoneForCity,
  inferNearestCity
};
