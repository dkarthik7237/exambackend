const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Exam title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    // Duration in minutes
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1 minute'],
    },
    // Exam availability window
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    // Minimum score % required to pass
    passingPercentage: {
      type: Number,
      required: [true, 'Passing percentage is required'],
      min: 0,
      max: 100,
      default: 40,
    },
    // Number of anti-cheat strikes before automatic debarment
    maxStrikes: {
      type: Number,
      required: true,
      min: 1,
      default: 3,
    },
    // Questions are stored in a separate collection for modularity
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    // Admin must publish an exam before students can take it
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Validate that endTime is strictly after startTime.
// We only run this check when both fields are present (Mongoose handles
// the 'required' validation separately).
examSchema.pre('save', function (next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    const err = new Error('End time must be after start time');
    err.statusCode = 400; // ← ensures global handler returns 400, not 500
    return next(err);
  }
  next();
});

module.exports = mongoose.model('Exam', examSchema);
