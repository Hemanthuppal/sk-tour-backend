const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all cancellation slabs for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_cancellation_policies
       WHERE tour_id = ?
       ORDER BY sort_order ASC, policy_id ASC`,
      [req.params.tour_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE single policy
router.post('/', async (req, res) => {
  const { tour_id, days_min, days_max, charge_percentage, description, sort_order } = req.body;

  if (!tour_id || charge_percentage == null) {
    return res.status(400).json({ message: 'tour_id and charge_percentage are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_cancellation_policies
        (tour_id, days_min, days_max, charge_percentage, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tour_id,
        days_min ?? null,
        days_max ?? null,
        charge_percentage,
        description || null,
        sort_order || 1
      ]
    );

    res.status(201).json({
      policy_id: result.insertId,
      message: 'Cancellation policy added successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE policy
router.put('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE tour_cancellation_policies SET ? WHERE policy_id = ?`,
      [req.body, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Policy not found' });

    res.json({ message: 'Policy updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE policy
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tour_cancellation_policies WHERE policy_id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Policy not found' });

    res.json({ message: 'Policy deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE ALL policies of a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM tour_cancellation_policies WHERE tour_id = ?`,
      [req.params.tour_id]
    );
    res.json({ message: 'All cancellation policies removed for this tour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { tour_id, policies } = req.body;

  if (!tour_id || !Array.isArray(policies) || policies.length === 0) {
    return res.status(400).json({ message: 'tour_id and policies[] are required' });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const values = policies.map((p, idx) => [
  tour_id,
  null,   // days_min removed
  null,   // days_max removed
  null,   // charge_percentage removed
  p.cancellation_policy || null,  // mapped to description
  idx + 1,
  p.charges || null               // charges description
]);

    await conn.query(
      `INSERT INTO tour_cancellation_policies
        (tour_id, days_min, days_max, charge_percentage, cancellation_policy, sort_order, charges)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${policies.length} cancellation policies added`,
      tour_id,
      added_count: policies.length
    });

  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});



module.exports = router;
