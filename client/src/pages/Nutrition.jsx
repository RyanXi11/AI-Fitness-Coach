// src/pages/Nutrition.jsx — today's intake plus the two ways to add to it.
import { useState } from 'react';
import TodaySummary from '../components/TodaySummary';
import MealLogger from '../components/MealLogger';

export default function Nutrition() {
  // Bumped after a successful log so TodaySummary refetches. Deliberately a
  // counter rather than a page reload — the logger keeps its own result on
  // screen, which a reload would wipe before the user could read it.
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="page">
      <TodaySummary refreshToken={refreshToken} />
      <MealLogger onLogged={() => setRefreshToken((n) => n + 1)} />
    </div>
  );
}
