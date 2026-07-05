const mongoose = require('mongoose');

let cachedConnection = null;

/**
 * Establishes a connection to MongoDB, caching the connection.
 */
const connectDB = async () => {
  if (cachedConnection && mongoose.connection.readyState >= 1) {
    return cachedConnection;
  }

  try {
    // Set bufferTimeoutMS or connection options if needed
    cachedConnection = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB connected: ${cachedConnection.connection.host}`);
    return cachedConnection;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
