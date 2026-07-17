// routes/mealLogs.js
const express = require('express');
const auth = require('../middleware/auth');
const MealLog = require('../models/MealLog');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  const mealLogs = await MealLog.find({ userId: req.user.id });
  res.json(mealLogs);
});

module.exports = router;