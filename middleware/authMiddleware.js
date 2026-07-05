const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verifies the JWT in the Authorization header and attaches the user to req.
 * Returns 401 if the token is missing or invalid.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorised, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user (without password) to request
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ message: 'User belonging to this token no longer exists' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorised, token invalid or expired' });
  }
};

/**
 * Restricts access to admin users only.
 * Must be used AFTER protect middleware.
 */
const isAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden: admin access required' });
  }
  next();
};

/**
 * Restricts access to student users only.
 * Must be used AFTER protect middleware.
 */
const isStudent = (req, res, next) => {
  if (req.user?.role !== 'student') {
    return res.status(403).json({ message: 'Forbidden: student access required' });
  }
  next();
};

module.exports = { protect, isAdmin, isStudent };
