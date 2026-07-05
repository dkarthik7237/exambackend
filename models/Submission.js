const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    // Server-recorded start time — source of truth for timer
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    // Map<questionId (string), originalOptionIndex (0-3)>
    // A null value means the student explicitly cleared their answer
    answers: {
      type: Map,
      of: Number,
      default: {},
    },
    // Number of tab-switch / visibility violations
    strikeCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // State machine:
    //   Pending   → student is actively taking the exam
    //   Submitted → manually submitted or force-submitted by cron
    //   Debarred  → strikes exceeded maxStrikes
    //   Graded    → admin has finalized and made result visible
    status: {
      type: String,
      enum: ['Pending', 'Submitted', 'Debarred', 'Graded'],
      default: 'Pending',
    },
    score: {
      type: Number,
      default: 0,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    isPassed: {
      type: Boolean,
      default: false,
    },
    // Manual overrides set by admin during grading:
    //   Map<questionId (string), boolean>
    //   true  → force mark as correct (regardless of student answer)
    //   false → force mark as incorrect (0 marks, no negative)
    //   (absent) → use auto-grading logic
    questionOverrides: {
      type: Map,
      of: Boolean,
      default: {},
    },
    // Set when admin clicks "Finalize" — makes result visible to student
    finalizedAt: {
      type: Date,
      default: null,
    },
    // Reason for forced submission (cron / debarment)
    forceSubmitReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// One submission per student per exam — prevents retakes
submissionSchema.index({ student: 1, exam: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
