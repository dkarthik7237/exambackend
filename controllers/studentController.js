const Course = require('../models/Course');
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { gradeSubmission } = require('../services/gradingService');
const { generateShuffledSession } = require('../utils/shuffle');
const { createError } = require('../middleware/errorMiddleware');

// ─────────────────────────────────────────────
// COURSE CATALOG & ENROLLMENT
// ─────────────────────────────────────────────

/**
 * GET /api/student/courses
 * Returns ALL published courses (catalog) with enrollment flag.
 */
const getCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({ isActive: true })
      .populate({
        path: 'exams',
        match: { isPublished: true },
        select: 'title duration startTime endTime passingPercentage maxStrikes questions',
      })
      .select('title description enrolledStudents exams');

    const studentId = req.user._id.toString();

    const enriched = courses.map((c) => ({
      _id: c._id,
      title: c.title,
      description: c.description,
      isEnrolled: c.enrolledStudents.some((id) => id.toString() === studentId),
      examCount: c.exams.length,
      exams: c.exams,
    }));

    res.json({ courses: enriched });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/student/courses/:courseId/enroll
 * Self-enrollment — adds the student to the course and vice-versa.
 */
const enrollCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return next(createError('Course not found', 404));
    if (!course.isActive) return next(createError('This course is no longer active', 400));

    const studentId = req.user._id;

    if (course.enrolledStudents.includes(studentId)) {
      return next(createError('You are already enrolled in this course', 409));
    }

    // Update both sides of the relationship
    course.enrolledStudents.push(studentId);
    await course.save();

    await User.findByIdAndUpdate(studentId, { $addToSet: { enrolledCourses: course._id } });

    res.json({ message: `Successfully enrolled in "${course.title}"`, courseId: course._id });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/student/courses/:courseId/exams
 * Returns published exams for a specific course (student must be enrolled).
 */
const getCourseExams = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return next(createError('Course not found', 404));

    const isEnrolled = course.enrolledStudents.some(
      (id) => id.toString() === req.user._id.toString()
    );
    if (!isEnrolled) return next(createError('You are not enrolled in this course', 403));

    const exams = await Exam.find({
      _id: { $in: course.exams },
      isPublished: true,
    }).select('title description duration startTime endTime passingPercentage maxStrikes questions');

    // Attach submission status for each exam
    const now = new Date();
    const enriched = await Promise.all(
      exams.map(async (exam) => {
        const submission = await Submission.findOne({
          student: req.user._id,
          exam: exam._id,
        }).select('status score totalMarks isPassed finalizedAt startTime');

        let timeStatus = 'upcoming';
        if (now >= exam.startTime && now <= exam.endTime) timeStatus = 'active';
        if (now > exam.endTime) timeStatus = 'expired';

        return {
          ...exam.toObject(),
          questionCount: exam.questions.length,
          timeStatus,
          submission: submission || null,
        };
      })
    );

    res.json({ exams: enriched });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// EXAM SESSION
// ─────────────────────────────────────────────

/**
 * POST /api/student/exams/:examId/start
 * Creates a new Submission and returns the shuffled session.
 * Guards: enrolled, within time window, published, no existing submission.
 */
const startExam = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user._id;

    const exam = await Exam.findById(examId).populate('questions');
    if (!exam) return next(createError('Exam not found', 404));
    if (!exam.isPublished) return next(createError('This exam is not published yet', 403));

    // Time window check
    const now = new Date();
    if (now < exam.startTime) return next(createError('This exam has not started yet', 403));
    if (now > exam.endTime) return next(createError('This exam has already ended', 403));

    // Enrollment check
    const course = await Course.findById(exam.course);
    if (!course) return next(createError('Course not found', 404));
    const isEnrolled = course.enrolledStudents.some((id) => id.toString() === studentId.toString());
    if (!isEnrolled) return next(createError('You are not enrolled in this course', 403));

    // No retake check
    const existing = await Submission.findOne({ student: studentId, exam: examId });
    if (existing) {
      // Return the existing session instead of creating a new one
      return resumeSession(req, res, next, existing, exam);
    }

    // Create submission
    const submission = await Submission.create({
      student: studentId,
      exam: examId,
      startTime: now,
      proctoringLogs: [
        {
          event: 'Exam Started',
          details: `Exam session initiated. Total duration: ${exam.duration} minutes.`
        }
      ]
    });

    return resumeSession(req, res, next, submission, exam);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/student/exams/:examId/session
 * Returns the existing session for crash recovery.
 */
