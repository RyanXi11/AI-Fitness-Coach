// models/Workout.js — one logged workout session
const mongoose = require('mongoose');

// Embedded sub-schema — sets are always read together with their parent
// workout and never queried independently, so they live inside the
// Workout document rather than being their own collection.
const setSchema = new mongoose.Schema({
  reps: { type: Number, required: true },
  weight: { type: Number, required: true },
  unit: { type: String, enum: ['lb', 'kg'], default: 'lb' }
}, { _id: false });

const workoutSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  exercise: { type: String, required: true, trim: true },
  sets: [setSchema],
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true }
}, { timestamps: true });

// Matches the exact query the progression algorithm needs in Milestone 2:
// "this user's history on this exercise, sorted by date"
workoutSchema.index({ userId: 1, exercise: 1, date: -1 });

module.exports = mongoose.model('Workout', workoutSchema);