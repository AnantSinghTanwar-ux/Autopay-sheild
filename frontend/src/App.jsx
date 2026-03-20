import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoadingSpinner, ProtectedRoute } from './components/Common';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerDashboard } from './pages/WorkerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import './index.css';

function AppRoutes() {
  const { loading, token, user } = useAuth();
  const isAdmin = user?.email === 'admin@example.com';

  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute isAuthenticated={!!token}>
            {isAdmin ? <Navigate to="/admin" replace /> : <WorkerDashboard />}
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute isAuthenticated={!!token}>
            {isAdmin ? <AdminDashboard /> : <Navigate to="/dashboard" replace />}
          </ProtectedRoute>
        } 
      />
      
      <Route path="/" element={<Navigate to={token ? (isAdmin ? '/admin' : '/dashboard') : '/login'} />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
