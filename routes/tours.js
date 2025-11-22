// routes/tours.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all tours
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, c.name AS category_name, d.name AS primary_destination_name
      FROM tours t
      LEFT JOIN tour_categories c ON t.category_id = c.category_id
      LEFT JOIN destinations d ON t.primary_destination_id = d.destination_id
      ORDER BY t.tour_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET single tour with full details
router.get('/:id', async (req, res) => {
  try {
    const [tour] = await pool.query('SELECT * FROM tours WHERE tour_id = ?', [req.params.id]);
    if (!tour.length) return res.status(404).json({ message: "Tour not found" });

    const details = await Promise.all([
      pool.query('SELECT d.* FROM destinations d JOIN tour_destinations td ON d.destination_id = td.destination_id WHERE td.tour_id = ?', [req.params.id]),
      pool.query('SELECT * FROM tour_itineraries WHERE tour_id = ? ORDER BY day', [req.params.id]),
      pool.query('SELECT item FROM tour_inclusions WHERE tour_id = ?', [req.params.id]),
      pool.query('SELECT item FROM tour_exclusions WHERE tour_id = ?', [req.params.id]),
      pool.query('SELECT * FROM tour_images WHERE tour_id = ?', [req.params.id]),
      pool.query('SELECT * FROM tour_departures WHERE tour_id = ? AND departure_date >= CURDATE() ORDER BY departure_date', [req.params.id])
    ]);

    res.json({
      tour: tour[0],
      destinations: details[0][0],
      itinerary: details[1][0],
      inclusions: details[2][0].map(i => i.item),
      exclusions: details[3][0].map(e => e.item),
      images: details[4][0],
      departures: details[5][0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE
router.post('/', async (req, res) => {
  const { tour_code, title, category_id, primary_destination_id, duration_days, overview, base_price_adult, is_international = 0 } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO tours (tour_code, title, category_id, primary_destination_id, duration_days, overview, base_price_adult, is_international)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tour_code, title, category_id, primary_destination_id, duration_days, overview, base_price_adult, is_international]
    );
    res.status(201).json({ tour_id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// UPDATE
router.put('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE tours SET ? WHERE tour_id = ?', [req.body, req.params.id]);
    res.json({ message: "Tour updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tours WHERE tour_id = ?', [req.params.id]);
    res.json({ message: "Tour deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;