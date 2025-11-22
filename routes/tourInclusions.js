// routes/tourInclusions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all inclusions for a specific tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT inclusion_id, item
      FROM tour_inclusions 
      WHERE tour_id = ?
      ORDER BY inclusion_id ASC
    `, [req.params.tour_id]);

    // Return as simple array of strings (most frontends prefer this)
    const inclusions = rows.map(row => row.item);
    res.json({
      tour_id: parseInt(req.params.tour_id),
      inclusions_count: rows.length,
      inclusions_list: inclusions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single inclusion
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ti.*, t.title AS tour_title 
      FROM tour_inclusions ti
      JOIN tours t ON ti.tour_id = t.tour_id
      WHERE ti.inclusion_id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ message: "Inclusion not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new inclusion (single)
router.post('/', async (req, res) => {
  const { tour_id, item } = req.body;

  if (!tour_id || !item) {
    return res.status(400).json({ message: "tour_id and item are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_inclusions (tour_id, item) VALUES (?, ?)`,
      [tour_id, item.trim()]
    );

    res.status(201).json({
      inclusion_id: result.insertId,
      tour_id,
      item: item.trim(),
      message: "Inclusion added successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK CREATE multiple inclusions at once (Very useful for admin panel)
router.post('/bulk', async (req, res) => {
  const { tour_id, items } = req.body; // items = array of strings

  if (!tour_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "tour_id and items array are required" });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const values = items.map(item => [tour_id, item.trim()]);
    await conn.query(
      `INSERT INTO tour_inclusions (tour_id, item) VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${items.length} inclusions added successfully`,
      tour_id,
      added_count: items.length
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// UPDATE inclusion
router.put('/:id', async (req, res) => {
  const { item } = req.body;

  if (!item) {
    return res.status(400).json({ message: "item is required" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE tour_inclusions SET item = ? WHERE inclusion_id = ?`,
      [item.trim(), req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Inclusion not found" });
    }

    res.json({ message: "Inclusion updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single inclusion
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(`DELETE FROM tour_inclusions WHERE inclusion_id = ?`, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Inclusion not found" });
    }
    res.json({ message: "Inclusion deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE ALL inclusions of a tour (useful when resetting)
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_inclusions WHERE tour_id = ?`, [req.params.tour_id]);
    res.json({ message: "All inclusions removed for this tour" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;