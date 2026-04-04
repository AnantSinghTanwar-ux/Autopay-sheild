import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { policyAPI, claimAPI, userAPI } from '../services/api';
import { StatusBadge, RiskIndicator, LoadingSpinner } from '../components/Common';
import { useLiveEnvironmentalData } from '../hooks/useLiveEnvironmentalData';
import { Shield, TrendingUp, AlertCircle, Clock, IndianRupee, LogOut, Menu, X, Wind, CloudRain, ThermometerSun, Activity } from 'lucide-react';

const CountUpValue = ({ value, duration = 500, prefix = '', suffix = '' }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Number(value || 0);
    let frameId;
    let start;

    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setDisplay(Math.round(target * progress));
      if (progress < 1) frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [value, duration]);

  return <span>{prefix}{display}{suffix}</span>;
};

const getAqiBadge = (aqi) => {
  if (aqi > 300) return { label: 'Severe', className: 'bg-red-500/20 text-red-200 border-red-400/40' };
  if (aqi > 150) return { label: 'Warning', className: 'bg-yellow-500/20 text-yellow-100 border-yellow-300/40' };
  return { label: 'Good', className: 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40' };
};

const getFeedTone = (claimStatus, fraudStatus) => {
  if (fraudStatus === 'rejected' || claimStatus === 'rejected') return 'border-red-400/40 bg-red-500/10 text-red-100';
  if (fraudStatus === 'under_review' || claimStatus === 'triggered') return 'border-yellow-300/40 bg-yellow-500/10 text-yellow-50';
  return 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100';
};

export const WorkerDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activePolicy, setActivePolicy] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [profileForm, setProfileForm] = useState({ city: 'Mumbai', workingZones: [] });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [gpsSyncing, setGpsSyncing] = useState(false);
  const [aiGuide, setAiGuide] = useState(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const [feedCursor, setFeedCursor] = useState(0);

  const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata'];
  const zones = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];

  const effectiveCity = userProfile?.city || profileForm.city || user?.city || 'Mumbai';
  const { data: envData, loading: envLoading, error: envError, lastUpdated, locationLabel } = useLiveEnvironmentalData({
    city: effectiveCity,
    pollingMs: 45000
  });

  const aqiBadge = getAqiBadge(envData?.aqi || 0);

  const disruptionProbability = useMemo(() => {
    if (!envData) return 0;
    const weatherRisk = Math.min(100, Math.round((envData.rainfall * 7) + Math.max(0, envData.temperature - 34) * 3));
    const airRisk = Math.min(100, Math.round((envData.aqi / 500) * 100));
    return Math.round((weatherRisk * 0.6) + (airRisk * 0.4));
  }, [envData]);

  const riskLevel = useMemo(() => {
    if (disruptionProbability >= 70) return 'SEVERE';
    if (disruptionProbability >= 40) return 'ELEVATED';
    return 'SAFE';
  }, [disruptionProbability]);

  const headerStats = useMemo(() => {
    const paidClaims = claims.filter((c) => c.claimStatus === 'paid');
    const underReviewClaims = claims.filter((c) => c.fraudStatus === 'under_review' || c.claimStatus === 'triggered');
    return {
      workers: 1,
      disruptions: claims.length,
      payouts: paidClaims.length,
      disbursed: paidClaims.reduce((sum, c) => sum + Number(c.payoutAmount || 0), 0),
      flagged: underReviewClaims.length
    };
  }, [claims]);

  const liveFeed = useMemo(() => {
    const sorted = [...claims].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sorted.length === 0) return [];
    return sorted.slice(feedCursor, feedCursor + 4).concat(sorted.slice(0, Math.max(0, (feedCursor + 4) - sorted.length)));
  }, [claims, feedCursor]);

  useEffect(() => {
    loadDashboardData();
    syncCurrentLocation();
  }, []);

  useEffect(() => {
    if (claims.length <= 1) return;
    const timer = setInterval(() => {
      setFeedCursor((prev) => (prev + 1) % claims.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [claims.length]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const claimsRes = await claimAPI.getHistory();
        setClaims(claimsRes?.data?.claims || []);
      } catch {
        // keep existing feed entries if polling fails
      }
    }, 12000);

    return () => clearInterval(timer);
  }, []);

  const syncCurrentLocation = () => {
    if (!navigator.geolocation) return;

    setGpsSyncing(true);
    setProfileMessage('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const gpsLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          const updateRes = await userAPI.updateProfile({
            gpsLocation,
            autoSelectNearestZone: true
          });

          const updatedUser = updateRes?.data?.user;
          if (updatedUser) {
            setUserProfile((prev) => ({ ...prev, ...updatedUser }));
            setProfileForm((prev) => ({
              ...prev,
              city: updatedUser.city || prev.city,
              workingZones: updatedUser.workingZones || []
            }));
          }

          const zoneSuggestion = updateRes?.data?.zoneSuggestion;
          const nearestZone = zoneSuggestion?.nearestZone?.zone;
          const distanceKm = zoneSuggestion?.nearestZone?.distanceKm;
          const nearestCity = zoneSuggestion?.nearestCity;
          const suggestionMsg = zoneSuggestion?.message;

          let msg = `📍 GPS synced: ${gpsLocation.latitude.toFixed(4)}, ${gpsLocation.longitude.toFixed(4)}`;
          if (nearestZone) {
            msg += ` → Nearest zone: ${nearestZone}`;
            if (distanceKm != null) msg += ` (${distanceKm} km away)`;
            msg += '. Auto-assigned to your profile.';
          }
          if (nearestCity && nearestCity.city) {
            msg += ` | Closest city: ${nearestCity.city} (${nearestCity.distanceKm} km)`;
          }
          if (suggestionMsg && !msg.includes(suggestionMsg)) {
            msg += ` — ${suggestionMsg}`;
          }
          setProfileMessage(msg);

          // Reload policy after location is captured to get updated verification status
          const policyRes = await policyAPI.getActivePolicy().catch(() => null);
          if (policyRes?.data?.policy) {
            setActivePolicy(policyRes.data.policy);
          }
        } catch (error) {
          // Non-blocking: location is optional for dashboard loading
          console.warn('Location sync failed:', error?.message || error);
          setProfileMessage('GPS sync failed. Please try again.');
        } finally {
          setGpsSyncing(false);
        }
      },
      () => {
        // User may deny permission; app should continue without blocking.
        setGpsSyncing(false);
        setProfileMessage('Location permission denied in browser.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [policyRes, profileRes, claimsRes] = await Promise.all([
        policyAPI.getActivePolicy().catch(() => null),
        userAPI.getProfile(),
        claimAPI.getHistory()
      ]);

      setActivePolicy(policyRes?.data?.policy);
      setUserProfile(profileRes?.data?.user);
      setClaims(claimsRes?.data?.claims || []);
      setProfileForm({
        city: profileRes?.data?.user?.city || 'Mumbai',
        workingZones: profileRes?.data?.user?.workingZones || []
      });

      const effectiveCity = profileRes?.data?.user?.city || 'Mumbai';
      setGuideLoading(true);
      const guideRes = await claimAPI.getPredictions(effectiveCity).catch(() => null);
      setAiGuide(guideRes?.data?.smartSuggestion || null);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setGuideLoading(false);
      setLoading(false);
    }
  };

  const applyRecommendedZone = async () => {
    const recommendedZone = aiGuide?.recommendedZone;
    if (!recommendedZone) return;

    try {
      setProfileSaving(true);
      setProfileMessage('Applying AI-recommended zone...');

      await userAPI.updateProfile({
        city: profileForm.city,
        workingZones: [recommendedZone],
        autoSelectNearestZone: false
      });

      await loadDashboardData();
      setProfileMessage(`Zone updated to ${recommendedZone} based on live risk guidance.`);
    } catch (error) {
      setProfileMessage(error.response?.data?.message || 'Unable to apply recommended zone.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleCreatePolicy = async () => {
    try {
      await policyAPI.createPolicy();
      loadDashboardData();
      alert('Weekly policy created successfully!');
    } catch (error) {
      alert('Error creating policy: ' + error.response?.data?.message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleZone = (zone) => {
    setProfileForm((prev) => ({
      ...prev,
      workingZones: prev.workingZones.includes(zone)
        ? prev.workingZones.filter((z) => z !== zone)
        : [...prev.workingZones, zone]
    }));
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMessage('');
    try {
      const response = await userAPI.updateProfile({
        city: profileForm.city,
        workingZones: profileForm.workingZones,
        autoSelectNearestZone: profileForm.workingZones.length === 0
      });

      const updated = response?.data?.user;
      if (updated) {
        setUserProfile((prev) => ({ ...prev, ...updated }));
      }

      const refreshedPolicy = await policyAPI.getActivePolicy().catch(() => null);
      if (refreshedPolicy?.data?.policy) {
        setActivePolicy(refreshedPolicy.data.policy);
      }

      const suggestion = response?.data?.zoneSuggestion;
      if (suggestion?.nearestZone?.zone && (!updated?.workingZones || updated.workingZones.length === 0)) {
        setProfileMessage(`Closest zone detected: ${suggestion.nearestZone.zone}`);
      } else {
        setProfileMessage('Profile updated successfully.');
      }
    } catch (error) {
      setProfileMessage(error.response?.data?.message || 'Unable to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm('Delete your account permanently? This will remove your policies and claims.');
    if (!confirmDelete) return;

    try {
      await userAPI.deleteMe();
      logout();
      navigate('/register');
    } catch (error) {
      setProfileMessage(error.response?.data?.message || 'Unable to delete account.');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen premium-gradient text-slate-100">
      {/* Header */}
      <header className="glass-card border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="text-cyan-300" size={32} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AutoPay Shield</h1>
              <p className="text-xs text-slate-300">Real-Time Income Protection System</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <div className="text-right min-w-[240px]">
              <p className="text-sm text-slate-300">Welcome back,</p>
              <p className="font-semibold">{user?.name}</p>
              <p className="text-xs text-slate-300">City: {effectiveCity}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>

          <button
            onClick={() => setShowMenu(!showMenu)}
            className="md:hidden text-slate-100"
          >
            {showMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {showMenu && (
          <div className="md:hidden border-t border-white/20 p-4 space-y-2">
            <p className="text-sm text-slate-200">Welcome, {user?.name}</p>
            <p className="text-xs text-slate-300">City: {effectiveCity}</p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="glass-card rounded-3xl p-4 mb-6 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <span className="live-dot" />
            <p className="text-sm font-semibold">Live Data</p>
            <span className="text-xs text-slate-300">{locationLabel}</span>
          </div>
          <p className="text-xs text-slate-300">
            Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'syncing...'}
          </p>
          <div className="text-xs rounded-full border px-3 py-1 border-white/30 text-slate-100">
            Risk State: <span className={riskLevel === 'SEVERE' ? 'text-red-300' : riskLevel === 'ELEVATED' ? 'text-yellow-200' : 'text-emerald-300'}>{riskLevel}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="glass-card rounded-2xl p-4 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <p className="text-xs text-slate-300">Workers</p>
            <p className="text-xl font-bold"><CountUpValue value={headerStats.workers} /></p>
          </div>
          <div className="glass-card rounded-2xl p-4 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <p className="text-xs text-slate-300">Disruptions</p>
            <p className="text-xl font-bold"><CountUpValue value={headerStats.disruptions} /></p>
          </div>
          <div className="glass-card rounded-2xl p-4 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <p className="text-xs text-slate-300">Payouts</p>
            <p className="text-xl font-bold"><CountUpValue value={headerStats.payouts} /></p>
          </div>
          <div className="glass-card rounded-2xl p-4 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <p className="text-xs text-slate-300">INR Disbursed</p>
            <p className="text-xl font-bold"><CountUpValue value={headerStats.disbursed} prefix="₹" /></p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="glass-card rounded-3xl p-5 transition-all duration-500 hover:scale-105 hover:shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-300">Temperature</p>
              <ThermometerSun size={18} className="text-orange-300" />
            </div>
            <p className="text-3xl font-bold transition-all duration-700">{envLoading ? '--' : envData?.temperature ?? '--'}<span className="text-lg">°C</span></p>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-orange-300 transition-all duration-700" style={{ width: `${Math.min(100, Math.round(((envData?.temperature || 0) / 50) * 100))}%` }} />
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 transition-all duration-500 hover:scale-105 hover:shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-300">Rainfall</p>
              <CloudRain size={18} className="text-cyan-300" />
            </div>
            <p className="text-3xl font-bold transition-all duration-700">{envLoading ? '--' : envData?.rainfall ?? '--'}<span className="text-lg"> mm</span></p>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-300 transition-all duration-700" style={{ width: `${Math.min(100, Math.round(((envData?.rainfall || 0) / 15) * 100))}%` }} />
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 transition-all duration-500 hover:scale-105 hover:shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-300">AQI</p>
              <Activity size={18} className="text-yellow-200" />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-3xl font-bold transition-all duration-700">{envLoading ? '--' : envData?.aqi ?? '--'}</p>
              <span className={`text-xs px-2 py-1 rounded-full border ${aqiBadge.className}`}>{aqiBadge.label}</span>
            </div>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-yellow-300 transition-all duration-700" style={{ width: `${Math.min(100, Math.round(((envData?.aqi || 0) / 500) * 100))}%` }} />
            </div>
          </div>

          <div className="glass-card rounded-3xl p-5 transition-all duration-500 hover:scale-105 hover:shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-300">Wind</p>
              <Wind size={18} className="text-violet-200" />
            </div>
            <p className="text-3xl font-bold transition-all duration-700">{envLoading ? '--' : envData?.windSpeed ?? '--'}<span className="text-lg"> m/s</span></p>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-violet-300 transition-all duration-700" style={{ width: `${Math.min(100, Math.round(((envData?.windSpeed || 0) / 12) * 100))}%` }} />
            </div>
          </div>
        </div>

        {envError && (
          <div className="glass-card rounded-2xl p-3 mb-6 border border-red-300/40 text-red-100 text-sm">
            Live weather API unavailable, using fallback simulation data.
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Active Policy Card */}
          <div className="glass-card rounded-3xl p-6 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-medium">Active Plan</h3>
              <Shield className="text-cyan-300" size={20} />
            </div>
            {activePolicy ? (
              <>
                <p className="text-3xl font-bold">₹{activePolicy.weeklyPremium}</p>
                <p className="text-xs text-slate-300 mt-1">Weekly Premium</p>
                <div className="mt-4 pt-4 border-t border-white/20">
                  <p className="text-sm font-medium">Coverage: ₹{activePolicy.coverageAmount}</p>
                  <StatusBadge status={activePolicy.status} />
                </div>
              </>
            ) : (
              <button
                onClick={handleCreatePolicy}
                className="btn-primary w-full mt-4 py-2 text-sm"
              >
                Create Weekly Plan
              </button>
            )}
          </div>

          {/* Risk Level Card */}
          <div className="glass-card rounded-3xl p-6 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-medium">Risk Level</h3>
              <AlertCircle className="text-yellow-300" size={20} />
            </div>
            {userProfile && (
              <>
                <p className="text-3xl font-bold">{userProfile.riskScore}</p>
                <p className="text-xs text-slate-300 mt-1">Overall Score</p>
                <div className="mt-4">
                  <RiskIndicator score={userProfile.riskScore} />
                </div>
                <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-300 transition-all duration-700" style={{ width: `${Math.min(100, Math.round((userProfile.riskScore / 100) * 100))}%` }} />
                </div>
              </>
            )}
          </div>

          {/* Earnings Protected Card */}
          <div className="glass-card rounded-3xl p-6 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-medium">Earnings Protected</h3>
              <TrendingUp className="text-emerald-300" size={20} />
            </div>
            {activePolicy && userProfile ? (
              <>
                <p className="text-3xl font-bold">₹{activePolicy.coverageAmount}</p>
                <p className="text-xs text-slate-300 mt-1">Weekly Coverage</p>
                <p className="text-sm text-emerald-300 font-medium mt-4">₹{userProfile.averageEarningsPerHour}/hr avg</p>
              </>
            ) : (
              <p className="text-slate-300 text-sm">No active coverage</p>
            )}
          </div>

          {/* Claims Info Card */}
          <div className="glass-card rounded-3xl p-6 hover:scale-105 hover:shadow-xl transition-transform duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-medium">Total Claims</h3>
              <Clock className="text-orange-300" size={20} />
            </div>
            <p className="text-3xl font-bold">{claims.length}</p>
            <p className="text-xs text-slate-300 mt-1">Lifetime</p>
            {claims.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-sm font-medium">
                  Paid: ₹{claims
                    .filter(c => c.claimStatus === 'paid')
                    .reduce((sum, c) => sum + (c.payoutAmount || 0), 0)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-white/20 mb-8">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-4 font-medium border-b-2 transition ${
                activeTab === 'overview'
                  ? 'border-cyan-300 text-cyan-200'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('claims')}
              className={`px-4 py-4 font-medium border-b-2 transition ${
                activeTab === 'claims'
                  ? 'border-cyan-300 text-cyan-200'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Claim History
            </button>
            <button
              onClick={() => setActiveTab('earnings')}
              className={`px-4 py-4 font-medium border-b-2 transition ${
                activeTab === 'earnings'
                  ? 'border-cyan-300 text-cyan-200'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Income DNA
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="card p-6 border-l-4 border-l-indigo-500">
                <h2 className="text-xl font-bold text-gray-900 mb-2">AI Route Helper</h2>
                {guideLoading ? (
                  <p className="text-sm text-gray-600">Analyzing weather and traffic risk by zone...</p>
                ) : aiGuide ? (
                  <>
                    <p className="text-sm font-medium text-gray-800">{aiGuide.title}</p>
                    <p className="text-sm text-gray-600 mt-1">{aiGuide.message}</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-gray-500">Recommended Zone</p>
                        <p className="font-semibold text-gray-900">{aiGuide.recommendedZone || 'Stay current'}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-gray-500">Avoid Zone</p>
                        <p className="font-semibold text-gray-900">{aiGuide.avoidZone || '--'}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-gray-500">Traffic Risk</p>
                        <p className="font-semibold text-gray-900">{aiGuide.metrics?.bestZoneTrafficRisk ?? '--'}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-gray-500">Weather Risk</p>
                        <p className="font-semibold text-gray-900">{aiGuide.metrics?.bestZoneWeatherRisk ?? '--'}</p>
                      </div>
                    </div>
                    {aiGuide.recommendedZone && (
                      <button
                        onClick={applyRecommendedZone}
                        className="btn-primary mt-4"
                        disabled={profileSaving}
                      >
                        {profileSaving ? 'Applying...' : `Switch to ${aiGuide.recommendedZone}`}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-600">No immediate zone change needed.</p>
                )}
              </div>

              <div className="glass-card rounded-3xl p-6 border-l-4 border-l-cyan-300">
                <h2 className="text-xl font-bold mb-2">Live Payout Feed</h2>
                <p className="text-xs text-slate-300 mb-4">Auto-refreshing every few seconds with latest status signals.</p>
                {liveFeed.length > 0 ? (
                  <div className="space-y-3">
                    {liveFeed.map((claim) => (
                      <div key={claim.id} className={`slide-in rounded-xl border p-3 flex items-center justify-between ${getFeedTone(claim.claimStatus, claim.fraudStatus)}`}>
                        <div>
                          <p className="font-medium capitalize">{claim.triggerType.replace('_', ' ')}</p>
                          <p className="text-xs opacity-80">{new Date(claim.createdAt).toLocaleTimeString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">₹{claim.payoutAmount || 0}</p>
                          <p className="text-xs capitalize">{claim.fraudStatus}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-300">No live payout events yet.</p>
                )}
              </div>

              <div className="card p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Profile Location & Zones</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-gray-600 text-sm mb-2">Registered City</p>
                    <select
                      className="input-field w-full"
                      value={profileForm.city}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
                    >
                      {cities.map((city) => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-2">Change this if you entered wrong location during registration.</p>
                  </div>

                  <div>
                    <p className="text-gray-600 text-sm mb-2">Working Zones</p>
                    <div className="grid grid-cols-2 gap-2">
                      {zones.map((zone) => (
                        <label key={zone} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={profileForm.workingZones.includes(zone)}
                            onChange={() => toggleZone(zone)}
                          />
                          {zone}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Leave all unchecked to auto-assign nearest zone from your GPS.</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={syncCurrentLocation} className="btn-secondary" type="button" disabled={gpsSyncing}>
                    {gpsSyncing ? 'Syncing GPS...' : 'Sync Current GPS'}
                  </button>
                  <button onClick={handleSaveProfile} className="btn-primary" type="button" disabled={profileSaving}>
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                  <button onClick={handleDeleteAccount} className="btn-danger" type="button">
                    Delete Account
                  </button>
                </div>
                {profileMessage && <p className="text-sm text-gray-700 mt-3">{profileMessage}</p>}
              </div>

              {activePolicy ? (
                <div className="card p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Policy Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-gray-600 text-sm mb-1">Coverage Period</p>
                      <p className="font-medium text-gray-900">
                        {new Date(activePolicy.startDate).toLocaleDateString()} - {new Date(activePolicy.endDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600 text-sm mb-1">Coverage Hours</p>
                      <p className="font-medium text-gray-900">{activePolicy.coverageHours?.start ?? '--'}:00 - {activePolicy.coverageHours?.end ?? '--'}:00</p>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="font-medium text-gray-900 mb-4">Risk Breakdown</h3>
                    <div className="mb-4 text-sm text-gray-600 space-y-1">
                      <p>Data Source: <span className="font-medium text-gray-900">{activePolicy.externalRiskContext?.source || 'unknown'}</span></p>
                      <p>Weather City: <span className="font-medium text-gray-900">{activePolicy.externalRiskContext?.weather?.cityName || userProfile?.city || user?.city || 'N/A'}</span></p>
                      <p>
                        VPN Check: <span className={`font-medium ${activePolicy.externalRiskContext?.vpnVerification?.status === 'failed' ? 'text-red-600' : 'text-green-700'}`}>
                          {activePolicy.externalRiskContext?.vpnVerification?.status || 'pending'}
                        </span>
                      </p>
                      <p>
                        Location Check: <span className={`font-medium ${activePolicy.externalRiskContext?.locationVerification?.status === 'failed' ? 'text-red-600' : 'text-green-700'}`}>
                          {activePolicy.externalRiskContext?.locationVerification?.status || 'pending'}
                        </span>
                        {activePolicy.externalRiskContext?.locationVerification?.distanceKm !== undefined && (
                          <span className="text-gray-500"> ({activePolicy.externalRiskContext.locationVerification.distanceKm} km from {activePolicy.externalRiskContext.locationVerification.targetType || 'city'} {activePolicy.externalRiskContext.locationVerification.targetName || (userProfile?.city || user?.city || 'center')})</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {Object.entries(activePolicy.riskBreakdown || {}).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center">
                          <span className="text-gray-600 capitalize">{key.replace('Risk', '')}:</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition ${
                                  value >= 70 ? 'bg-red-500' : value >= 50 ? 'bg-yellow-500' : 'bg-green-500'
                                }`}
                                style={{ width: `${value}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-8">{value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('claims')}
                    className="btn-primary w-full mt-6"
                  >
                    View Claim History
                  </button>
                </div>
              ) : (
                <div className="card p-12 text-center">
                  <AlertCircle className="mx-auto mb-4 text-yellow-600" size={48} />
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">No Active Coverage</h2>
                  <p className="text-gray-600 mb-6">Create a weekly insurance plan to protect your income</p>
                  <button onClick={handleCreatePolicy} className="btn-primary">
                    Create Weekly Plan Now
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'claims' && (
            <div className="space-y-4">
              {claims.length > 0 ? (
                claims.map(claim => (
                  <div key={claim.id} className="glass-card rounded-2xl p-6 slide-in">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-white capitalize">{claim.triggerType.replace('_', ' ')}</h3>
                        <p className="text-sm text-slate-300 mt-1">
                          {new Date(claim.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusBadge status={claim.claimStatus} />
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-slate-300 text-xs mb-1">Expected Income</p>
                        <p className="font-bold text-white">₹{claim.expectedIncome}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs mb-1">Actual Income</p>
                        <p className="font-bold text-white">₹{claim.actualIncome}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs mb-1">Payout</p>
                        <p className="font-bold text-emerald-300">₹{claim.payoutAmount}</p>
                      </div>
                    </div>

                    <div className="border-t border-white/20 pt-4">
                      <p className="text-xs font-medium text-slate-300 mb-2">Fraud Status</p>
                      <StatusBadge status={claim.fraudStatus} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="glass-card rounded-2xl p-12 text-center text-slate-200">
                  <p>No claims yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'earnings' && userProfile && (
            <div className="glass-card rounded-3xl p-6">
              <h2 className="text-xl font-bold text-white mb-6">Income DNA</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-cyan-400/15 rounded-2xl p-6 border border-cyan-300/30">
                  <p className="text-slate-200 text-sm mb-2">Average Earnings/Hour</p>
                  <p className="text-4xl font-bold text-white">₹{userProfile.averageEarningsPerHour}</p>
                </div>
                <div className="bg-violet-400/15 rounded-2xl p-6 border border-violet-300/30">
                  <p className="text-slate-200 text-sm mb-2">Peak Working Hours</p>
                  <div className="flex gap-2 flex-wrap">
                    {userProfile.peakHours && userProfile.peakHours.length > 0 ? (
                      userProfile.peakHours.map(hour => (
                        <span key={hour} className="badge-success">
                          {String(hour).padStart(2, '0')}:00
                        </span>
                      ))
                    ) : (
                      <p className="text-slate-300 text-sm">No data yet. Log your earnings to see patterns.</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-300 mt-6">
                Income DNA helps us understand your earning patterns to calculate fair insurance premiums and claim amounts.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
