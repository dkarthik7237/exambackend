const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    text: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },
    // Exactly 4 options
    options: {
      type: [String],
      validate: {
        validator: (v) => v.length === 4,
        message: 'Exactly 4 options are required',
      },
      required: true,
    },
    // Index into options[] (0-3) that is correct
    correctOptionIndex: {
      type: Number,
      required: [true, 'Correct option index is required'],
      min: 0,
      max: 3,
    },
    positiveMarks: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    negativeMarks: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    // Display order hint (admin-specified, shuffled for students)
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
