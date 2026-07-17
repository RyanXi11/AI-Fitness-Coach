// models/FormFeedback.js — the result of one pose-estimation form check.
// Lean by design (locked decision): only the detected verdict is stored,
// never raw video/frames — analysis happens client-side, only the
// outcome is sent here.
const mongoose = require('mongoose');

const formFeedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  workoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workout' }, // which session this was checked during
  exercise: { type: String, required: true },
  issues: [{ type: String }], // e.g. "not deep enough"; empty array = good form
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FormFeedback', formFeedbackSchema);