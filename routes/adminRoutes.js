const express = require('express');
const router = express.Router();
const { protect, isAdmin } = require('../middleware/authMiddleware');
const {
  getStats,
  getCourses, createCourse, getCourse, updateCourse, deleteCourse,
  createExam, getExam, updateExam, deleteExam,
  addQuestion, updateQuestion, deleteQuestion,
  getSubmissions, getSubmission, saveOverrides, finalizeSubmission,
  getActiveMonitor,
  getStudents, updateStudent, deleteStudent, createAdmin,
} = require('../controllers/adminController');

// All admin routes require authentication + admin role
router.use(protect, isAdmin);

// Dashboard
router.get('/stats', getStats);

// Courses
router.route('/courses').get(getCourses).post(createCourse);
router.route('/courses/:id').get(getCourse).put(updateCourse).delete(deleteCourse);

// Exams
router.post('/exams', createExam);
router.route('/exams/:id').get(getExam).put(updateExam).delete(deleteExam);

// Questions
router.post('/exams/:examId/questions', addQuestion);
router.route('/questions/:id').put(updateQuestion).delete(deleteQuestion);

// Submissions
router.get('/submissions', getSubmissions);
router.get('/submissions/:id', getSubmission);
router.put('/submissions/:id/override', saveOverrides);
router.put('/submissions/:id/finalize', finalizeSubmission);

// Live Monitor
router.get('/monitor', getActiveMonitor);

// Student Management
router.get('/students', getStudents);
router.route('/students/:id').put(updateStudent).delete(deleteStudent);

// Admin Creation
router.post('/admins', createAdmin);

module.exports = router;
