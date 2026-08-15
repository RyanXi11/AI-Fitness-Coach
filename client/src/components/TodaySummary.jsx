// src/components/TodaySummary.jsx — what you've eaten today, which the app
// collected from day one but never showed back to the user.
import { useState, useEffect } from 'react';
import api from '../api/axios';

// The bars show each macro's share of today's energy rather than progress
// toward a target, because there's no calorie goal on the User model to
// measure against. Percent-of-calories is the honest visualization here.
const CALORIES_PER_GRAM = { protein: 4, carbs: 4, fat: 9 };

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' }
];

export default function TodaySummary({ refreshToken }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await api.get('/mealLogs/summary/today');
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setError("Couldn't load today's meals");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    // Logging two meals quickly fires overlapping requests; without this the
    // slower (older) response could land last and overwrite fresher totals.
    return () => { cancelled = true; };
  }, [refreshToken]);

  if (loading) return <section className="today-summary"><h2>Today</h2><p>Loading…</p></section>;
  if (error) return <section className="today-summary"><h2>Today</h2><p className="error">{error}</p></section>;

  const { totals, meals } = data;
  const macroCalories = MACROS.reduce(
    (sum, { key }) => sum + totals[key] * CALORIES_PER_GRAM[key],
    0
  );

  return (
    <section className="today-summary">
      <h2>Today</h2>

      <div className="today-hero">
        <span className="today-calories">{totals.calories.toLocaleString()}</span>
        <span className="today-calories-unit">calories</span>
      </div>

      {meals.length === 0 ? (
        <p className="today-empty">No meals logged yet today.</p>
      ) : (
        <>
          <div className="macro-bars">
            {MACROS.map(({ key, label }) => (
              <div key={key} className="macro-bar-row">
                <span className="macro-bar-label">{label}</span>
                <span className="macro-bar-value">{totals[key]}g</span>
                <span className="macro-bar-track">
                  <span
                    className={`macro-bar-fill ${key}`}
                    // Guard against 0/0 on a day where every macro is zero
                    style={{
                      width: macroCalories
                        ? `${(totals[key] * CALORIES_PER_GRAM[key] * 100) / macroCalories}%`
                        : '0%'
                    }}
                  />
                </span>
              </div>
            ))}
          </div>

          <ul className="today-meals">
            {meals.map((meal) => (
              <li key={meal._id} className="today-meal">
                <span className="today-meal-name">{meal.foodDescription}</span>
                <span className="today-meal-calories">{meal.estimatedCalories}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