const getSession = async (req, res, next) => {
  try {
    const { examId } = req.params;
    const studentId = req.user._id;

    const exam = await Exam.findById(examId).populate('questions');
    if (!exam) return next(createError('Exam not found', 404));

    const submission = await Submission.findOne({ student: studentId, exam: examId });
    if (!submission) return next(createError('No active session found. Please start the exam first.', 404));

    return resumeSession(req, res, next, submission, exam);
  } catch (err) {
    next(err);
  }
};

/**
 * Shared helper — builds the session payload for startExam and getSession.
 */
const resumeSession = async (req, res, next, submission, exam) => {
  const now = new Date();

  // If the exam is already finished, return minimal info without exposing questions
  if (['Submitted', 'Graded', 'Debarred'].includes(submission.status)) {
    return res.json({
      submission: {
        _id: submission._id,
        status: submission.status,
        strikeCount: submission.strikeCount,
        startTime: submission.startTime,
        answers: {},
      },
      exam: {
        _id: exam._id,
        title: exam.title,
        duration: exam.duration,
        maxStrikes: exam.maxStrikes,
        passingPercentage: exam.passingPercentage,
      },
      questions: [],
      optionMaps: {},
      remainingSeconds: 0,
      serverTime: now.toISOString(),
    });
  }

  const deadlineMs = submission.startTime.getTime() + exam.duration * 60 * 1000;
  const remainingSeconds = Math.max(0, Math.floor((deadlineMs - now.getTime()) / 1000));

  // Generate deterministic shuffled questions (no correctOptionIndex exposed)
  const { shuffledQuestions, optionMaps } = generateShuffledSession(
    exam.questions,
    submission._id.toString()
  );

  // Convert answers Map to plain object for JSON serialisation
  const answersObj = {};
  if (submission.answers instanceof Map) {
    for (const [k, v] of submission.answers.entries()) answersObj[k] = v;
  }

  res.json({
    submission: {
      _id: submission._id,
      status: submission.status,
      strikeCount: submission.strikeCount,
      startTime: submission.startTime,
      answers: answersObj,
    },
    exam: {
      _id: exam._id,
      title: exam.title,
      duration: exam.duration,
      maxStrikes: exam.maxStrikes,
      passingPercentage: exam.passingPercentage,
    },
    questions: shuffledQuestions,
    optionMaps,
    remainingSeconds,
    serverTime: now.toISOString(),
  });
};

// ─────────────────────────────────────────────
// ANSWER MANAGEMENT
// ─────────────────────────────────────────────

/**
 * PUT /api/student/submissions/:id/answer
 * Body: { questionId, originalOptionIndex }
 * Saves (or clears) a single answer. Idempotent.
 */
const saveAnswer = async (req, res, next) => {
  try {
    const { questionId, originalOptionIndex } = req.body;

    if (!questionId) return next(createError('questionId is required', 400));

    const submission = await Submission.findOne({
      _id: req.params.id,
      student: req.user._id,
    });

    if (!submission) return next(createError('Submission not found', 404));
    if (submission.status !== 'Pending') {
      return next(createError('This submission is no longer active', 403));
    }

    // Check time hasn't expired
    const exam = await Exam.findById(submission.exam).select('duration');
    const deadline = new Date(submission.startTime.getTime() + exam.duration * 60 * 1000);
    if (new Date() > deadline) {
      return next(createError('Time has expired for this exam', 403));
    }

    if (originalOptionIndex === null || originalOptionIndex === undefined) {
      submission.answers.delete(questionId);
    } else {
      submission.answers.set(questionId, Number(originalOptionIndex));
    }

    await submission.save();

    res.json({ message: 'Answer saved', answeredCount: submission.answers.size });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/student/submissions/:id/submit
 * Manual submission by the student.
 */
const submitExam = async (req, res, next) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      student: req.user._id,
    });

    if (!submission) return next(createError('Submission not found', 404));
    if (submission.status !== 'Pending') {
      return next(createError('Exam already submitted or closed', 400));
    }

    submission.status = 'Submitted';
    submission.proctoringLogs.push({
      event: 'Exam Submitted',
      details: 'Exam completed and manually submitted by student.'
    });
    await submission.save();

    await gradeSubmission(submission._id);

    res.json({ message: 'Exam submitted successfully', submissionId: submission._id });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/student/submissions/:id/strike
 * Logs an anti-cheat visibility strike.
 * If strikes exceed maxStrikes, debarment occurs immediately.
 */
