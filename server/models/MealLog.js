// models/MealLog.js — one meal photo analysis result.
// Lean by design (locked decision, Milestone 5): the photo itself is
// never persisted — it's sent to Gemini Vision for analysis and
// discarded immediately after. Only the resulting estimate is stored.
const mongoose = require('mongoose');

const mealLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  foodDescription: { type: String, required: true }, // what Gemini identified, e.g. "grilled chicken salad"
  estimatedCalories: { type: Number, required: true },
  protein: { type: Number, required: true }, // grams
  carbs: { type: Number, required: true }, // grams
  fat: { type: Number, required: true }, // grams
  userNote: { type: String, trim: true }, // optional user-provided context (e.g. "extra dressing, double portion") — sent to Gemini as additional context, also kept on the record
  date: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MealLog', mealLogSchema);
