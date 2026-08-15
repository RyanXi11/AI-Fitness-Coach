// src/pages/RoutineSettings.jsx
import { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

export default function RoutineSettings() {
  const [days, setDays] = useState([]);
  const [dayName, setDayName] = useState('');
  const [exercises, setExercises] = useState(['']);
  const [editingId, setEditingId] = useState(null); // null = the form is creating; an id = editing that day in place
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const formRef = useRef(null);

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

  function resetForm() {
    setEditingId(null);
    setDayName('');
    setExercises(['']);
    setError('');
  }

  // Loads an existing day back into the same form rather than rendering a
  // separate inline editor — one form means one validation path and one
  // submit handler, and the fields are identical either way.
  function startEditing(day) {
    setEditingId(day._id);
    setDayName(day.dayName);
    setExercises(day.exercises.length ? [...day.exercises] : ['']);
    setError('');
    // The form sits above the list, so editing a day further down would
    // otherwise change a form the user can't see and give no feedback.
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

      const payload = { dayName: dayName.trim(), exercises: cleanedExercises };
      // Editing updates the existing document. Deleting and recreating would
      // be destructive and non-atomic — a failed recreate loses the day, and
      // the unique (userId, dayName) index rules out creating the replacement
      // first, forcing exactly that risky ordering.
      if (editingId) {
        await api.put(`/routineDays/${editingId}`, payload);
      } else {
        await api.post('/routineDays', payload);
      }
      resetForm();
      loadDays(); // refresh the list in place — this page has nothing else that would need a full reload
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} routine day`);
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/routineDays/${id}`);
      if (id === editingId) resetForm(); // don't leave the form editing a day that no longer exists
      loadDays();
    } catch (err) {
      console.error('Failed to delete routine day:', err);
    }
  }

  return (
    <div className="page">
      <form ref={formRef} onSubmit={handleSubmit} className="workout-form">
        <h2>{editingId ? 'Edit day' : 'Add a day'}</h2>
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
        <button type="submit">{editingId ? 'Save changes' : 'Save day'}</button>
        {editingId && (
          <button type="button" onClick={resetForm} className="add-set">Cancel</button>
        )}
      </form>

      <section>
        <h2>Your days</h2>
        {loading && <p>Loading...</p>}
        {!loading && days.length === 0 && <p>No routine days set up yet.</p>}
        {days.map((day) => (
          <div key={day._id} className={day._id === editingId ? 'routine-day-item editing' : 'routine-day-item'}>
            <div>
              <strong>{day.dayName}</strong>
              <p>{day.exercises.join(', ')}</p>
            </div>
            <div className="routine-day-actions">
              <button onClick={() => startEditing(day)} className="edit-day">Edit</button>
              <button onClick={() => handleDelete(day._id)} className="delete-day">Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
