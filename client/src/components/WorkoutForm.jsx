// src/components/WorkoutForm.jsx
import { useState } from 'react';
import api from '../api/axios';

export default function WorkoutForm({ onLogged }) {
  const [exercise, setExercise] = useState('');
  const [sets, setSets] = useState([{ reps: '', weight: '' }]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function updateSet(index, field, value) {
    // Never mutate state directly — build a new array so React knows
    // this specific render actually changed and re-renders correctly
    const updated = sets.map((set, i) =>
      i === index ? { ...set, [field]: value } : set
    );
    setSets(updated);
  }

  function addSet() {
    setSets([...sets, { reps: '', weight: '' }]);
  }

  function removeSet(index) {
    setSets(sets.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    try {
      // Convert reps/weight from strings (what inputs always give you)
      // to numbers, since the backend schema expects Number types
      const formattedSets = sets.map((s) => ({
        reps: Number(s.reps),
        weight: Number(s.weight)
      }));

      await api.post('/workouts', { exercise, sets: formattedSets, notes });

      setSuccess(true);
      setExercise('');
      setSets([{ reps: '', weight: '' }]);
      setNotes('');
      onLogged?.(); // lets the parent (Dashboard) know to refresh its data
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log workout');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="workout-form">
      <h2>Log a workout</h2>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">Workout logged.</p>}

      <input
        type="text"
        placeholder="Exercise (e.g. squat)"
        value={exercise}
        onChange={(e) => setExercise(e.target.value)}
        required
      />

      {sets.map((set, i) => (
        <div key={i} className="set-row">
          <input
            type="number"
            placeholder="Reps"
            value={set.reps}
            onChange={(e) => updateSet(i, 'reps', e.target.value)}
            required
          />
          <input
            type="number"
            placeholder="Weight (lb)"
            value={set.weight}
            onChange={(e) => updateSet(i, 'weight', e.target.value)}
            required
          />
          {sets.length > 1 && (
            <button type="button" onClick={() => removeSet(i)}>×</button>
          )}
        </div>
      ))}

      <button type="button" onClick={addSet} className="add-set">+ Add set</button>

      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button type="submit">Log workout</button>
    </form>
  );
}