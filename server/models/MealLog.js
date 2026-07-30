// models/MealLog.js — one meal photo analysis result.
// Lean by design (locked decision, Milestone 5): the photo itself is
// never persisted — it's sent to Gemini Vision for analysis and
// discarded immediately after. Only the resulting estimate is stored,
// consistent with the same lean-storage philosophy already applied to
// FormFeedback in Milestone 1.
const mongoose = require('mongoose');

const mealLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  foodDescription: { type: String, required: true }, // what Gemini identified, e.g. "grilled chicken salad"
  estimatedCalories: { type: Number, required: true },
  date: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MealLog', mealLogSchema);
