const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_hotels WHERE tour_id = ? ORDER BY hotel_id ASC`,
      [req.params.tour_id]
    );

    res.json(rows);

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { tour_id, city, hotel_name, room_type, nights } = req.body;

  if (!tour_id || !city || !hotel_name || !room_type || !nights) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_hotels (tour_id, city, hotel_name, room_type, nights)
       VALUES (?, ?, ?, ?, ?)`,
      [tour_id, city, hotel_name, room_type, nights]
    );

    res.status(201).json({ message: "Hotel added", hotel_id: result.insertId });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:hotel_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE tour_hotels SET ? WHERE hotel_id = ?`,
      [req.body, req.params.hotel_id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Hotel not found" });

    res.json({ message: "Updated successfully" });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:hotel_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_hotels WHERE hotel_id = ?`, [req.params.hotel_id]);
    res.json({ message: "Deleted successfully" });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { tour_id, hotels } = req.body;

  if (!tour_id || !Array.isArray(hotels) || hotels.length === 0) {
    return res.status(400).json({ message: 'tour_id and hotels[] are required' });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const values = hotels.map((h) => [
      tour_id,
      h.city || '',
      h.hotel_name || '',
      h.room_type || null,
      h.nights ? Number(h.nights) : null,
      h.remarks || null
    ]);

    await conn.query(
      `INSERT INTO tour_hotels (tour_id, city, hotel_name, room_type, nights, remarks)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${hotels.length} hotel rows added successfully`,
      tour_id,
      added_count: hotels.length
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;