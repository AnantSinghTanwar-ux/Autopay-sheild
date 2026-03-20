import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminAPI } from '../services/api';
import { LoadingSpinner, StatusBadge } from '../components/Common';
import { BarChart3, AlertTriangle, LogOut, Menu, X, PlayCircle, RefreshCw, ShieldCheck, Activity } from 'lucide-react';

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [fraudAlerts, setFraudAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [runningDemo, setRunningDemo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [demoResult, setDemoResult] = useState(null);
  const [demoError, setDemoError] = useState('');
  const [historyByClaimId, setHistoryByClaimId] = useState({});
  const [historyLoadingByClaimId, setHistoryLoadingByClaimId] = useState({});
  const [expandedHistoryClaimId, setExpandedHistoryClaimId] = useState(null);
  const [demoConfig, setDemoConfig] = useState({
    targetUserEmail: 'worker@example.com',
    triggerType: 'order_drop',
    triggerValue: 55
  });

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [statsRes, alertsRes] = await Promise.all([
        adminAPI.getClaimStats(),
        adminAPI.getFraudAlerts()
      ]);

      setStats(statsRes?.data?.stats);
      setFraudAlerts(alertsRes?.data?.fraudAlerts || []);
    } catch (error) {
      console.error('Error loading admin data:', error);
      alert('Error loading admin data');
    } finally {
      setLoading(false);
    }
  };

  const refreshAdminData = async () => {
    try {
      setRefreshing(true);
      const [statsRes, alertsRes] = await Promise.all([
        adminAPI.getClaimStats(),
        adminAPI.getFraudAlerts()
      ]);

      setStats(statsRes?.data?.stats);
      setFraudAlerts(alertsRes?.data?.fraudAlerts || []);
    } catch (error) {
      console.error('Error refreshing admin data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const runDemoScenario = async () => {
    try {
      setRunningDemo(true);
      setDemoError('');
      const response = await adminAPI.runDemoScenario(demoConfig);
      setDemoResult(response?.data?.result || null);
      await refreshAdminData();
    } catch (error) {
      setDemoError(error.response?.data?.message || 'Demo run failed');
    } finally {
      setRunningDemo(false);
    }
  };

  const reviewClaim = async (claimId, decision) => {
    try {
      await adminAPI.reviewClaimDecision(claimId, {
        decision,
        reason: `Manual admin ${decision}`
      });
      await refreshAdminData();
    } catch (error) {
      setDemoError(error.response?.data?.message || `Unable to ${decision} claim`);
    }
  };

  const toggleClaimHistory = async (claimId) => {
    if (expandedHistoryClaimId === claimId) {
      setExpandedHistoryClaimId(null);
      return;
    }

    setExpandedHistoryClaimId(claimId);
    if (historyByClaimId[claimId]) {
      return;
    }

    try {
      setHistoryLoadingByClaimId((prev) => ({ ...prev, [claimId]: true }));
      const response = await adminAPI.getClaimUserHistory(claimId);
      setHistoryByClaimId((prev) => ({ ...prev, [claimId]: response?.data }));
    } catch (error) {
      setDemoError(error.response?.data?.message || 'Unable to load user claim history');
    } finally {
      setHistoryLoadingByClaimId((prev) => ({ ...prev, [claimId]: false }));
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={32} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AutoPay Shield</h1>
              <p className="text-xs text-gray-600">Admin</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm text-gray-600">Admin:</p>
              <p className="font-medium text-gray-900">{user?.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>

          <button
            onClick={() => setShowMenu(!showMenu)}
            className="md:hidden text-gray-600"
          >
            {showMenu ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {showMenu && (
          <div className="md:hidden border-t border-gray-200 p-4 space-y-2">
            <p className="text-sm text-gray-600">Admin: {user?.name}</p>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Admin Control Center */}
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Admin Control Center</h2>
              <p className="text-sm text-gray-600">Run automated scenarios, inspect pipeline output, and control live demo flow.</p>
            </div>
            <button
              onClick={refreshAdminData}
              className="btn-secondary flex items-center gap-2"
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Target User Email</label>
              <input
                className="input-field w-full"
                value={demoConfig.targetUserEmail}
                onChange={(e) => setDemoConfig((prev) => ({ ...prev, targetUserEmail: e.target.value }))}
                placeholder="worker@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Trigger Type</label>
              <select
                className="input-field w-full"
                value={demoConfig.triggerType}
                onChange={(e) => setDemoConfig((prev) => ({ ...prev, triggerType: e.target.value }))}
              >
                <option value="order_drop">Order Drop</option>
                <option value="rain">Rain</option>
                <option value="heat">Heat</option>
                <option value="pollution">Pollution</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Trigger Value</label>
              <input
                type="number"
                className="input-field w-full"
                value={demoConfig.triggerValue}
                onChange={(e) => setDemoConfig((prev) => ({ ...prev, triggerValue: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={runDemoScenario}
                disabled={runningDemo}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <PlayCircle size={16} />
                {runningDemo ? 'Running...' : 'Run Demo Scenario'}
              </button>
            </div>
          </div>

          {demoError && <p className="text-sm text-red-600 mt-2">{demoError}</p>}

          {demoResult && (
            <div className="mt-4 rounded-lg border border-gray-200 p-4 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <p className="text-xs text-gray-600">Claim Created</p>
                  <p className="font-bold text-gray-900">{demoResult.claimed ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Fraud Score</p>
                  <p className="font-bold text-gray-900">{demoResult.fraudAssessment?.fraudScore ?? '--'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Decision</p>
                  <p className={`font-bold ${demoResult.fraudAssessment?.decision === 'approve' ? 'text-green-600' : 'text-red-600'}`}>
                    {demoResult.fraudAssessment?.decision || '--'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Payout</p>
                  <p className="font-bold text-green-600">₹{demoResult.payout || 0}</p>
                </div>
              </div>

              <p className="text-sm font-medium text-gray-700 mb-2">Execution Timeline</p>
              <div className="space-y-2">
                {(demoResult.processingLog || []).map((entry, idx) => (
                  <div key={`${entry.step}-${idx}`} className="text-xs text-gray-700 flex items-center gap-2">
                    {entry.step === 'truth_engine_completed' ? <ShieldCheck size={14} className="text-blue-600" /> : <Activity size={14} className="text-gray-500" />}
                    <span className="font-medium">{entry.step.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500">{new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Analytics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <div className="card p-6">
              <p className="text-gray-600 text-sm mb-2">Total Claims</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalClaims}</p>
            </div>
            <div className="card p-6">
              <p className="text-gray-600 text-sm mb-2">Approved</p>
              <p className="text-3xl font-bold text-green-600">{stats.approvedClaims}</p>
            </div>
            <div className="card p-6">
              <p className="text-gray-600 text-sm mb-2">Rejected</p>
              <p className="text-3xl font-bold text-red-600">{stats.rejectedClaims}</p>
            </div>
            <div className="card p-6">
              <p className="text-gray-600 text-sm mb-2">Under Review</p>
              <p className="text-3xl font-bold text-yellow-600">{stats.underReview}</p>
            </div>
            <div className="card p-6">
              <p className="text-gray-600 text-sm mb-2">Total Payouts</p>
              <p className="text-3xl font-bold text-blue-600">₹{stats.totalPayoutsAmount}</p>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="card p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Approval Rate:</span>
                  <span className="font-bold text-gray-900">{stats.approvalRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Rejection Rate:</span>
                  <span className="font-bold text-red-600">
                    {((stats.rejectedClaims / stats.totalClaims) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Payout:</span>
                  <span className="font-bold text-gray-900">
                    ₹{stats.totalClaims > 0 ? Math.round(stats.totalPayoutsAmount / stats.totalClaims) : 0}
                  </span>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">System Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">API Status:</span>
                  <span className="badge-success">✓ Operational</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Database:</span>
                  <span className="badge-success">✓ Connected</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Fraud Engine:</span>
                  <span className="badge-success">✓ Active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fraud Alerts */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="text-red-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Fraud Alerts</h2>
            <span className="ml-auto badge-danger">{fraudAlerts.length}</span>
          </div>

          {fraudAlerts.length > 0 ? (
            <div className="space-y-4">
              {fraudAlerts.map(alert => (
                <div key={alert.id} className="border border-red-200 bg-red-50 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900">{alert.user}</h3>
                      <p className="text-sm text-gray-600">{alert.email} • {alert.city}</p>
                    </div>
                    <StatusBadge status={alert.fraudStatus} />
                  </div>

                  <div className="bg-white rounded p-3 mb-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Trigger: <span className="capitalize text-red-600">{alert.triggerType}</span>
                    </p>
                    <p className="text-sm text-gray-700">
                      Fraud Score: <span className="font-semibold">{alert.fraudScore ?? '--'}</span>
                      {' '}| Claim Status: <span className="font-semibold capitalize">{alert.claimStatus || 'unknown'}</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      Created: {new Date(alert.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="mb-3">
                    <button
                      onClick={() => toggleClaimHistory(alert.id)}
                      className="px-3 py-1.5 rounded-md bg-slate-700 text-white text-xs font-medium hover:bg-slate-800"
                    >
                      {expandedHistoryClaimId === alert.id ? 'Hide User History' : 'View User History'}
                    </button>
                  </div>

                  {expandedHistoryClaimId === alert.id && (
                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      {historyLoadingByClaimId[alert.id] ? (
                        <p className="text-xs text-slate-600">Loading history...</p>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-slate-700 mb-2">Past Claim Profile</p>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-3">
                            <div className="bg-white rounded p-2">
                              <p className="text-slate-500">Total</p>
                              <p className="font-semibold text-slate-800">{historyByClaimId[alert.id]?.historyProfile?.totalClaims ?? 0}</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-slate-500">Last 30d</p>
                              <p className="font-semibold text-slate-800">{historyByClaimId[alert.id]?.historyProfile?.claimsLast30d ?? 0}</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-slate-500">Rejected 30d</p>
                              <p className="font-semibold text-red-700">{historyByClaimId[alert.id]?.historyProfile?.rejectedLast30d ?? 0}</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-slate-500">Under Review 30d</p>
                              <p className="font-semibold text-amber-700">{historyByClaimId[alert.id]?.historyProfile?.underReviewLast30d ?? 0}</p>
                            </div>
                            <div className="bg-white rounded p-2">
                              <p className="text-slate-500">Rejection % 30d</p>
                              <p className="font-semibold text-slate-800">{historyByClaimId[alert.id]?.historyProfile?.rejectionRate30d ?? 0}%</p>
                            </div>
                          </div>

                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {(historyByClaimId[alert.id]?.claims || []).slice(0, 10).map((pastClaim) => (
                              <div key={pastClaim.id} className="bg-white rounded px-2 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2">
                                <span className="text-slate-700 capitalize">{pastClaim.triggerType.replace('_', ' ')}</span>
                                <span className="text-slate-600">Score: {pastClaim.fraudScore ?? '--'}</span>
                                <span className="text-slate-600 capitalize">{pastClaim.fraudStatus}</span>
                                <span className="text-indigo-700 font-medium">x{pastClaim.occurrenceCount || 1}</span>
                                <span className="text-slate-500">{new Date(pastClaim.createdAt).toLocaleDateString()}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="text-xs space-y-1">
                    {Object.entries(alert.fraudChecks || {}).map(([check, result]) => (
                      <div key={check} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{check.replace(/([A-Z])/g, ' $1')}:</span>
                        <span className={result.status === 'passed' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {result.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  {(alert.claimStatus === 'triggered' || alert.fraudStatus === 'under_review') && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => reviewClaim(alert.id, 'approve')}
                        className="px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reviewClaim(alert.id, 'reject')}
                        className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-center py-8">No fraud alerts at the moment. System is operating normally.</p>
          )}
        </div>
      </main>
    </div>
  );
};
