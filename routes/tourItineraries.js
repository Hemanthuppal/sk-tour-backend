// routes/tourItineraries.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET full day-wise itinerary for a specific tour (sorted by day)
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT itinerary_id, day, title, description, meals
      FROM tour_itineraries 
      WHERE tour_id = ?
      ORDER BY day ASC
    `, [req.params.tour_id]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single itinerary day detail
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ti.*, t.title AS tour_title
      FROM tour_itineraries ti
      JOIN tours t ON ti.tour_id = t.tour_id
      WHERE ti.itinerary_id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ message: "Itinerary day not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new itinerary day (Admin)
router.post('/', async (req, res) => {
  const { tour_id, day, title, description, meals } = req.body;

  if (!tour_id || !day || !title) {
    return res.status(400).json({ message: "tour_id, day and title are required" });
  }

  try {
    // Optional: Prevent duplicate day for same tour
    const [existing] = await pool.query(
      `SELECT itinerary_id FROM tour_itineraries WHERE tour_id = ? AND day = ?`,
      [tour_id, day]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: `Day ${day} already exists for this tour` });
    }

    const [result] = await pool.query(
      `INSERT INTO tour_itineraries (tour_id, day, title, description, meals)
       VALUES (?, ?, ?, ?, ?)`,
      [tour_id, day, title.trim(), description || null, meals || null]
    );

    res.status(201).json({
      itinerary_id: result.insertId,
      day,
      title,
      message: "Itinerary day added successfully"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK CREATE multiple days at once (Very Useful for Admin Panel)
router.post('/bulk', async (req, res) => {
  const itineraries = req.body; // Expect array of objects

  if (!Array.isArray(itineraries) || itineraries.length === 0) {
    return res.status(400).json({ message: "Send an array of itinerary days" });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    for (const item of itineraries) {
      const { tour_id, day, title, description, meals } = item;
      await conn.query(
        `INSERT INTO tour_itineraries (tour_id, day, title, description, meals) VALUES (?, ?, ?, ?, ?)`,
        [tour_id, day, title, description || null, meals || null]
      );
    }
    await conn.commit();
    res.status(201).json({ message: `${itineraries.length} itinerary days added successfully` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// UPDATE itinerary day
router.put('/:id', async (req, res) => {
  const { day, title, description, meals } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE tour_itineraries 
       SET day = ?, title = ?, description = ?, meals = ? 
       WHERE itinerary_id = ?`,
      [day, title?.trim(), description || null, meals || null, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Itinerary day not found" });
    }

    res.json({ message: "Itinerary day updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single day
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(`DELETE FROM tour_itineraries WHERE itinerary_id = ?`, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Itinerary day not found" });
    }
    res.json({ message: "Itinerary day deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE all days of a tour (useful when re-creating itinerary)
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_itineraries WHERE tour_id = ?`, [req.params.tour_id]);
    res.json({ message: "All itinerary days removed for this tour" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;