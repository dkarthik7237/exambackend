const Submission = require('../models/Submission');
const Question = require('../models/Question');

/**
 * Calculates the score for a submission given an array of question documents.
 *
 * Logic per question:
 *  1. If admin has set a manual override → use that (true = correct, false = 0 marks/no negative)
 *  2. If student answered → compare to correctOptionIndex; apply +ve or −ve marks
 *  3. If unanswered → 0 marks
 *
 * @param {import('../models/Submission')} submission - Populated submission document
 * @param {import('../models/Question')[]} questions  - Array of Question documents
 * @param {number} passingPercentage                  - Exam's passing threshold (0-100)
 * @returns {{ score: number, totalMarks: number, isPassed: boolean }}
 */
const calculateScore = (submission, questions, passingPercentage) => {
  let score = 0;
  let totalMarks = 0;

  for (const question of questions) {
    const qId = question._id.toString();
    totalMarks += question.positiveMarks;

    // Check for admin override
    const override =
      submission.questionOverrides instanceof Map
        ? submission.questionOverrides.get(qId)
        : undefined;

    if (override !== undefined && override !== null) {
      // Manual override: true → correct marks, false → 0 (no negative)
      if (override === true) score += question.positiveMarks;
    } else {
      // Auto-grade from stored answer
      const answer =
        submission.answers instanceof Map ? submission.answers.get(qId) : undefined;

      if (answer !== undefined && answer !== null) {
        if (Number(answer) === question.correctOptionIndex) {
          score += question.positiveMarks;
        } else {
          score -= question.negativeMarks;
        }
      }
      // Unanswered = 0
    }
  }

  // Clamp score to prevent negatives below 0
  score = Math.max(0, Math.round(score * 100) / 100);
  totalMarks = Math.round(totalMarks * 100) / 100;

  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
  const isPassed = percentage >= passingPercentage;

  return { score, totalMarks, isPassed };
};

/**
 * Grades a submission by fetching its exam's questions and updating the document.
 * Can be called after submit, debarment, cron force-submit, or admin override.
 *
 * @param {string|mongoose.Types.ObjectId} submissionId
 * @returns {Promise<{ score, totalMarks, isPassed }>}
 */
const gradeSubmission = async (submissionId) => {
  const submission = await Submission.findById(submissionId).populate({
    path: 'exam',
    select: 'passingPercentage questions',
    populate: { path: 'questions' },
  });

  if (!submission) throw new Error('Submission not found');

  const { score, totalMarks, isPassed } = calculateScore(
    submission,
    submission.exam.questions,
    submission.exam.passingPercentage
  );

  submission.score = score;
  submission.totalMarks = totalMarks;
  submission.isPassed = isPassed;
  await submission.save();

  return { score, totalMarks, isPassed };
};

module.exports = { calculateScore, gradeSubmission };
