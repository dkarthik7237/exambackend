const express = require('express');
const router = express.Router();
const { runCheckExpired } = require('../services/cronJob');

/**
 * POST /api/cron/check-expired
 * Triggered by Vercel Cron or external schedulers.
 */
router.post('/check-expired', async (req, res, next) => {
  try {
    await runCheckExpired();
    res.json({ status: 'success', message: 'Expired exams checked and updated successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
