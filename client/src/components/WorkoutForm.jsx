// src/components/WorkoutForm.jsx
import { useState } from 'react';
import api from '../api/axios';

export default function WorkoutForm({ onLogged }) {
  const [exercise, setExercise] = useState('');
  const [minTargetReps, setMinTargetReps] = useState('');
  const [maxTargetReps, setMaxTargetReps] = useState('');
  const [sets, setSets] = useState([{ reps: '', weight: '', isWarmup: false, rir: '' }]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function updateSet(index, field, value) {
    const updated = sets.map((set, i) =>
      i === index ? { ...set, [field]: value } : set
    );
    setSets(updated);
  }

  function addSet() {
    setSets([...sets, { reps: '', weight: '', isWarmup: false, rir: '' }]);
  }

  function removeSet(index) {
    setSets(sets.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    try {
      const formattedSets = sets.map((s) => ({
        reps: Number(s.reps),
        weight: Number(s.weight),
        isWarmup: s.isWarmup,
        // RIR is meaningful only for working sets — omit it entirely for
        // warmups rather than sending a stray 0, which would otherwise
        // look like "RIR 0" (maximum effort) on a set that was never
        // meant to be evaluated at all
        ...(s.isWarmup ? {} : { rir: s.rir === '' ? undefined : Number(s.rir) })
      }));

      await api.post('/workouts', {
        exercise,
        sets: formattedSets,
        notes,
        minTargetReps: minTargetReps === '' ? undefined : Number(minTargetReps),
        maxTargetReps: maxTargetReps === '' ? undefined : Number(maxTargetReps)
      });

      setSuccess(true);
      setExercise('');
      setMinTargetReps('');
      setMaxTargetReps('');
      setSets([{ reps: '', weight: '', isWarmup: false, rir: '' }]);
      setNotes('');
      onLogged?.();
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
        placeholder="Exercise (e.g. bench)"
        value={exercise}
        onChange={(e) => setExercise(e.target.value)}
        required
      />

      <div className="rep-range-row">
        <input
          type="number"
          placeholder="Min target reps (e.g. 8)"
          value={minTargetReps}
          onChange={(e) => setMinTargetReps(e.target.value)}
        />
        <input
          type="number"
          placeholder="Max target reps (e.g. 12)"
          value={maxTargetReps}
          onChange={(e) => setMaxTargetReps(e.target.value)}
        />
      </div>

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
          {!set.isWarmup && (
            <input
              type="number"
              placeholder="RIR"
              min="0"
              max="5"
              value={set.rir}
              onChange={(e) => updateSet(i, 'rir', e.target.value)}
            />
          )}
          <label className="warmup-checkbox">
            <input
              type="checkbox"
              checked={set.isWarmup}
              onChange={(e) => updateSet(i, 'isWarmup', e.target.checked)}
            />
            Warmup
          </label>
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
