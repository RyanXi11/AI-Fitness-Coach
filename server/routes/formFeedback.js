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

module.exports = router;