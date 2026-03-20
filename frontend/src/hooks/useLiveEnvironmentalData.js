import { useEffect, useMemo, useRef, useState } from 'react';
import { detectBrowserLocation, getLiveEnvironmentalData } from '../services/environmentService';

export const useLiveEnvironmentalData = ({ city, pollingMs = 45000 }) => {
  const [location, setLocation] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    detectBrowserLocation().then((loc) => {
      if (!mounted) return;
      setLocation(loc);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const refresh = async () => {
      try {
        setError('');
        const payload = await getLiveEnvironmentalData(city || location?.city || 'Mumbai', {
          coordinates: location?.granted
            ? { latitude: location.latitude, longitude: location.longitude }
            : undefined
        });
        setData(payload);
        setLastUpdated(new Date());
      } catch (err) {
        setError(err?.message || 'Unable to fetch live environment data');
      } finally {
        setLoading(false);
      }
    };

    refresh();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(refresh, pollingMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [city, location?.city, location?.granted, location?.latitude, location?.longitude, pollingMs]);

  const locationLabel = useMemo(() => {
    if (!location) return 'Locating...';
    if (!location.granted) return 'Default city mode';
    return location.city ? `GPS + ${location.city}` : 'GPS mode';
  }, [location]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    locationLabel,
    live: Boolean(data)
  };
};
