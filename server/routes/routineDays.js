// routes/routineDays.js
const express = require('express');
const auth = require('../middleware/auth');
const RoutineDay = require('../models/RoutineDay');

const router = express.Router();
router.use(auth);

// READ — all of this user's defined split days
router.get('/', async (req, res) => {
  const days = await RoutineDay.find({ userId: req.user.id });
  res.json(days);
});

// CREATE — a new day (e.g. "Push", with a list of exercises)
router.post('/', async (req, res) => {
  try {
    const { dayName, exercises } = req.body;
    if (!dayName || !exercises || !exercises.length) {
      return res.status(400).json({ error: 'dayName and at least one exercise are required' });
    }

    const day = await RoutineDay.create({ userId: req.user.id, dayName, exercises });
    res.status(201).json(day);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: `A day named "${req.body.dayName}" already exists` });
    }
    res.status(500).json({ error: 'Failed to create routine day' });
  }
});

// UPDATE — rename a day or change its exercise list
router.put('/:id', async (req, res) => {
  try {
    const { dayName, exercises } = req.body;
    // Same guard as POST. Mongoose strips undefined keys from an update, so
    // schema-level `required` never fires here — without this check a PUT
    // could blank out a day's exercise list, which POST explicitly forbids.
    if (!dayName || !exercises || !exercises.length) {
      return res.status(400).json({ error: 'dayName and at least one exercise are required' });
    }

    const day = await RoutineDay.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id }, // scoped to this user — same pattern as every other route
      { dayName, exercises },
      { new: true, runValidators: true }
    );
    if (!day) return res.status(404).json({ error: 'Routine day not found' });
    res.json(day);
  } catch (err) {
    // Renaming a day onto an existing name trips the same unique index POST does
    if (err.code === 11000) {
      return res.status(409).json({ error: `A day named "${req.body.dayName}" already exists` });
    }
    res.status(500).json({ error: 'Failed to update routine day' });
  }
});

// DELETE — remove a day
router.delete('/:id', async (req, res) => {
  const day = await RoutineDay.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!day) return res.status(404).json({ error: 'Routine day not found' });
  res.json({ message: 'Routine day deleted' });
});

module.exports = router;
