const axios = require('axios');

const STRICT_VPN_CHECK = (process.env.STRICT_VPN_CHECK || 'false').toLowerCase() === 'true';
const VPN_GPS_IP_DISTANCE_KM = Number(process.env.VPN_GPS_IP_DISTANCE_KM || 150);

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

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }

  return (
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    ''
  );
};

const normalizeIp = (rawIp) => {
  if (!rawIp) return '';
  if (rawIp.startsWith('::ffff:')) return rawIp.replace('::ffff:', '');
  return rawIp;
};

const isLocalOrPrivateIp = (ip) => {
  if (!ip) return true;

  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)
  );
};

const evaluateNetworkRisk = async (req, userGpsLocation) => {
  const ip = normalizeIp(getClientIp(req));

  if (isLocalOrPrivateIp(ip)) {
    return {
      status: 'passed',
      source: 'local',
      ip,
      reason: 'Local/private IP detected; VPN check skipped in development.'
    };
  }

  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`, {
      params: {
        fields: 'status,message,city,country,lat,lon,proxy,hosting,mobile'
      },
      timeout: 4000
    });

    const data = response.data || {};
    if (data.status !== 'success') {
      return {
        status: 'pending',
        source: 'ip-api',
        ip,
        reason: `IP lookup unavailable: ${data.message || 'unknown error'}`
      };
    }

    const proxyDetected = Boolean(data.proxy);
    const hostingDetected = Boolean(data.hosting);

    if (proxyDetected || hostingDetected) {
      return {
        status: 'failed',
        source: 'ip-api',
        ip,
        proxyDetected,
        hostingDetected,
        reason: 'Proxy/VPN-like network detected from IP intelligence.'
      };
    }

    const hasGps = userGpsLocation?.latitude && userGpsLocation?.longitude;
    const hasIpGeo = data.lat && data.lon;

    if (hasGps && hasIpGeo) {
      const distanceKm = calculateDistanceKm(
        { latitude: Number(userGpsLocation.latitude), longitude: Number(userGpsLocation.longitude) },
        { latitude: Number(data.lat), longitude: Number(data.lon) }
      );

      if (distanceKm > VPN_GPS_IP_DISTANCE_KM) {
        return {
          status: 'failed',
          source: 'ip-api',
          ip,
          distanceKm,
          thresholdKm: VPN_GPS_IP_DISTANCE_KM,
          reason: `IP location and GPS are too far apart (${distanceKm} km).`
        };
      }

      return {
        status: 'passed',
        source: 'ip-api',
        ip,
        distanceKm,
        reason: 'IP and GPS distance is within allowed range.'
      };
    }

    return {
      status: 'pending',
      source: 'ip-api',
      ip,
      reason: 'GPS not available for IP distance validation.'
    };
  } catch (error) {
    return {
      status: 'pending',
      source: 'ip-api',
      ip,
      reason: 'IP intelligence service unavailable.'
    };
  }
};

module.exports = {
  evaluateNetworkRisk,
  STRICT_VPN_CHECK,
  VPN_GPS_IP_DISTANCE_KM
};
