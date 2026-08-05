// models/RoutineDay.js — a user-defined workout split day (e.g. "Push",
// "Pull", "Legs") and the exercises assigned to it. Exercises are plain
// strings, matching how exercise names work everywhere else in this app
// (no separate Exercise collection exists — never has).
const mongoose = require('mongoose');

const routineDaySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  dayName: { type: String, required: true, trim: true }, // e.g. "Push"
  exercises: [{ type: String, trim: true }] // e.g. ["bench", "overhead press", "tricep pushdown"]
}, { timestamps: true });

// A user shouldn't be able to create two days with the same name
routineDaySchema.index({ userId: 1, dayName: 1 }, { unique: true });

module.exports = mongoose.model('RoutineDay', routineDaySchema);
