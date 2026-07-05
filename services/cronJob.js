const cron = require('node-cron');
const Submission = require('../models/Submission');
const Exam = require('../models/Exam');
const { gradeSubmission } = require('./gradingService');
const { getIO } = require('../config/socket');

/**
 * Finds all Pending submissions whose time window has expired and
 * force-submits + auto-grades them.
 *
 * Runs every minute: "* * * * *"
 */
const startCronJobs = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Find all Pending submissions
      const pendingSubmissions = await Submission.find({ status: 'Pending' }).populate(
        'exam',
        'duration'
      );

      const expired = pendingSubmissions.filter((sub) => {
        const deadline = new Date(sub.startTime.getTime() + sub.exam.duration * 60 * 1000);
        return deadline <= now;
      });

      if (expired.length > 0) {
        console.log(`⏰ Cron: force-submitting ${expired.length} expired submission(s)`);
      }

      for (const submission of expired) {
        submission.status = 'Submitted';
        submission.forceSubmitReason = 'Time expired (cron)';
        await submission.save();

        // Auto-grade
        await gradeSubmission(submission._id);

        // Notify admin monitor via Socket.io
        try {
          const io = getIO();
          io.to('admin-monitor').emit('exam:force_submitted', {
            submissionId: submission._id,
            studentId: submission.student,
            examId: submission.exam._id,
            reason: 'Time expired',
          });

          // Notify the student's session room
          io.to(`session:${submission._id}`).emit('exam:time_expired', {
            submissionId: submission._id,
          });
        } catch (_) {
          // Socket.io may not be ready during startup — silently ignore
        }
      }
    } catch (err) {
      console.error('❌ Cron job error:', err.message);
    }
  });

  console.log('🕐 Cron job registered: checking expired exams every minute');
};

module.exports = { startCronJobs };
