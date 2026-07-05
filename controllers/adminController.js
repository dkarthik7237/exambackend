const Course = require('../models/Course');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { gradeSubmission, calculateScore } = require('../services/gradingService');
const { createError } = require('../middleware/errorMiddleware');

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

/**
 * GET /api/admin/stats
 */
const getStats = async (req, res, next) => {
  try {
    const [courses, exams, students, submissions] = await Promise.all([
      Course.countDocuments(),
      Exam.countDocuments(),
      User.countDocuments({ role: 'student' }),
      Submission.countDocuments(),
    ]);
    const activeExams = await Submission.countDocuments({ status: 'Pending' });
    const gradedSubmissions = await Submission.countDocuments({ status: 'Graded' });

    res.json({ courses, exams, students, submissions, activeExams, gradedSubmissions });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// COURSES
// ─────────────────────────────────────────────

/** GET /api/admin/courses */
const getCourses = async (req, res, next) => {
  try {
    const courses = await Course.find()
      .populate('exams', 'title isPublished startTime endTime')
      .populate('enrolledStudents', 'name email')
      .sort({ createdAt: -1 });
    res.json({ courses });
  } catch (err) {
    next(err);
  }
};

/** POST /api/admin/courses */
const createCourse = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) return next(createError('Title and description are required', 400));

    const course = await Course.create({ title, description, createdBy: req.user._id });
    res.status(201).json({ course });
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/courses/:id */
const getCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate({
        path: 'exams',
        populate: { path: 'questions', select: 'text positiveMarks negativeMarks' },
      })
      .populate('enrolledStudents', 'name email');

    if (!course) return next(createError('Course not found', 404));
    res.json({ course });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/admin/courses/:id */
const updateCourse = async (req, res, next) => {
  try {
    const { title, description, isActive } = req.body;
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      { title, description, isActive },
      { new: true, runValidators: true }
    );
    if (!course) return next(createError('Course not found', 404));
    res.json({ course });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/admin/courses/:id */
const deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return next(createError('Course not found', 404));

    // Also remove all exams and questions linked to this course
    const examIds = course.exams;
    await Question.deleteMany({ exam: { $in: examIds } });
    await Exam.deleteMany({ _id: { $in: examIds } });
    await Course.findByIdAndDelete(req.params.id);

    res.json({ message: 'Course and all related data deleted' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// EXAMS
// ─────────────────────────────────────────────

/** POST /api/admin/exams */
const createExam = async (req, res, next) => {
  try {
    const {
      title, description, courseId, duration,
      startTime, endTime, passingPercentage, maxStrikes,
      isPublished,
    } = req.body;

    // ── Required field guard ──────────────────────────────────
    if (!title || !courseId || !duration || !startTime || !endTime) {
      return next(createError('title, courseId, duration, startTime and endTime are required', 400));
    }

    // ── Parse & coerce types ──────────────────────────────────
    const durationNum = Number(duration);
    const passingPct  = passingPercentage !== undefined && passingPercentage !== ''
      ? Number(passingPercentage) : 40;
    const maxStrikesNum = maxStrikes !== undefined && maxStrikes !== ''
      ? Number(maxStrikes) : 3;

    if (isNaN(durationNum) || durationNum < 1) {
      return next(createError('Duration must be a positive number of minutes', 400));
    }
    if (isNaN(passingPct) || passingPct < 0 || passingPct > 100) {
      return next(createError('Passing percentage must be between 0 and 100', 400));
    }
    if (isNaN(maxStrikesNum) || maxStrikesNum < 1) {
      return next(createError('Max strikes must be at least 1', 400));
    }

    // ── Date validation (before hitting the model) ────────────
    const start = new Date(startTime);
    const end   = new Date(endTime);

    if (isNaN(start.getTime())) return next(createError('Invalid start time', 400));
    if (isNaN(end.getTime()))   return next(createError('Invalid end time', 400));
    if (end <= start) {
      return next(createError('End time must be after start time', 400));
    }

    // ── Course lookup ─────────────────────────────────────────
    const course = await Course.findById(courseId);
    if (!course) return next(createError('Course not found', 404));

    // ── Create exam ───────────────────────────────────────────
    const exam = await Exam.create({
      title: title.trim(),
      description: description?.trim() ?? '',
      course: courseId,
      duration: durationNum,
      startTime: start,
      endTime: end,
      passingPercentage: passingPct,
      maxStrikes: maxStrikesNum,
      isPublished: Boolean(isPublished),
      createdBy: req.user._id,
    });

    course.exams.push(exam._id);
    await course.save();

    res.status(201).json({ exam });
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/exams/:id */
const getExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('questions')
      .populate('course', 'title');
    if (!exam) return next(createError('Exam not found', 404));
    res.json({ exam });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/admin/exams/:id */
const updateExam = async (req, res, next) => {
  try {
    const {
      title, description, duration, startTime, endTime,
      passingPercentage, maxStrikes, isPublished,
    } = req.body;

    const update = {};
    if (title !== undefined) update.title = title.trim();
    if (description !== undefined) update.description = description.trim();
    if (isPublished !== undefined) update.isPublished = Boolean(isPublished);

    if (duration !== undefined) {
      const d = Number(duration);
      if (isNaN(d) || d < 1) return next(createError('Duration must be a positive number', 400));
      update.duration = d;
    }
    if (passingPercentage !== undefined && passingPercentage !== '') {
      const p = Number(passingPercentage);
      if (isNaN(p) || p < 0 || p > 100) return next(createError('Passing percentage must be 0–100', 400));
      update.passingPercentage = p;
    }
    if (maxStrikes !== undefined && maxStrikes !== '') {
      const m = Number(maxStrikes);
      if (isNaN(m) || m < 1) return next(createError('Max strikes must be at least 1', 400));
      update.maxStrikes = m;
    }
    if (startTime !== undefined) {
      const s = new Date(startTime);
      if (isNaN(s.getTime())) return next(createError('Invalid start time', 400));
      update.startTime = s;
    }
    if (endTime !== undefined) {
      const e = new Date(endTime);
      if (isNaN(e.getTime())) return next(createError('Invalid end time', 400));
      update.endTime = e;
    }
    // Validate date order if both are being updated or one is present
    const exam = await Exam.findById(req.params.id);
    if (!exam) return next(createError('Exam not found', 404));

    const effectiveStart = update.startTime ?? exam.startTime;
    const effectiveEnd   = update.endTime   ?? exam.endTime;
    if (effectiveEnd <= effectiveStart) {
      return next(createError('End time must be after start time', 400));
    }

    const updated = await Exam.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate('questions');

    res.json({ exam: updated });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/admin/exams/:id */
const deleteExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return next(createError('Exam not found', 404));

    await Question.deleteMany({ exam: exam._id });
    await Course.updateOne({ _id: exam.course }, { $pull: { exams: exam._id } });
    await Exam.findByIdAndDelete(exam._id);

    res.json({ message: 'Exam and all questions deleted' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// QUESTIONS
// ─────────────────────────────────────────────

/** POST /api/admin/exams/:examId/questions */
const addQuestion = async (req, res, next) => {
  try {
    const { text, options, correctOptionIndex, positiveMarks, negativeMarks } = req.body;

    if (!text || !options || correctOptionIndex === undefined) {
      return next(createError('text, options, and correctOptionIndex are required', 400));
    }

    if (!Array.isArray(options) || options.length !== 4) {
      return next(createError('Exactly 4 options are required', 400));
    }

    const exam = await Exam.findById(req.params.examId);
    if (!exam) return next(createError('Exam not found', 404));

    const question = await Question.create({
      exam: exam._id,
      text,
      options,
      correctOptionIndex,
      positiveMarks: positiveMarks ?? 1,
      negativeMarks: negativeMarks ?? 0,
      order: exam.questions.length,
    });

    exam.questions.push(question._id);
    await exam.save();

    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
};

/** PUT /api/admin/questions/:id */
const updateQuestion = async (req, res, next) => {
  try {
    const { text, options, correctOptionIndex, positiveMarks, negativeMarks } = req.body;

    if (options && (options.length !== 4)) {
      return next(createError('Exactly 4 options are required', 400));
    }

    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { text, options, correctOptionIndex, positiveMarks, negativeMarks },
      { new: true, runValidators: true }
    );

    if (!question) return next(createError('Question not found', 404));
    res.json({ question });
  } catch (err) {
    next(err);
  }
};

/** DELETE /api/admin/questions/:id */
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return next(createError('Question not found', 404));

    await Exam.updateOne({ _id: question.exam }, { $pull: { questions: question._id } });
    await Question.findByIdAndDelete(question._id);

    res.json({ message: 'Question deleted' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// SUBMISSIONS
// ─────────────────────────────────────────────

/** GET /api/admin/submissions */
const getSubmissions = async (req, res, next) => {
  try {
    const { examId, status } = req.query;
    const filter = {};
    if (examId) filter.exam = examId;
    if (status) filter.status = status;

    const submissions = await Submission.find(filter)
      .populate('student', 'name email')
      .populate('exam', 'title duration passingPercentage')
      .sort({ createdAt: -1 });

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
};

/** GET /api/admin/submissions/:id */
const getSubmission = async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('student', 'name email')
      .populate({
        path: 'exam',
        populate: { path: 'questions' },
      });

    if (!submission) return next(createError('Submission not found', 404));
    res.json({ submission });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/submissions/:id/override
 * Admin saves manual overrides and triggers re-grading.
 * Body: { overrides: { [questionId]: boolean } }
 */
const saveOverrides = async (req, res, next) => {
  try {
    const { overrides } = req.body; // { questionId: true/false }

    if (!overrides || typeof overrides !== 'object') {
      return next(createError('overrides object is required', 400));
    }

    const submission = await Submission.findById(req.params.id).populate({
      path: 'exam',
      select: 'passingPercentage',
      populate: { path: 'questions' },
    });

    if (!submission) return next(createError('Submission not found', 404));
    if (!['Submitted', 'Debarred', 'Graded'].includes(submission.status)) {
      return next(createError('Cannot override a Pending submission', 400));
    }

    // Apply or remove overrides
    for (const [qId, value] of Object.entries(overrides)) {
      if (value === null || value === undefined) {
        submission.questionOverrides.delete(qId);
      } else {
        submission.questionOverrides.set(qId, Boolean(value));
      }
    }
    await submission.save();

    // Re-grade with new overrides
    const { score, totalMarks, isPassed } = await gradeSubmission(submission._id);

    const updated = await Submission.findById(submission._id);
    res.json({ message: 'Overrides saved and score recalculated', score, totalMarks, isPassed, submission: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/submissions/:id/finalize
 * Makes the result visible to the student.
 */
const finalizeSubmission = async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return next(createError('Submission not found', 404));

    if (!['Submitted', 'Debarred'].includes(submission.status)) {
      return next(createError('Can only finalize Submitted or Debarred submissions', 400));
    }

    // Re-grade one last time before finalizing
    await gradeSubmission(submission._id);

    submission.status = 'Graded';
    submission.finalizedAt = new Date();
    await submission.save();

    res.json({ message: 'Submission finalized — student can now view their result', submission });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// LIVE MONITOR
// ─────────────────────────────────────────────

/**
 * GET /api/admin/monitor
 * Returns all currently active (Pending) exam sessions for the admin monitor.
 */
const getActiveMonitor = async (req, res, next) => {
  try {
    const activeSessions = await Submission.find({ status: 'Pending' })
      .populate('student', 'name email')
      .populate('exam', 'title duration maxStrikes startTime')
      .sort({ startTime: -1 });

    const now = new Date();
    const sessions = activeSessions.map((sub) => {
      const elapsed = Math.floor((now - sub.startTime) / 1000); // seconds
      const totalSeconds = sub.exam.duration * 60;
      const remaining = Math.max(0, totalSeconds - elapsed);

      return {
        submissionId: sub._id,
        student: sub.student,
        exam: sub.exam,
        strikeCount: sub.strikeCount,
        maxStrikes: sub.exam.maxStrikes,
        remainingSeconds: remaining,
        answeredCount: sub.answers.size,
        status: sub.status,
        startTime: sub.startTime,
      };
    });

    res.json({ sessions });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// STUDENT MANAGEMENT
// ─────────────────────────────────────────────

/**
 * GET /api/admin/students
 * Returns all registered students with their submission counts.
 */
const getStudents = async (req, res, next) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('name email enrolledCourses createdAt')
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(
      students.map(async (s) => {
        const submissionCount = await Submission.countDocuments({ student: s._id });
        return {
          _id: s._id,
          name: s.name,
          email: s.email,
          enrolledCourseCount: s.enrolledCourses.length,
          submissionCount,
          createdAt: s.createdAt,
        };
      })
    );

    res.json({ students: enriched });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/admin/students/:id
 * Admin updates a student's name, email, and/or password.
 */
const updateStudent = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const student = await User.findOne({ _id: req.params.id, role: 'student' }).select('+password');
    if (!student) return next(createError('Student not found', 404));

    if (name && name.trim()) student.name = name.trim();
    if (email && email.trim()) {
      // Check uniqueness
      const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: student._id } });
      if (exists) return next(createError('Email already in use by another account', 409));
      student.email = email.toLowerCase().trim();
    }
    if (password && password.length >= 6) {
      student.password = password; // pre-save hook will hash it
    } else if (password) {
      return next(createError('Password must be at least 6 characters', 400));
    }

    await student.save();

    res.json({
      message: 'Student updated successfully',
      student: { _id: student._id, name: student.name, email: student.email },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/admin/students/:id
 * Deletes a student and cleans up their course enrollments.
 */
const deleteStudent = async (req, res, next) => {
  try {
    const student = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!student) return next(createError('Student not found', 404));

    // Remove student from all courses they enrolled in
    await Course.updateMany(
      { enrolledStudents: student._id },
      { $pull: { enrolledStudents: student._id } }
    );

    // Delete their submissions
    await Submission.deleteMany({ student: student._id });

    // Delete the user
    await User.findByIdAndDelete(student._id);

    res.json({ message: 'Student and all related data deleted' });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────
// ADMIN CREATION
// ─────────────────────────────────────────────

/**
 * POST /api/admin/admins
 * Creates a new admin account. Returns the generated password in the response.
 */
const createAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email) return next(createError('Name and email are required', 400));

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return next(createError('An account with this email already exists', 409));

    const rawPassword = password || `Admin@${Math.random().toString(36).slice(2, 10)}`;

    const admin = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: rawPassword,
      role: 'admin',
    });

    res.status(201).json({
      message: 'Admin account created successfully',
      admin: { _id: admin._id, name: admin.name, email: admin.email },
      generatedPassword: rawPassword,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getCourses, createCourse, getCourse, updateCourse, deleteCourse,
  createExam, getExam, updateExam, deleteExam,
  addQuestion, updateQuestion, deleteQuestion,
  getSubmissions, getSubmission, saveOverrides, finalizeSubmission,
  getActiveMonitor,
  getStudents, updateStudent, deleteStudent, createAdmin,
};
