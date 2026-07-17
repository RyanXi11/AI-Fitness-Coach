// models/User.js — a user account (you or a friend)
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true } // never store the raw password, only the bcrypt hash
  // No embedded workouts/mealLogs/formFeedback arrays, and no precomputed
  // stats fields — per the locked decisions, those are referenced
  // collections and computed on read, not cached here.
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);