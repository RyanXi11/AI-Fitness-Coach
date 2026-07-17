// config/db.js — handles the actual connection to MongoDB Atlas

const mongoose = require('mongoose');

async function connectDB() {
  try {
    // mongoose.connect() returns a promise, so we await it —
    // this makes sure we know the connection succeeded (or failed)
    // before the rest of the app assumes the database is ready
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    // If the connection fails (bad password, wrong IP whitelist, etc.),
    // there's no point running a server that can't reach its database —
    // log the real error and exit immediately rather than limping along
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;