const logStrike = async (req, res, next) => {
  try {
    // Use findOneAndUpdate with $inc to prevent race conditions losing strikes
    const submission = await Submission.findOneAndUpdate(
      {
        _id: req.params.id,
        student: req.user._id,
        status: 'Pending', // Only apply strike if pending
      },
      { $inc: { strikeCount: 1 } },
      { new: true }
    ).populate('exam', 'maxStrikes duration title');

    if (!submission) {
      // It might be missing OR it might not be 'Pending' anymore
      const existing = await Submission.findOne({ _id: req.params.id, student: req.user._id });
      if (!existing) return next(createError('Submission not found', 404));
      // Already closed — silently succeed
      return res.json({ status: existing.status, strikeCount: existing.strikeCount });
    }

    let debarred = false;

    if (submission.strikeCount >= submission.exam.maxStrikes) {
      submission.status = 'Debarred';
      submission.forceSubmitReason = 'Anti-cheat violation: max strikes exceeded';
      debarred = true;
    }

    submission.proctoringLogs.push({
      event: debarred ? 'Debarred' : 'Tab Switch (Strike)',
      details: debarred
        ? `Debarred after exceeding maximum strikes (${submission.strikeCount}/${submission.exam.maxStrikes}).`
        : `Strike ${submission.strikeCount} of ${submission.exam.maxStrikes} logged due to tab switch/blur.`
    });
    await submission.save();

    if (debarred) {
      await gradeSubmission(submission._id);
    }

    res.json({
      strikeCount: submission.strikeCount,
      maxStrikes: submission.exam.maxStrikes,
      status: submission.status,
      debarred,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────

/**
 * GET /api/student/submissions/:id/result
 * Returns the graded result — only if admin has finalized it.
 */
const getResult = async (req, res, next) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      student: req.user._id,
    }).populate({
      path: 'exam',
      select: 'title passingPercentage duration questions',
      populate: { path: 'questions', select: 'text options correctOptionIndex positiveMarks negativeMarks' },
    });

    if (!submission) return next(createError('Submission not found', 404));

    if (submission.status !== 'Graded') {
      return next(createError('Results are not yet available. Please check back later.', 403));
    }

    // Build per-question result breakdown
    const breakdown = submission.exam.questions.map((q) => {
      const qId = q._id.toString();
      const studentAnswer = submission.answers instanceof Map ? submission.answers.get(qId) : undefined;
      const override = submission.questionOverrides instanceof Map
        ? submission.questionOverrides.get(qId)
        : undefined;

      let isCorrect;
      if (override !== undefined) {
        isCorrect = override;
      } else {
        isCorrect = studentAnswer !== undefined && Number(studentAnswer) === q.correctOptionIndex;
      }

      return {
        questionId: qId,
        text: q.text,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        studentAnswer: studentAnswer !== undefined ? studentAnswer : null,
        isCorrect,
        hasOverride: override !== undefined,
        positiveMarks: q.positiveMarks,
        negativeMarks: q.negativeMarks,
      };
    });

    const percentage =
      submission.totalMarks > 0
        ? Math.round((submission.score / submission.totalMarks) * 100 * 10) / 10
        : 0;

    res.json({
      submission: {
        _id: submission._id,
        status: submission.status,
        score: submission.score,
        totalMarks: submission.totalMarks,
        isPassed: submission.isPassed,
        percentage,
        strikeCount: submission.strikeCount,
        finalizedAt: submission.finalizedAt,
      },
      exam: {
        title: submission.exam.title,
        passingPercentage: submission.exam.passingPercentage,
      },
      breakdown,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/student/my-submissions
 * Lists the student's own submission history.
 */
const getMySubmissions = async (req, res, next) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate('exam', 'title duration passingPercentage startTime endTime')
      .select('status score totalMarks isPassed strikeCount finalizedAt createdAt exam')
      .sort({ createdAt: -1 });

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCourses,
  enrollCourse,
  getCourseExams,
  startExam,
  getSession,
  saveAnswer,
  submitExam,
  logStrike,
  getResult,
  getMySubmissions,
};
