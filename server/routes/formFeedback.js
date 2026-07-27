// routes/formFeedback.js
const express = require('express');
const auth = require('../middleware/auth');
const FormFeedback = require('../models/FormFeedback');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  const feedback = await FormFeedback.find({ userId: req.user.id });
  res.json(feedback);
});

router.post('/', async (req, res) => {
  try {
    const { workoutId, exercise, issues } = req.body;
    const feedback = await FormFeedback.create({
      userId: req.user.id,
      workoutId,
      exercise,
      issues
    });
    res.status(201).json(feedback);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save form feedback' });
  }
});

module.exports = router;