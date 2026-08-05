// src/pages/RoutineSettings.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

export default function RoutineSettings() {
  const [days, setDays] = useState([]);
  const [dayName, setDayName] = useState('');
  const [exercises, setExercises] = useState(['']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDays();
  }, []);

  async function loadDays() {
    try {
      const res = await api.get('/routineDays');
      setDays(res.data);
    } catch (err) {
      console.error('Failed to load routine days:', err);
    } finally {
      setLoading(false);
    }
  }

  function updateExercise(index, value) {
    setExercises(exercises.map((ex, i) => (i === index ? value : ex)));
  }

  function addExerciseField() {
    setExercises([...exercises, '']);
  }

  function removeExerciseField(index) {
    setExercises(exercises.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const cleanedExercises = exercises.map((ex) => ex.trim()).filter(Boolean);
      if (!dayName.trim() || cleanedExercises.length === 0) {
        setError('Day name and at least one exercise are required');
        return;
      }

      await api.post('/routineDays', { dayName: dayName.trim(), exercises: cleanedExercises });
      setDayName('');
      setExercises(['']);
      loadDays(); // refresh the list in place — this page has nothing else that would need a full reload
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create routine day');
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/routineDays/${id}`);
      loadDays();
    } catch (err) {
      console.error('Failed to delete routine day:', err);
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Your Routine</h1>
        <Link to="/dashboard">Back to dashboard</Link>
      </div>

      <form onSubmit={handleSubmit} className="workout-form">
        <h2>Add a day</h2>
        {error && <p className="error">{error}</p>}
        <input
          type="text"
          placeholder="Day name (e.g. Push)"
          value={dayName}
          onChange={(e) => setDayName(e.target.value)}
        />
        {exercises.map((ex, i) => (
          <div key={i} className="set-row">
            <input
              type="text"
              placeholder="Exercise"
              value={ex}
              onChange={(e) => updateExercise(i, e.target.value)}
            />
            {exercises.length > 1 && (
              <button type="button" onClick={() => removeExerciseField(i)}>×</button>
            )}
          </div>
        ))}
        <button type="button" onClick={addExerciseField} className="add-set">+ Add exercise</button>
        <button type="submit">Save day</button>
      </form>

      <section>
        <h2>Your days</h2>
        {loading && <p>Loading...</p>}
        {!loading && days.length === 0 && <p>No routine days set up yet.</p>}
        {days.map((day) => (
          <div key={day._id} className="routine-day-item">
            <div>
              <strong>{day.dayName}</strong>
              <p>{day.exercises.join(', ')}</p>
            </div>
            <button onClick={() => handleDelete(day._id)} className="delete-day">Delete</button>
          </div>
        ))}
      </section>
    </div>
  );
}
