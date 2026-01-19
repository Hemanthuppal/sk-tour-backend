const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT hotel_id, tour_id, city, nights, remarks, 
              standard_hotel_name, deluxe_hotel_name, executive_hotel_name,
              created_at 
       FROM tour_hotels 
       WHERE tour_id = ? 
       ORDER BY hotel_id ASC`,
      [req.params.tour_id]
    );

    res.json(rows);

  } catch(err) {
    console.error('Error fetching hotels:', err);
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
    // Map hotel data to match the exact column order in your table
    const values = hotels.map((h) => [
      tour_id,
      h.city || '',
      h.nights ? Number(h.nights) : null,
      h.standard_hotel_name || null,  // Column 4 in your table
      h.deluxe_hotel_name || null,    // Column 5
      h.executive_hotel_name || null   // Column 6
      // Note: 'remarks' column doesn't exist in your table schema
    ]);

    // Updated INSERT query matching your table columns
    await conn.query(
      `INSERT INTO tour_hotels 
       (tour_id, city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name)
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
    console.error('Error saving hotels:', err);
    res.status(500).json({ 
      error: err.message,
      sqlMessage: err.sqlMessage 
    });
  } finally {
    conn.release();
  }
});

// DELETE ALL hotels for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tour_hotels WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} hotel rows` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;