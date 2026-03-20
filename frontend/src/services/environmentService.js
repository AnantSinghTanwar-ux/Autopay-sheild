const OPENWEATHER_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
const OPENWEATHER_BASE = 'https://api.openweathermap.org';

const FALLBACK_CITIES = {
  Mumbai: { lat: 19.076, lon: 72.8777 },
  Delhi: { lat: 28.6139, lon: 77.209 },
  Bangalore: { lat: 12.9716, lon: 77.5946 },
  Hyderabad: { lat: 17.385, lon: 78.4867 },
  Chennai: { lat: 13.0827, lon: 80.2707 },
  Kolkata: { lat: 22.5726, lon: 88.3639 }
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const toApproxAqi = (index) => {
  switch (index) {
    case 1: return 40;
    case 2: return 90;
    case 3: return 140;
    case 4: return 230;
    case 5: return 350;
    default: return 120;
  }
};

const seededNoise = (seed) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const getFallbackEnvironmentalData = (city) => {
  const hour = new Date().getHours();
  const base = FALLBACK_CITIES[city] || FALLBACK_CITIES.Mumbai;
  const seed = `${city}-${new Date().toISOString().slice(0, 13)}`
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const temperature = Number((29 + seededNoise(seed + hour) * 11).toFixed(1));
  const rainfall = Number((seededNoise(seed + 17) * 6).toFixed(2));
  const aqi = Math.round(75 + seededNoise(seed + 31) * 260);
  const windSpeed = Number((1.5 + seededNoise(seed + 41) * 6).toFixed(1));

  return {
    city,
    coordinates: { latitude: base.lat, longitude: base.lon },
    temperature,
    rainfall,
    aqi,
    windSpeed,
    source: 'mock',
    observedAt: new Date().toISOString()
  };
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
};

const reverseGeocodeCity = async ({ latitude, longitude }) => {
  if (!OPENWEATHER_KEY) return null;
  try {
    const data = await fetchJson(
      `${OPENWEATHER_BASE}/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${OPENWEATHER_KEY}`
    );
    return data?.[0]?.name || null;
  } catch {
    return null;
  }
};

export const detectBrowserLocation = () => new Promise((resolve) => {
  if (!navigator.geolocation) {
    resolve({ granted: false, reason: 'not_supported' });
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      const city = await reverseGeocodeCity({ latitude, longitude });
      resolve({
        granted: true,
        latitude,
        longitude,
        city: city || null,
        reason: city ? 'reverse_geocode' : 'gps_only'
      });
    },
    () => resolve({ granted: false, reason: 'denied' }),
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
  );
});

export const getLiveEnvironmentalData = async (city, options = {}) => {
  const fallbackCity = city || 'Mumbai';
  const coords = options?.coordinates || null;

  if (!OPENWEATHER_KEY) {
    return getFallbackEnvironmentalData(fallbackCity);
  }

  try {
    let latitude = coords?.latitude;
    let longitude = coords?.longitude;
    let resolvedCity = fallbackCity;

    if (!latitude || !longitude) {
      const geo = await fetchJson(
        `${OPENWEATHER_BASE}/geo/1.0/direct?q=${encodeURIComponent(fallbackCity)},IN&limit=1&appid=${OPENWEATHER_KEY}`
      );
      if (!geo?.[0]) {
        throw new Error('City geocode not found');
      }
      latitude = Number(geo[0].lat);
      longitude = Number(geo[0].lon);
      resolvedCity = geo[0].name || fallbackCity;
    }

    const [weather, air] = await Promise.all([
      fetchJson(
        `${OPENWEATHER_BASE}/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${OPENWEATHER_KEY}`
      ),
      fetchJson(
        `${OPENWEATHER_BASE}/data/2.5/air_pollution?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_KEY}`
      )
    ]);

    const rainfall = Number((weather?.rain?.['1h'] || weather?.rain?.['3h'] || 0).toFixed(2));
    const aqiIndex = Number(air?.list?.[0]?.main?.aqi || 3);

    return {
      city: weather?.name || resolvedCity,
      coordinates: { latitude, longitude },
      temperature: Number((weather?.main?.temp || 30).toFixed(1)),
      rainfall,
      aqi: toApproxAqi(aqiIndex),
      windSpeed: Number((weather?.wind?.speed || 0).toFixed(1)),
      source: 'openweather',
      observedAt: new Date((weather?.dt || Math.floor(Date.now() / 1000)) * 1000).toISOString()
    };
  } catch {
    const fallback = getFallbackEnvironmentalData(fallbackCity);
    if (coords?.latitude && coords?.longitude) {
      fallback.coordinates = {
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude)
      };
      fallback.city = city || fallback.city;
      fallback.aqi = clamp(fallback.aqi + 15, 0, 500);
    }
    return fallback;
  }
};
