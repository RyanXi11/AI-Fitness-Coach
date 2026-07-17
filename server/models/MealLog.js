// models/MealLog.js — one logged meal photo + calorie estimate
const mongoose = require('mongoose');

const mealLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  photoUrl: { type: String, required: true },
  estimatedCalories: { type: Number },
  date: { type: Date, required: true, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MealLog', mealLogSchema);