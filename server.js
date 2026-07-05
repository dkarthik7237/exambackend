require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const { startCronJobs } = require('./services/cronJob');
const { errorHandler } = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');
const cronRoutes = require('./routes/cronRoutes');

const app = express();

// Database connection middleware for Serverless compatibility
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Middleware ──────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(mongoSanitize());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Routes ─────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/cron', cronRoutes);

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// 404 fallback
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// ─── Global error handler ────────────────────────────────────────
app.use(errorHandler);

// ─── Boot ────────────────────────────────────────────────────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5051;
  connectDB().then(() => {
    startCronJobs();

    app.listen(PORT, () => {
      console.log(`🚀 Local server running on http://localhost:${PORT}`);
      console.log(`🌐 Client origin: ${process.env.CLIENT_URL}`);
    });
  });
}

module.exports = app;
