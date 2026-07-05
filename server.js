require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const { startCronJobs } = require('./services/cronJob');
const { errorHandler } = require('./middleware/errorMiddleware');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const httpServer = http.createServer(app);

// ─── Socket.io ──────────────────────────────────────────────────
initSocket(httpServer);

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

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// 404 fallback
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// ─── Global error handler ────────────────────────────────────────
app.use(errorHandler);

// ─── Boot ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  startCronJobs();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌐 Client origin: ${process.env.CLIENT_URL}`);
  });
});
