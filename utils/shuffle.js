/**
 * Deterministic seeded shuffle utilities.
 * Used by BOTH the backend (session generation) and frontend (display rendering)
 * to produce identical orderings from the same seed.
 *
 * Seed derivation: parseInt(submissionId.slice(-8), 16)
 */

/**
 * Mulberry32 — a fast, high-quality 32-bit pseudo-random number generator.
 * @param {number} seed
 * @returns {function(): number} RNG returning floats in [0, 1)
 */
const mulberry32 = (seed) => {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Fisher-Yates shuffle using the provided RNG.
 * Returns a NEW array — original is not mutated.
 * @param {Array} arr
 * @param {function(): number} rng
 * @returns {Array}
 */
const shuffleWithRng = (arr, rng) => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Derives a numeric seed from a MongoDB ObjectId string.
 * @param {string} id - MongoDB ObjectId hex string
 * @returns {number}
 */
const getSeedFromId = (id) => parseInt(id.toString().slice(-8), 16);

/**
 * Produces the shuffled question order and per-question option maps
 * given a list of question documents and a submission ID seed.
 *
 * @param {Array} questions - Array of Mongoose Question documents
 * @param {string} submissionId - MongoDB ObjectId string (used as seed)
 * @returns {{
 *   shuffledQuestions: Array,   // questions in display order (no correct answer exposed)
 *   optionMaps: Object          // { [questionId]: number[] } optionMaps[qId][displayIdx] = originalIdx
 * }}
 */
const generateShuffledSession = (questions, submissionId) => {
  const seed = getSeedFromId(submissionId);
  const rng = mulberry32(seed);

  // 1. Shuffle question order
  const questionIndices = questions.map((_, i) => i);
  const shuffledIndices = shuffleWithRng(questionIndices, rng);
  const shuffledQuestions = shuffledIndices.map((i) => questions[i]);

  // 2. Shuffle options for each question (in the NEW order)
  const optionMaps = {};
  const displayQuestions = shuffledQuestions.map((q) => {
    const qId = q._id.toString();
    const originalIndices = [0, 1, 2, 3];
    const shuffledOptionIndices = shuffleWithRng(originalIndices, rng);

    // optionMaps[qId][displayPosition] = originalOptionIndex
    optionMaps[qId] = shuffledOptionIndices;

    return {
      _id: q._id,
      text: q.text,
      // options in display order — client must not receive correctOptionIndex
      options: shuffledOptionIndices.map((origIdx) => q.options[origIdx]),
      positiveMarks: q.positiveMarks,
      negativeMarks: q.negativeMarks,
    };
  });

  return { shuffledQuestions: displayQuestions, optionMaps };
};

module.exports = { mulberry32, shuffleWithRng, getSeedFromId, generateShuffledSession };
