// routes/workouts.js
const express = require('express');
const auth = require('../middleware/auth');
const Workout = require('../models/Workout');

const router = express.Router();
router.use(auth); // every route below requires a valid JWT

router.get('/', async (req, res) => {
  const workouts = await Workout.find({ userId: req.user.id });
  res.json(workouts);
});

module.exports = router;