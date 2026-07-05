/**
 * Seed script — run with: npm run seed
 *
 * Creates:
 *  • 1 Admin (from .env credentials)
 *  • 2 Sample students
 *  • 2 Courses
 *  • 2 Exams (1 per course, each with 5 MCQs)
 *  • Enrolls both students in both courses
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Submission = require('../models/Submission');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Course.deleteMany({}),
      Exam.deleteMany({}),
      Question.deleteMany({}),
      Submission.deleteMany({}),
    ]);
    console.log('🗑️  Cleared existing data');

    // ── Admin ────────────────────────────────────────────────────
    const admin = await User.create({
      name: process.env.ADMIN_NAME || 'Super Admin',
      email: process.env.ADMIN_EMAIL || 'admin@exam.com',
      password: process.env.ADMIN_PASSWORD || 'Admin@1234',
      role: 'admin',
    });
    console.log(`👤 Admin created: ${admin.email}`);

    // ── Students ─────────────────────────────────────────────────
    const [student1, student2] = await User.create([
      { name: 'Alice Johnson', email: 'alice@student.com', password: 'Student@1234', role: 'student' },
      { name: 'Bob Smith', email: 'bob@student.com', password: 'Student@1234', role: 'student' },
    ]);
    console.log(`👤 Students created: ${student1.email}, ${student2.email}`);

    // ── Course 1 ─────────────────────────────────────────────────
    const course1 = await Course.create({
      title: 'Introduction to Computer Science',
      description: 'Foundational concepts of computation, algorithms, and data structures.',
      createdBy: admin._id,
    });

    // ── Course 2 ─────────────────────────────────────────────────
    const course2 = await Course.create({
      title: 'Web Development Fundamentals',
      description: 'HTML, CSS, JavaScript and the basics of building modern web applications.',
      createdBy: admin._id,
    });
    console.log(`📚 Courses created: ${course1.title}, ${course2.title}`);

    // ── Exam 1 (starts now, valid for 2 hours) ───────────────────
    const now = new Date();
    const examStart = new Date(now.getTime() - 5 * 60 * 1000); // started 5 min ago
    const examEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // ends in 2 hours

    const exam1 = await Exam.create({
      title: 'CS101 — Mid-Term Exam',
      description: 'Covers algorithms, data structures, and computational thinking.',
      course: course1._id,
      duration: 30,
      startTime: examStart,
      endTime: examEnd,
      passingPercentage: 50,
      maxStrikes: 3,
      isPublished: true,
      createdBy: admin._id,
    });

    // ── Questions for Exam 1 ─────────────────────────────────────
    const q1 = [
      {
        text: 'What is the time complexity of binary search?',
        options: ['O(n)', 'O(log n)', 'O(n²)', 'O(1)'],
        correctOptionIndex: 1,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
      {
        text: 'Which data structure uses LIFO order?',
        options: ['Queue', 'Heap', 'Stack', 'Linked List'],
        correctOptionIndex: 2,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
      {
        text: 'What does RAM stand for?',
        options: ['Random Access Memory', 'Read Access Memory', 'Rapid Action Module', 'Remote Access Machine'],
        correctOptionIndex: 0,
        positiveMarks: 1,
        negativeMarks: 0,
      },
      {
        text: 'Which sorting algorithm has the best average case time complexity?',
        options: ['Bubble Sort', 'Insertion Sort', 'Merge Sort', 'Selection Sort'],
        correctOptionIndex: 2,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
      {
        text: 'In Object-Oriented Programming, what is encapsulation?',
        options: [
          'Hiding implementation details and exposing only necessary interfaces',
          'Creating multiple instances of a class',
          'Inheriting properties from a parent class',
          'Overloading functions with different parameters',
        ],
        correctOptionIndex: 0,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
    ];

    const questions1 = await Question.insertMany(
      q1.map((q, i) => ({ ...q, exam: exam1._id, order: i }))
    );
    exam1.questions = questions1.map((q) => q._id);
    await exam1.save();
    course1.exams.push(exam1._id);

    // ── Exam 2 ───────────────────────────────────────────────────
    const exam2 = await Exam.create({
      title: 'Web Dev — Final Assessment',
      description: 'Tests understanding of HTML, CSS, and core JavaScript concepts.',
      course: course2._id,
      duration: 20,
      startTime: examStart,
      endTime: examEnd,
      passingPercentage: 60,
      maxStrikes: 2,
      isPublished: true,
      createdBy: admin._id,
    });

    const q2 = [
      {
        text: 'Which HTML tag is used to define an internal style sheet?',
        options: ['<css>', '<script>', '<style>', '<link>'],
        correctOptionIndex: 2,
        positiveMarks: 1,
        negativeMarks: 0,
      },
      {
        text: 'What does CSS stand for?',
        options: ['Cascading Style Sheets', 'Computer Style Sheets', 'Creative Style Syntax', 'Coded Style System'],
        correctOptionIndex: 0,
        positiveMarks: 1,
        negativeMarks: 0,
      },
      {
        text: 'Which JavaScript method is used to select an element by its ID?',
        options: ['querySelector()', 'getElementById()', 'getElementByClass()', 'selectId()'],
        correctOptionIndex: 1,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
      {
        text: 'What is the correct way to declare a constant in JavaScript?',
        options: ['var x = 5;', 'let x = 5;', 'const x = 5;', 'constant x = 5;'],
        correctOptionIndex: 2,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
      {
        text: 'Which HTTP method is used to send data to a server to create a resource?',
        options: ['GET', 'PUT', 'DELETE', 'POST'],
        correctOptionIndex: 3,
        positiveMarks: 2,
        negativeMarks: 0.5,
      },
    ];

    const questions2 = await Question.insertMany(
      q2.map((q, i) => ({ ...q, exam: exam2._id, order: i }))
    );
    exam2.questions = questions2.map((q) => q._id);
    await exam2.save();
    course2.exams.push(exam2._id);

    // ── Enroll students ──────────────────────────────────────────
    course1.enrolledStudents = [student1._id, student2._id];
    course2.enrolledStudents = [student1._id, student2._id];
    await course1.save();
    await course2.save();

    await User.updateMany(
      { _id: { $in: [student1._id, student2._id] } },
      { $addToSet: { enrolledCourses: { $each: [course1._id, course2._id] } } }
    );

    console.log('🎓 Students enrolled in both courses');

    console.log('\n✅ Seed complete!\n');
    console.log('─────────────────────────────────────────');
    console.log('CREDENTIALS');
    console.log('─────────────────────────────────────────');
    console.log(`Admin    → ${admin.email} / ${process.env.ADMIN_PASSWORD}`);
    console.log(`Student1 → ${student1.email} / Student@1234`);
    console.log(`Student2 → ${student2.email} / Student@1234`);
    console.log('─────────────────────────────────────────\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
};

seed();
