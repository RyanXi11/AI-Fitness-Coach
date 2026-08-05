// routes/workouts.js
const express = require('express');
const auth = require('../middleware/auth');
const Workout = require('../models/Workout');
const mongoose = require('mongoose');
const { getProgressionSuggestion } = require('../utils/progression');

const router = express.Router();
router.use(auth); // every route below requires a valid JWT

// CREATE — log a new workout
router.post('/', async (req, res) => {
  try {
    const { exercise, sets, date, notes, minTargetReps, maxTargetReps } = req.body;
    if (!exercise || !sets || !sets.length) {
      return res.status(400).json({ error: 'exercise and at least one set are required' });
    }

    const workout = await Workout.create({
      userId: req.user.id,
      exercise,
      sets, // each set can now include isWarmup and rir — no server change needed, Mongoose accepts them since they're valid schema fields
      minTargetReps,
      maxTargetReps,
      date: date || Date.now(),
      notes
    });

    res.status(201).json(workout);
  } catch (err) {
    res.status(500).json({ error: 'Failed to log workout' });
  }
});

// READ — list this user's workouts (optionally filtered by exercise)
router.get('/', async (req, res) => {
  const filter = { userId: req.user.id };
  if (req.query.exercise) filter.exercise = req.query.exercise;

  const workouts = await Workout.find(filter).sort({ date: -1 });
  res.json(workouts);
});

// READ — a single workout by ID
router.get('/:id', async (req, res) => {
  const workout = await Workout.findOne({ _id: req.params.id, userId: req.user.id });
  // scoping the query to userId too (not just _id) is what stops one user
  // from reading another user's workout just by guessing/trying an ID
  if (!workout) return res.status(404).json({ error: 'Workout not found' });
  res.json(workout);
});

// UPDATE — edit an existing workout
router.put('/:id', async (req, res) => {
  const workout = await Workout.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!workout) return res.status(404).json({ error: 'Workout not found' });
  res.json(workout);
});

// DELETE — remove a workout
router.delete('/:id', async (req, res) => {
  const workout = await Workout.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!workout) return res.status(404).json({ error: 'Workout not found' });
  res.json({ message: 'Workout deleted' });
});

// Progression suggestion for a specific exercise
router.get('/progression/:exercise', async (req, res) => {
  const suggestion = await getProgressionSuggestion(req.user.id, req.params.exercise);
  res.json(suggestion);
});

// Simple stats aggregation — computed fresh on every request, no cached counters
router.get('/stats/summary', async (req, res) => {
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // back to Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const stats = await Workout.aggregate([
    { $match: { 
      userId: new mongoose.Types.ObjectId(req.user.id), // explicit cast — aggregation doesn't auto-cast like .find() does
      date: { $gte: startOfWeek }
    }},
    { $group: { _id: '$exercise', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  res.json({
    workoutsThisWeek: stats.reduce((sum, s) => sum + s.count, 0),
    favoriteExercises: stats
  });
});

module.exports = router;