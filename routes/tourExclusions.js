// routes/tourExclusions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all exclusions for a specific tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT exclusion_id, item
      FROM tour_exclusions 
      WHERE tour_id = ?
      ORDER BY exclusion_id ASC
    `, [req.params.tour_id]);

    const exclusions = rows.map(row => row.item);

    res.json({
      tour_id: parseInt(req.params.tour_id),
      exclusions_count: rows.length,
      exclusions_list: exclusions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single exclusion
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT te.*, t.title AS tour_title 
      FROM tour_exclusions te
      JOIN tours t ON te.tour_id = t.tour_id
      WHERE te.exclusion_id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ message: "Exclusion not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new exclusion (single)
router.post('/', async (req, res) => {
  const { tour_id, item } = req.body;

  if (!tour_id || !item) {
    return res.status(400).json({ message: "tour_id and item are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_exclusions (tour_id, item) VALUES (?, ?)`,
      [tour_id, item.trim()]
    );

    res.status(201).json({
      exclusion_id: result.insertId,
      tour_id,
      item: item.trim(),
      message: "Exclusion added successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK CREATE multiple exclusions at once (Admin favorite)
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
      `INSERT INTO tour_exclusions (tour_id, item) VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${items.length} exclusions added successfully`,
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

// UPDATE exclusion
router.put('/:id', async (req, res) => {
  const { item } = req.body;

  if (!item) {
    return res.status(400).json({ message: "item is required" });
  }

  try {
    const [result] = await pool.query(
      `UPDATE tour_exclusions SET item = ? WHERE exclusion_id = ?`,
      [item.trim(), req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Exclusion not found" });
    }

    res.json({ message: "Exclusion updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single exclusion
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(`DELETE FROM tour_exclusions WHERE exclusion_id = ?`, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Exclusion not found" });
    }
    res.json({ message: "Exclusion deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE ALL exclusions of a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_exclusions WHERE tour_id = ?`, [req.params.tour_id]);
    res.json({ message: "All exclusions removed for this tour" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;