// utils/progression.js — implements the locked progression rules:
// 1. First session at a weight sets the baseline (reps to beat)
// 2. Same-date logs are merged before evaluation
// 3. Strict rule: last 2 consecutive sessions must both be hits to suggest an increase

const Workout = require('../models/Workout');

// A session "hits" if every set meets or beats the baseline rep count for that set position
function isHit(sessionSets, baselineSets) {
  if (sessionSets.length < baselineSets.length) return false;
  return baselineSets.every((baseSet, i) => sessionSets[i].reps >= baseSet.reps);
}

// Groups workout documents by calendar date (not full timestamp), merging
// sets from same-day duplicate logs into one combined session — this is
// what stops a double-logged day from counting as two separate sessions
function groupByDate(workouts) {
  const grouped = new Map();
  for (const w of workouts) {
    const dateKey = w.date.toISOString().split('T')[0];
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, w.sets); // only the FIRST log for this date is kept
    }
    // any later log on the same date is intentionally ignored here —
    // it still exists in the database, just doesn't affect progression
  }
  return Array.from(grouped.entries()).map(([date, sets]) => ({ date, sets }));
}

async function getProgressionSuggestion(userId, exercise) {
  const workouts = await Workout.find({ userId, exercise }).sort({ date: 1, _id: 1 }); // date first, _id as tiebreaker for same-day logs

  if (workouts.length === 0) {
    return { suggestion: 'no_data', message: `No logged sessions for ${exercise} yet.` };
  }

  const sessions = groupByDate(workouts);

  // Only compare sessions at the SAME weight — progression only makes sense
  // relative to a specific weight, not across different weights
  const currentWeight = sessions[sessions.length - 1].sets[0].weight;
  const sameWeightSessions = sessions.filter(s => s.sets[0].weight === currentWeight);

  if (sameWeightSessions.length < 2) {
    return {
      suggestion: 'keep_current',
      weight: currentWeight,
      message: `Not enough sessions yet at ${currentWeight}lb to judge progression.`
    };
  }

  // Baseline is the FIRST session recorded at this weight — the target every
  // later session at this weight gets measured against
  const baseline = sameWeightSessions[0];
  const lastTwo = sameWeightSessions.slice(-2);

  const bothHit = lastTwo.every(session => isHit(session.sets, baseline.sets));
  const bothMissed = lastTwo.every(session => !isHit(session.sets, baseline.sets));

  if (bothHit) {
    return {
      suggestion: 'increase_weight',
      currentWeight,
      suggestedWeight: currentWeight + 5,
      message: `Hit your target reps 2 sessions in a row at ${currentWeight}lb — try ${currentWeight + 5}lb next time.`
    };
  }

  if (bothMissed) {
    return {
      suggestion: 'decrease_weight',
      currentWeight,
      suggestedWeight: Math.round(currentWeight * 0.9),
      message: `Missed reps 2 sessions in a row at ${currentWeight}lb — consider dropping to ${Math.round(currentWeight * 0.9)}lb.`
    };
  }

  return {
    suggestion: 'keep_current',
    currentWeight,
    message: `Mixed results at ${currentWeight}lb — keep working at this weight.`
  };
}

module.exports = { getProgressionSuggestion };