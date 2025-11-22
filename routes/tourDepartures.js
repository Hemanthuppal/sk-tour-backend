// routes/tourDepartures.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/tour/:tour_id', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT *, (total_seats - booked_seats) AS available_seats
    FROM tour_departures WHERE tour_id = ? ORDER BY departure_date
  `, [req.params.tour_id]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { tour_id, departure_date, return_date, adult_price, child_price, total_seats = 40 } = req.body;
  const [result] = await pool.query(
    'INSERT INTO tour_departures (tour_id, departure_date, return_date, adult_price, child_price, total_seats) VALUES (?, ?, ?, ?, ?, ?)',
    [tour_id, departure_date, return_date, adult_price, child_price || null, total_seats]
  );
  res.status(201).json({ departure_id: result.insertId });
});

router.put('/:id', async (req, res) => {
  await pool.query('UPDATE tour_departures SET ? WHERE departure_id = ?', [req.body, req.params.id]);
  res.json({ message: "Updated" });
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM tour_departures WHERE departure_id = ?', [req.params.id]);
  res.json({ message: "Deleted" });
});

module.exports = router;