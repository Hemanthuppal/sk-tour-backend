// routes/reviews.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET approved reviews for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, c.full_name 
      FROM reviews r
      JOIN customers c ON r.customer_id = c.customer_id
      WHERE r.tour_id = ? AND r.approved = 1
      ORDER BY r.created_at DESC
    `, [req.params.tour_id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SUBMIT new review
router.post('/', async (req, res) => {
  const { tour_id, customer_id, rating, review_text } = req.body;
  if (rating < 1 || rating > 5) return res.status(400).json({ message: "Rating must be 1-5" });

  try {
    await pool.query(
      `INSERT INTO reviews (tour_id, customer_id, rating, review_text, approved) VALUES (?, ?, ?, ?, 0)`,
      [tour_id, customer_id, rating, review_text || null]
    );
    res.status(201).json({ message: "Thank you! Your review is under moderation." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADMIN: Approve review
router.put('/approve/:id', async (req, res) => {
  await pool.query('UPDATE reviews SET approved = 1 WHERE review_id = ?', [req.params.id]);
  res.json({ message: "Review approved" });
});

module.exports = router;