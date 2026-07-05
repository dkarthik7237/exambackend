const express = require('express');
const router = express.Router();
const { protect, isStudent } = require('../middleware/authMiddleware');
const {
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
} = require('../controllers/studentController');

// All student routes require authentication + student role
router.use(protect, isStudent);

// Course catalog & enrollment
router.get('/courses', getCourses);
router.post('/courses/:courseId/enroll', enrollCourse);
router.get('/courses/:courseId/exams', getCourseExams);

// Exam session
router.post('/exams/:examId/start', startExam);
router.get('/exams/:examId/session', getSession);

// Answers & submission management
router.put('/submissions/:id/answer', saveAnswer);
router.post('/submissions/:id/submit', submitExam);
router.post('/submissions/:id/strike', logStrike);

// Results
router.get('/submissions/:id/result', getResult);
router.get('/my-submissions', getMySubmissions);

module.exports = router;
