// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

// Fallback used only when the user hasn't defined any routine days yet —
// same "last 14 days, whatever was actually logged" heuristic from
// before the routine builder existed.
async function loadFallbackProgression() {
  const workoutsRes = await api.get('/workouts');
  const RECENT_WINDOW_DAYS = 14;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_WINDOW_DAYS);

  const recentExercises = [...new Set(
    workoutsRes.data
      .filter((w) => new Date(w.date) >= cutoff)
      .map((w) => w.exercise)
  )];

  return Promise.all(
    recentExercises.map(async (exercise) => {
      const res = await api.get(`/workouts/progression/${exercise}`);
      return { exercise, ...res.data };
    })
  );
}

function sortByActionNeeded(results) {
  const priority = { increase_weight: 0, decrease_weight: 0, keep_current: 1, no_data: 2 };
  return [...results].sort((a, b) => (priority[a.suggestion] ?? 2) - (priority[b.suggestion] ?? 2));
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [routineDays, setRoutineDays] = useState([]);
  const [selectedDayId, setSelectedDayId] = useState(null);
  const [progressionList, setProgressionList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progressionLoading, setProgressionLoading] = useState(false);

  // Initial load: stats + the user's defined routine days
  useEffect(() => {
    async function loadDashboard() {
      try {
        const [statsRes, daysRes] = await Promise.all([
          api.get('/workouts/stats/summary'),
          api.get('/routineDays')
        ]);
        setStats(statsRes.data);
        setRoutineDays(daysRes.data);

        if (daysRes.data.length > 0) {
          setSelectedDayId(daysRes.data[0]._id); // default to the first defined day
        } else {
          const fallback = await loadFallbackProgression();
          setProgressionList(sortByActionNeeded(fallback));
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  // Whenever the selected day changes, fetch progression for exactly
  // that day's DECLARED exercises — not what's been logged recently,
  // which is what makes this remember your plan through a training gap.
  useEffect(() => {
    if (!selectedDayId) return;

    async function loadDayProgression() {
      setProgressionLoading(true);
      try {
        const day = routineDays.find((d) => d._id === selectedDayId);
        if (!day) return;

        const results = await Promise.all(
          day.exercises.map(async (exercise) => {
            const res = await api.get(`/workouts/progression/${exercise}`);
            return { exercise, ...res.data };
          })
        );

        setProgressionList(sortByActionNeeded(results));
      } catch (err) {
        console.error('Failed to load day progression:', err);
      } finally {
        setProgressionLoading(false);
      }
    }
    loadDayProgression();
  }, [selectedDayId, routineDays]);

  if (loading) return <p>Loading dashboard...</p>;

  return (
    <div className="page">
      <section>
        <h2>This week</h2>
        <p className="stat-value">{stats?.workoutsThisWeek ?? 0} workouts logged</p>
        {stats?.favoriteExercises?.length > 0 && (
          <ul>
            {stats.favoriteExercises.map((ex) => (
              <li key={ex._id}>{ex._id}: {ex.count}x</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Progression</h2>

        {routineDays.length > 0 && (
          <div className="day-tabs">
            {routineDays.map((day) => (
              <button
                key={day._id}
                className={selectedDayId === day._id ? 'day-tab active' : 'day-tab'}
                onClick={() => setSelectedDayId(day._id)}
              >
                {day.dayName}
              </button>
            ))}
          </div>
        )}

        {routineDays.length === 0 && (
          <p>
            No routine set up yet — <Link to="/routine">define your split</Link> to see progression grouped by day.
          </p>
        )}

        {progressionLoading && <p>Loading progression...</p>}

        {!progressionLoading && progressionList.length === 0 && routineDays.length > 0 && (
          <p>No progression data yet for this day.</p>
        )}

        {!progressionLoading && progressionList.map((p) => (
          <div key={p.exercise} className={`progression-item ${p.suggestion}`}>
            <strong>{p.exercise}</strong>
            <p>{p.message}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
