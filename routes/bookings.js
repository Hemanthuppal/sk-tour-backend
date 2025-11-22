// routes/bookings.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const { customer_id, departure_id, total_adult, total_child = 0, total_infant = 0, passengers, total_amount } = req.body;
    const ref = `KES${Date.now()}`;

    const [booking] = await conn.query(
      `INSERT INTO bookings (booking_ref, customer_id, departure_id, total_adult, total_child, total_infant, total_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ref, customer_id, departure_id, total_adult, total_child, total_infant, total_amount]
    );

    for (const p of passengers) {
      await conn.query(
        `INSERT INTO booking_passengers (booking_id, first_name, last_name, gender, date_of_birth, passenger_type, passport_no)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [booking.insertId, p.first_name, p.last_name, p.gender, p.date_of_birth, p.passenger_type, p.passport_no || null]
      );
    }

    await conn.commit();
    res.status(201).json({ booking_ref: ref, booking_id: booking.insertId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

router.get('/customer/:customer_id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM bookings WHERE customer_id = ? ORDER BY booking_date DESC', [req.params.customer_id]);
  res.json(rows);
});

module.exports = router;