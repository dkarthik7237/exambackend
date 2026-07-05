const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { createError } = require('../middleware/errorMiddleware');

/** Signs a JWT for the given user ID */
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

/**
 * POST /api/auth/register
 * Student-only registration.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return next(createError('Name, email and password are required', 400));
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return next(createError('An account with this email already exists', 409));

    const user = await User.create({ name, email, password, role: 'student' });

    const token = signToken(user._id);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Shared for admin and student.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(createError('Email and password are required', 400));
    }

    // Must explicitly select password since it has select: false
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return next(createError('Invalid email or password', 401));
    }

    const token = signToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 */
const getMe = async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      enrolledCourses: req.user.enrolledCourses,
    },
  });
};

module.exports = { register, login, getMe };
