const axios = require('axios');
const { CITY_ZONES } = require('../utils/zoneService');
const { detectOrderDrop, generateSmartSuggestion } = require('./triggerIntelligenceService');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY;
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org';
const ENABLE_MOCK_EXTERNAL_APIS = (process.env.ENABLE_MOCK_EXTERNAL_APIS || 'true').toLowerCase() === 'true';
const LOCATION_VERIFY_RADIUS_KM = Number(process.env.LOCATION_VERIFY_RADIUS_KM || 5);
const STRICT_LOCATION_VERIFICATION = (process.env.STRICT_LOCATION_VERIFICATION || 'true').toLowerCase() === 'true';

// Real weather baselines for Indian cities (March 2026)
const realCityWeatherBaselines = {
  Mumbai: { baseTemp: 34, baseRainfall: 0.1, baseAqi: 120, humidity: 68 },
  Delhi: { baseTemp: 37, baseRainfall: 0, baseAqi: 180, humidity: 45 },
  Bangalore: { baseTemp: 29, baseRainfall: 0.2, baseAqi: 80, humidity: 65 },
  Hyderabad: { baseTemp: 33, baseRainfall: 0, baseAqi: 110, humidity: 52 },
  Chennai: { baseTemp: 35, baseRainfall: 0.3, baseAqi: 95, humidity: 72 },
  Kolkata: { baseTemp: 32, baseRainfall: 0.2, baseAqi: 140, humidity: 70 }
};

const getDeterministicNoise = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const getRealisticWeatherVariation = (city, hour) => {
  const baseline = realCityWeatherBaselines[city] || realCityWeatherBaselines.Mumbai;
  const citySeed = city.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const now = new Date();
  const daySeed = Number(now.toISOString().slice(0, 10).replace(/-/g, ''));
  const noise = getDeterministicNoise(citySeed + daySeed + hour);

  // Time-based variation: cooler at dawn, hotter in afternoon.
  const hourVariation = Math.sin((hour - 6) * Math.PI / 12) * 5;
  const dailyVariation = (noise - 0.5) * 3;
  const rainNoise = getDeterministicNoise(citySeed + daySeed + hour + 11);
  const aqiNoise = getDeterministicNoise(citySeed + daySeed + hour + 29);
  const humidityNoise = getDeterministicNoise(citySeed + daySeed + hour + 47);
  
  return {
    temperature: Math.round((baseline.baseTemp + hourVariation + dailyVariation) * 10) / 10,
    rainfall: Math.max(0, baseline.baseRainfall + (rainNoise - 0.5) * 0.25),
    aqi: Math.max(30, baseline.baseAqi + (aqiNoise - 0.5) * 30),
    humidity: Math.max(30, Math.min(90, baseline.humidity + (humidityNoise - 0.5) * 12))
  };
};

const cityWeatherFallback = {
  Mumbai: { temperature: 34, rainfall: 0.1, aqi: 120 },
  Delhi: { temperature: 37, rainfall: 0, aqi: 180 },
  Bangalore: { temperature: 29, rainfall: 0.2, aqi: 80 },
  Hyderabad: { temperature: 33, rainfall: 0, aqi: 110 },
  Chennai: { temperature: 35, rainfall: 0.3, aqi: 95 },
  Kolkata: { temperature: 32, rainfall: 0.2, aqi: 140 }
};

