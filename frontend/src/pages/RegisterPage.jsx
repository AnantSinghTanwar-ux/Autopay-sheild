import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    city: 'Mumbai',
    workingZones: [],
    workingHours: { start: 9, end: 22 }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [zoneHint, setZoneHint] = useState('');

  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata'];
  const zones = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];

  const handleZoneToggle = (zone) => {
    setFormData({
      ...formData,
      workingZones: formData.workingZones.includes(zone)
        ? formData.workingZones.filter(z => z !== zone)
        : [...formData.workingZones, zone]
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.register({
        ...formData,
        gpsLocation,
        autoSelectNearestZone: true
      });
      login(response.data.token, response.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const detectAndSuggestZone = () => {
    if (!navigator.geolocation) {
      setZoneHint('Geolocation not supported by this browser.');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const nextGps = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setGpsLocation(nextGps);

          const response = await authAPI.getZoneSuggestion({
            city: formData.city,
            gpsLocation: nextGps
          });

          const suggestion = response.data?.suggestion;
          const suggestedCity = suggestion?.nearestCity?.city;
          const suggestedZone = suggestion?.nearestZone?.zone;

          if (suggestedCity && suggestedCity !== formData.city) {
            setFormData((prev) => ({ ...prev, city: suggestedCity }));
          }

          if (suggestedZone) {
            setFormData((prev) => ({ ...prev, workingZones: [suggestedZone] }));
          }

          setZoneHint(
            suggestion?.message ||
            (suggestedZone ? `Closest zone detected: ${suggestedZone}` : 'Could not detect nearest zone.')
          );
        } catch (err) {
          setZoneHint(err.response?.data?.message || 'Could not fetch zone suggestion.');
        } finally {
          setLocationLoading(false);
        }
      },
      () => {
        setLocationLoading(false);
        setZoneHint('Location permission denied. You can still pick zones manually.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Join AutoPay Shield</h1>
          <p className="text-gray-600 mt-2">Protect Your Income Today</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="Your name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              className="input-field w-full"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field w-full pr-10"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-600 hover:text-gray-800"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
            <select
              className="input-field w-full"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            >
              {cities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={detectAndSuggestZone}
              disabled={locationLoading}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-60"
            >
              {locationLoading ? 'Detecting nearest zone...' : 'Use my current location to auto-select nearest zone'}
            </button>
            {zoneHint && <p className="text-xs text-gray-600 mt-2">{zoneHint}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Working Zones</label>
            <div className="space-y-2">
              {zones.map(zone => (
                <label key={zone} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formData.workingZones.includes(zone)}
                    onChange={() => handleZoneToggle(zone)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">{zone}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || formData.workingZones.length === 0}
            className="btn-primary w-full mt-6"
          >
            {loading ? 'Registering...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-center text-gray-600 text-sm">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Login Here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
