// src/App.jsx
import './App.css';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import WorkoutLog from './pages/WorkoutLog';
import Nutrition from './pages/Nutrition';
import RoutineSettings from './pages/RoutineSettings';

// Split out because it pulls in MediaPipe (~139 KB) that most visits never
// need. The form checker is a deliberate detour, never the landing screen.
const WorkoutSession = lazy(() => import('./pages/WorkoutSession'));

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* One guard and one shell for every signed-in screen, rather than
              repeating ProtectedRoute per route. Each child still remounts on
              tab change, which is what keeps Home's data fresh after logging. */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/workout" element={<WorkoutLog />} />
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/routine" element={<RoutineSettings />} />
            <Route
              path="/session"
              element={
                <Suspense fallback={<div className="page"><span className="skeleton skeleton-block" /></div>}>
                  <WorkoutSession />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
