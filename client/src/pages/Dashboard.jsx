// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import WorkoutForm from '../components/WorkoutForm';
import MealPhotoUpload from '../components/MealPhotoUpload';

export default function Dashboard() {
  const { logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [progression, setProgression] = useState(null);
  const [loading, setLoading] = useState(true);

  // useEffect with an empty dependency array [] runs once, right after
  // this component first renders — the standard pattern for "fetch data
  // when this page loads"
  useEffect(() => {
    async function loadDashboard() {
      try {
        const [statsRes, progressionRes] = await Promise.all([
          api.get('/workouts/stats/summary'),
          api.get('/workouts/progression/squat')
        ]);
        setStats(statsRes.data);
        setProgression(progressionRes.data);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) return <p>Loading dashboard...</p>;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <Link to="/session">Start form-check session</Link>
        <button onClick={logout}>Log out</button>
      </div>

      <section>
        <h2>This week</h2>
        <p>{stats?.workoutsThisWeek ?? 0} workouts logged</p>
        {stats?.favoriteExercises?.length > 0 && (
          <ul>
            {stats.favoriteExercises.map((ex) => (
              <li key={ex._id}>{ex._id}: {ex.count}x</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Progression — Squat</h2>
        <p>{progression?.message}</p>
      </section>

      <WorkoutForm onLogged={() => window.location.reload()} />
      <MealPhotoUpload />
    </div>
  );
}