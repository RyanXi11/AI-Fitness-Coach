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
  // `expires: '30d'` tells Mongoose to create a TTL index on this field —
  // MongoDB automatically deletes documents older than 30 days in the
  // background, no application code needed. Consistent with the lean-
  // storage decision from Milestone 1: nothing currently reads FormFeedback
  // over a long time horizon, so unbounded accumulation (potentially
  // thousands of documents over months of real 5x/week use) isn't worth
  // the storage cost on a free tier. Note: MongoDB's TTL background
  // process runs roughly every 60 seconds, so deletion isn't instant
  // at the exact expiry moment — a small, expected lag.
  timestamp: { type: Date, default: Date.now, expires: '30d' }
});

module.exports = mongoose.model('FormFeedback', formFeedbackSchema);
