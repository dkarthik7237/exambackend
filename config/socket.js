const { Server } = require('socket.io');

let io;

/**
 * Initialises Socket.io on the given HTTP server.
 * @param {http.Server} httpServer
 */
const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Admin joins the global monitoring room
    socket.on('admin:join_monitor', () => {
      socket.join('admin-monitor');
      console.log(`👀 Admin joined monitor room: ${socket.id}`);
    });

    // Student joins a room keyed by their submission ID (for targeted events)
    socket.on('student:join_session', ({ submissionId }) => {
      if (submissionId) {
        socket.join(`session:${submissionId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

/**
 * Returns the singleton Socket.io instance.
 * Throws if initSocket has not been called yet.
 */
const getIO = () => {
  if (!io) throw new Error('Socket.io not initialised. Call initSocket first.');
  return io;
};

module.exports = { initSocket, getIO };