const cityCoordinatesFallback = {
  Mumbai: { latitude: 19.076, longitude: 72.8777 },
  Delhi: { latitude: 28.6139, longitude: 77.209 },
  Bangalore: { latitude: 12.9716, longitude: 77.5946 },
  Hyderabad: { latitude: 17.385, longitude: 78.4867 },
  Chennai: { latitude: 13.0827, longitude: 80.2707 },
  Kolkata: { latitude: 22.5726, longitude: 88.3639 }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hasLiveWeatherKey = () => Boolean(OPENWEATHER_API_KEY);

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

const getCityCoordinates = async (city) => {
  if (!hasLiveWeatherKey()) {
    throw new Error('OPENWEATHER_API_KEY is not configured');
  }

  const response = await axios.get(`${OPENWEATHER_BASE_URL}/geo/1.0/direct`, {
    params: {
      q: `${city},IN`,
      limit: 1,
      appid: OPENWEATHER_API_KEY
    },
    timeout: 7000
  });

  const match = response.data?.[0];
  if (!match) {
    throw new Error(`Unable to resolve coordinates for city: ${city}`);
  }

  return {
    latitude: match.lat,
    longitude: match.lon,
    resolvedName: match.name
  };
};

const fetchCurrentWeatherByCoords = async ({ latitude, longitude }) => {
  const response = await axios.get(`${OPENWEATHER_BASE_URL}/data/2.5/weather`, {
    params: {
      lat: latitude,
      lon: longitude,
      units: 'metric',
      appid: OPENWEATHER_API_KEY
    },
    timeout: 7000
  });

  return response.data;
};

const fetchAirPollutionByCoords = async ({ latitude, longitude }) => {
  const response = await axios.get(`${OPENWEATHER_BASE_URL}/data/2.5/air_pollution`, {
    params: {
      lat: latitude,
      lon: longitude,
      appid: OPENWEATHER_API_KEY
    },
    timeout: 7000
  });

  return response.data;
};

const fetchForecastByCoords = async ({ latitude, longitude }) => {
  const response = await axios.get(`${OPENWEATHER_BASE_URL}/data/2.5/forecast`, {
    params: {
      lat: latitude,
      lon: longitude,
      units: 'metric',
      appid: OPENWEATHER_API_KEY
    },
    timeout: 7000
  });

  return response.data;
};

const getFallbackWeather = (city) => {
  const hour = new Date().getHours();
  const realistic = getRealisticWeatherVariation(city, hour);
  // Build deterministic fallback values for consistent behavior in mock mode.
  const weatherData = {
    temperature: realistic.temperature,
    rainfall: Number(realistic.rainfall.toFixed(2)),
    aqi: Math.round(realistic.aqi),
    humidity: realistic.humidity
  };
  const fallbackCoords = cityCoordinatesFallback[city] || cityCoordinatesFallback.Mumbai;
  return {
    ...weatherData,
    windSpeed: Number((2 + getDeterministicNoise(hour + weatherData.aqi) * 3).toFixed(2)),
    feelsLike: weatherData.temperature - (weatherData.humidity > 70 ? 1 : 0),
    coords: {
      latitude: fallbackCoords.latitude,
      longitude: fallbackCoords.longitude
    },
    cityCenter: {
      latitude: fallbackCoords.latitude,
      longitude: fallbackCoords.longitude
    },
    cityName: city,
    source: 'fallback',
    observedAt: new Date().toISOString()
  };
};

const mapAqiIndexToApproxAqi = (aqiIndex) => {
  switch (aqiIndex) {
    case 1: return 40;
    case 2: return 90;
    case 3: return 140;
    case 4: return 230;
    case 5: return 350;
    default: return 120;
  }
};

const getCurrentWeather = async (city, userGpsLocation = null) => {
  if (!hasLiveWeatherKey()) {
    if (!ENABLE_MOCK_EXTERNAL_APIS) {
      throw new Error('OPENWEATHER_API_KEY is required when ENABLE_MOCK_EXTERNAL_APIS=false');
    }
    return getFallbackWeather(city);
  }

  try {
    const cityCoords = await getCityCoordinates(city);
    const targetCoords = userGpsLocation?.latitude && userGpsLocation?.longitude
      ? { latitude: userGpsLocation.latitude, longitude: userGpsLocation.longitude }
      : cityCoords;

    const [current, air] = await Promise.all([
      fetchCurrentWeatherByCoords(targetCoords),
      fetchAirPollutionByCoords(targetCoords)
    ]);

    const rainfall = Number(current?.rain?.['1h'] || current?.rain?.['3h'] || 0);
    const openWeatherAqiIndex = air?.list?.[0]?.main?.aqi || 3;

    return {
      temperature: Number(current?.main?.temp || 32),
      rainfall,
      aqi: mapAqiIndexToApproxAqi(openWeatherAqiIndex),
      openWeatherAqiIndex,
      humidity: Number(current?.main?.humidity || 60),
      windSpeed: Number(current?.wind?.speed || 2),
      feelsLike: Number(current?.main?.feels_like || current?.main?.temp || 32),
      coords: {
        latitude: Number(targetCoords.latitude),
        longitude: Number(targetCoords.longitude)
      },
      cityCenter: {
        latitude: Number(cityCoords.latitude),
        longitude: Number(cityCoords.longitude)
      },
      cityName: cityCoords.resolvedName || city,
      source: 'openweather',
      observedAt: new Date((current?.dt || Math.floor(Date.now() / 1000)) * 1000).toISOString()
    };
  } catch (error) {
    console.error(`[WeatherService] API call failed for city ${city}:`, error?.response?.status || error?.message);
    if (error?.response?.status === 401) {
      console.error('  401 Unauthorized - Check OpenWeather API key validity');
    }
    if (!ENABLE_MOCK_EXTERNAL_APIS) {
      throw error;
    }
    return getFallbackWeather(city);
  }
};

const verifyLocationAgainstCity = (userGpsLocation, cityCenter, radiusKm = LOCATION_VERIFY_RADIUS_KM) => {
  if (!userGpsLocation?.latitude || !userGpsLocation?.longitude || !cityCenter?.latitude || !cityCenter?.longitude) {
    return {
      status: 'pending',
      withinCityRadius: true,
      reason: 'Insufficient GPS data for verification'
    };
  }

  const distanceKm = calculateDistanceKm(
    { latitude: userGpsLocation.latitude, longitude: userGpsLocation.longitude },
    { latitude: cityCenter.latitude, longitude: cityCenter.longitude }
  );

  return {
    status: distanceKm <= radiusKm ? 'passed' : 'failed',
    withinCityRadius: distanceKm <= radiusKm,
    distanceKm,
    radiusKm,
    reason: distanceKm <= radiusKm ? 'GPS location verified within city radius' : 'GPS location far from registered city'
  };
};

const verifyLocationAgainstServiceArea = (user, weather, radiusKm = LOCATION_VERIFY_RADIUS_KM) => {
  const gps = user?.gpsLocation;
  const city = user?.city;
  const selectedZones = Array.isArray(user?.workingZones) ? user.workingZones : [];

  if (!gps?.latitude || !gps?.longitude) {
    return {
      status: 'pending',
      withinCityRadius: true,
      reason: 'Insufficient GPS data for verification',
      targetType: 'city',
      targetName: city || weather?.cityName || 'unknown'
    };
  }

  const zoneMap = city ? CITY_ZONES[city] : null;
  const validSelectedZones = selectedZones.filter((zone) => zoneMap && zoneMap[zone]);

  if (validSelectedZones.length > 0) {
    let best = null;
    for (const zone of validSelectedZones) {
      const coords = zoneMap[zone];
      const distanceKm = calculateDistanceKm(
        { latitude: gps.latitude, longitude: gps.longitude },
        { latitude: coords.latitude, longitude: coords.longitude }
      );

      if (!best || distanceKm < best.distanceKm) {
        best = { zone, distanceKm };
      }
    }

    const within = best.distanceKm <= radiusKm;
    return {
      status: within ? 'passed' : 'failed',
      withinCityRadius: within,
      distanceKm: best.distanceKm,
      radiusKm,
      targetType: 'zone',
      targetName: best.zone,
      reason: within
        ? `GPS verified near selected service zone ${best.zone}`
        : `GPS location is outside selected service zones; nearest selected zone is ${best.zone}`
    };
  }

  const cityCheck = verifyLocationAgainstCity(gps, weather?.cityCenter || weather?.coords, radiusKm);
  return {
    ...cityCheck,
    targetType: 'city',
    targetName: city || weather?.cityName || 'unknown'
  };
};

const generateOrderData = (user, weather) => {
  const baseOrders = clamp(Math.round((user?.averageEarningsPerHour || 300) / 20), 8, 35);
  const weatherPenalty = clamp((weather.rainfall * 1.8) + Math.max(0, weather.aqi - 150) * 0.04 + Math.max(0, weather.temperature - 36) * 0.9, 0, 0.8);
  const disruptedOrders = Math.max(0, Math.round(baseOrders * (1 - weatherPenalty)));

  return {
    normalOrders: baseOrders,
    disruptedOrders,
    orderDropPercentage: Number((((baseOrders - disruptedOrders) / Math.max(baseOrders, 1)) * 100).toFixed(2))
  };
};

const getLiveRiskFactors = async (city, userGpsLocation = null, user = null) => {
  const weather = await getCurrentWeather(city, userGpsLocation);

  let forecast = null;
  if (weather.source === 'openweather' && weather.coords?.latitude && weather.coords?.longitude) {
    try {
      forecast = await fetchForecastByCoords(weather.coords);
    } catch (error) {
      forecast = null;
    }
  }

  const next12hRain = forecast?.list?.slice(0, 4)?.reduce((sum, item) => sum + Number(item?.rain?.['3h'] || 0), 0) || 0;
  const next12hHotSlots = forecast?.list?.slice(0, 4)?.filter((item) => Number(item?.main?.temp || 0) >= 40)?.length || 0;

  const weatherRisk = clamp(Math.round(20 + (weather.rainfall * 4) + (next12hRain * 2.5) + (next12hHotSlots * 8)), 20, 95);
  const pollutionRisk = clamp(Math.round(20 + (weather.aqi / 4)), 20, 95);
  const demandRisk = clamp(Math.round(20 + (Math.max(0, weather.rainfall - 1) * 3) + (Math.max(0, weather.aqi - 120) * 0.12) + (Math.max(0, weather.temperature - 34) * 2)), 20, 95);

  const locationVerification = user
    ? verifyLocationAgainstServiceArea(user, weather)
    : verifyLocationAgainstCity(userGpsLocation, weather.cityCenter || weather.coords);
  const locationRisk = locationVerification.status === 'failed'
    ? 90
    : clamp(Math.round(35 + (locationVerification.distanceKm || 0) * 2.5), 20, 80);

  return {
    riskFactors: {
      weatherRisk,
      pollutionRisk,
      demandRisk,
      locationRisk
    },
    weather,
    locationVerification,
    source: weather.source,
    forecastSummary: {
      next12hRain: Number(next12hRain.toFixed(2)),
      next12hHotSlots
    }
  };
};

const checkTriggers = async (city, user) => {
  const weather = await getCurrentWeather(city, user?.gpsLocation);
  const triggers = [];

  if (weather.rainfall > 5) {
    triggers.push({ type: 'rain', value: weather.rainfall, triggered: true });
  }
  if (weather.temperature > 40) {
    triggers.push({ type: 'heat', value: weather.temperature, triggered: true });
  }
  if (weather.aqi > 300) {
    triggers.push({ type: 'pollution', value: weather.aqi, triggered: true });
  }

  const orderData = generateOrderData(user, weather);
  const orderDropSignal = detectOrderDrop({
    currentOrders: orderData.disruptedOrders,
    historicalAverageOrders: orderData.normalOrders
  });

  if (orderDropSignal.triggered) {
    triggers.push({ type: 'order_drop', value: orderData.orderDropPercentage, triggered: true });
  }

  const locationVerification = verifyLocationAgainstServiceArea(user, weather);
  if (locationVerification.status === 'failed') {
    triggers.push({
      type: 'zone_restriction',
      value: locationVerification.distanceKm,
      triggered: true
    });
  }

  return {
    triggers,
    weatherData: weather,
    orderData,
    orderDropSignal,
    locationVerification
  };
};

const predictUpcomingDisruptions = async (city, user = null) => {
  const weather = await getCurrentWeather(city, user?.gpsLocation);
  const predictions = [];

  if (weather.source === 'openweather' && weather.coords?.latitude && weather.coords?.longitude) {
    try {
      const forecast = await fetchForecastByCoords(weather.coords);
      const slots = forecast?.list?.slice(0, 6) || [];

      const highRain = slots.find((slot) => Number(slot?.rain?.['3h'] || 0) > 8);
      const highHeat = slots.find((slot) => Number(slot?.main?.temp || 0) > 40);

      if (highRain) {
        predictions.push({
          type: 'heavy_rain',
          probability: 0.82,
          timeFrame: new Date((highRain.dt || 0) * 1000).toLocaleString('en-IN'),
          expectedImpact: 'High'
        });
      }

      if (highHeat) {
        predictions.push({
          type: 'extreme_heat',
          probability: 0.75,
          timeFrame: new Date((highHeat.dt || 0) * 1000).toLocaleString('en-IN'),
          expectedImpact: 'Medium'
        });
      }
    } catch (error) {
      // Non-fatal for predictions endpoint.
    }
  }

  if (predictions.length === 0 && weather.temperature > 38) {
    predictions.push({
      type: 'extreme_heat',
      probability: 0.6,
      timeFrame: 'next 2-4 hours',
      expectedImpact: 'Medium'
    });
  }

  const smartSuggestion = generateSmartSuggestion(user, predictions, {
    city,
    weather
  });

  return {
    predictions,
    smartSuggestion
  };
};

module.exports = {
  getCurrentWeather,
  checkTriggers,
  predictUpcomingDisruptions,
  getLiveRiskFactors,
  verifyLocationAgainstCity,
  verifyLocationAgainstServiceArea,
  calculateDistanceKm,
  STRICT_LOCATION_VERIFICATION
};
