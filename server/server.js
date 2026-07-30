// server.js — entry point: loads config, connects to the DB, and wires up all routes

require('dotenv').config(); // load .env into process.env before anything else needs MONGO_URI or JWT_SECRET

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const workoutRoutes = require('./routes/workouts');
const mealLogRoutes = require('./routes/mealLogs');
const formFeedbackRoutes = require('./routes/formFeedback');

const app = express();

connectDB(); // connect to MongoDB Atlas — do this before the server starts accepting requests

app.use(cors()); // allows the React frontend (a different origin) to call this API later, in Milestone 3
app.use(express.json({ limit: '10mb' })); // parses incoming JSON bodies into req.body — without this, req.body is undefined. base64-encoded meal photos exceed the default 100kb limit

// Mount each route file under its resource path
app.use('/api/auth', authRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/mealLogs', mealLogRoutes);
app.use('/api/formFeedback', formFeedbackRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});