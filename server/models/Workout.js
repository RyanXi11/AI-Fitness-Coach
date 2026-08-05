// models/Workout.js — one logged workout session
const mongoose = require('mongoose');

// Embedded sub-schema — sets are always read together with their parent
// workout and never queried independently, so they live inside the
// Workout document rather than being their own collection.
const setSchema = new mongoose.Schema({
  reps: { type: Number, required: true },
  weight: { type: Number, required: true },
  unit: { type: String, enum: ['lb', 'kg'], default: 'lb' },
  isWarmup: { type: Boolean, default: false }, // warmup sets are logged but never evaluated for progression
  rir: { type: Number, min: 0, max: 5 } // Reps In Reserve — meaningful for working sets, not warmups
}, { _id: false });

const workoutSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  exercise: { type: String, required: true, trim: true },
  sets: [setSchema],
  // The target rep range for THIS session's working sets (e.g. 8-12).
  // Stored per log entry rather than as a separate per-exercise setting
  // — simpler schema, and naturally supports shifting rep ranges across
  // training phases without a settings system.
  minTargetReps: { type: Number },
  maxTargetReps: { type: Number },
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true }
}, { timestamps: true });

// Matches the exact query the progression algorithm needs:
// "this user's history on this exercise, sorted by date"
workoutSchema.index({ userId: 1, exercise: 1, date: -1 });

module.exports = mongoose.model('Workout', workoutSchema);
