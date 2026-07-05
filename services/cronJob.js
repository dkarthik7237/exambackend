const cron = require('node-cron');
const Submission = require('../models/Submission');
const { gradeSubmission } = require('./gradingService');

/**
 * Core logic to check for expired exams and grade them.
 * Expose this function so it can be triggered via HTTP API route on Vercel.
 */
const runCheckExpired = async () => {
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
      
      // Log the event in the proctoring audit log
      submission.proctoringLogs.push({
        event: 'Auto-Submitted (Time Expired)',
        details: 'Exam closed automatically because time limit was exceeded.'
      });
      
      await submission.save();

      // Auto-grade
      await gradeSubmission(submission._id);
    }
  } catch (err) {
    console.error('❌ Error executing expired exam checks:', err.message);
    throw err;
  }
};

/**
 * Starts the in-memory cron job (only for local development/non-serverless).
 */
const startCronJobs = () => {
  if (process.env.VERCEL) {
    console.log('🕐 Running on Vercel: node-cron scheduler startup bypassed.');
    return;
  }

  cron.schedule('* * * * *', async () => {
    try {
      await runCheckExpired();
    } catch (err) {
      console.error('❌ Cron job run error:', err.message);
    }
  });

  console.log('🕐 Cron job registered: checking expired exams every minute');
};

module.exports = { startCronJobs, runCheckExpired };
