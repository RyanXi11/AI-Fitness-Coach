// utils/progression.js — progression algorithm v2: rep-range-based
// double progression with RIR, replacing the fixed-baseline model from
// Milestone 2. See docs/decisions.md for the full design reasoning.

const Workout = require('../models/Workout');

// Only working sets count toward progression — warmups exist purely so
// the log reflects what actually happened that day.
function getWorkingSets(sets) {
  return sets.filter((s) => !s.isWarmup);
}

// Groups workout documents by calendar date (keeping only the first log
// per date, per the Milestone 2 same-day-duplicate decision), carrying
// through the target rep range alongside the sets themselves.
function groupByDate(workouts) {
  const grouped = new Map();
  for (const w of workouts) {
    const dateKey = w.date.toISOString().split('T')[0];
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, {
        sets: w.sets,
        minTargetReps: w.minTargetReps,
        maxTargetReps: w.maxTargetReps
      });
    }
  }
  return Array.from(grouped.entries()).map(([date, data]) => ({ date, ...data }));
}

// The weight for a session is taken from the first WORKING set, not
// simply sets[0] — a warmup set is typically lighter, so using sets[0]
// blindly would misidentify the actual working weight for that session.
function getWorkingWeight(sets) {
  const workingSets = getWorkingSets(sets);
  return workingSets.length > 0 ? workingSets[0].weight : sets[0]?.weight;
}

function isSuccess(set, maxTargetReps) {
  return set.reps >= maxTargetReps && set.rir != null && set.rir <= 2;
}

function isBelowRange(set, minTargetReps) {
  return set.reps < minTargetReps;
}

// Classifies one session's working sets against its own logged target
// range. A session only counts as a full "success" or "struggling" if
// EVERY working set that day falls into that category — one set
// missing the mark keeps it at "in_progress", matching the same
// whole-session philosophy the original algorithm used.
function classifySession(session) {
  const workingSets = getWorkingSets(session.sets);

  if (workingSets.length === 0) return 'no_working_sets';
  if (session.minTargetReps == null || session.maxTargetReps == null) return 'no_target_range';

  if (workingSets.every((s) => isSuccess(s, session.maxTargetReps))) return 'success';
  if (workingSets.every((s) => isBelowRange(s, session.minTargetReps))) return 'struggling';
  return 'in_progress';
}

async function getProgressionSuggestion(userId, exercise) {
  const workouts = await Workout.find({ userId, exercise }).sort({ date: 1, _id: 1 }); // _id as tiebreak — see Milestone 2

  if (workouts.length === 0) {
    return { suggestion: 'no_data', message: `No logged sessions for ${exercise} yet.` };
  }

  const sessions = groupByDate(workouts);
  const currentWeight = getWorkingWeight(sessions[sessions.length - 1].sets);

  // Only sessions at the same weight, WITH a valid target range logged,
  // count as evidence — older data logged before this feature existed
  // can't be evaluated under the new rules and is excluded rather than
  // guessed at.
  const evaluableSessions = sessions.filter(
    (s) => getWorkingWeight(s.sets) === currentWeight && s.minTargetReps != null && s.maxTargetReps != null
  );

  if (evaluableSessions.length === 0) {
    return {
      suggestion: 'no_data',
      currentWeight,
      message: `Log a target rep range (e.g. 8-12) with your working sets at ${currentWeight}lb to get a suggestion.`
    };
  }

  const classifications = evaluableSessions.map(classifySession);
  const mostRecent = classifications[classifications.length - 1];

  // Single-session trigger for a weight increase — the rep range itself
  // already provides tolerance a single fixed rep target lacked, so one
  // clean top-of-range session at low RIR is enough evidence, matching
  // how real double-progression programs are actually run.
  if (mostRecent === 'success') {
    const suggestedWeight = currentWeight + 5;
    return {
      suggestion: 'increase_weight',
      currentWeight,
      suggestedWeight,
      message: `Hit the top of your rep range at RIR 2 or less — try ${suggestedWeight}lb next time.`
    };
  }

  // Multi-session trigger for a deload — a more consequential suggestion
  // to get wrong, so still requires 2 consecutive struggling sessions
  // before recommending less weight, avoiding overreacting to one bad day.
  if (classifications.length >= 2) {
    const lastTwo = classifications.slice(-2);
    if (lastTwo.every((c) => c === 'struggling')) {
      const suggestedWeight = Math.round(currentWeight * 0.9);
      return {
        suggestion: 'decrease_weight',
        currentWeight,
        suggestedWeight,
        message: `Missed the bottom of your rep range 2 sessions in a row at ${currentWeight}lb — consider dropping to ${suggestedWeight}lb.`
      };
    }
  }

  return {
    suggestion: 'keep_current',
    currentWeight,
    message: `Still working toward the top of your rep range at ${currentWeight}lb.`
  };
}

module.exports = { getProgressionSuggestion };
