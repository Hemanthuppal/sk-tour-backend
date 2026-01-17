const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all transport segments for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_transports 
       WHERE tour_id = ? 
       ORDER BY sort_order ASC, transport_id ASC`,
      [req.params.tour_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single transport segment
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_transports WHERE transport_id = ?`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Transport not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE single transport segment
router.post('/', async (req, res) => {
  const {
    tour_id,
    description,
    airline,
    flight_no,
    from_city,
    from_date,
    from_time,
    to_city,
    to_date,
    to_time,
    via,
    sort_order
  } = req.body;

  if (!tour_id || !from_city || !to_city) {
    return res.status(400).json({ message: 'tour_id, from_city and to_city are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_transports
        (tour_id, description, airline, flight_no, from_city, from_date, from_time,
         to_city, to_date, to_time, via, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tour_id,
        description || null,
        airline || null,
        flight_no || null,
        from_city || null,
        from_date || null,
        from_time || null,
        to_city || null,
        to_date || null,
        to_time || null,
        via || null,
        sort_order || 1
      ]
    );

    res.status(201).json({
      transport_id: result.insertId,
      message: 'Transport segment added successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE transport segment
router.put('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE tour_transports SET ? WHERE transport_id = ?`,
      [req.body, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Transport not found' });

    res.json({ message: 'Transport updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE single segment
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tour_transports WHERE transport_id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Transport not found' });

    res.json({ message: 'Transport deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BULK CREATE transport segments
router.post('/bulk', async (req, res) => {
  const { tour_id, items } = req.body;

  if (!tour_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'tour_id and items[] are required' });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // First, delete existing transport for this tour
    await conn.query(`DELETE FROM tour_transports WHERE tour_id = ?`, [tour_id]);

    // Prepare values for insertion
    const values = items.map((t, i) => [
      tour_id,
      t.description || null,
      t.airline || null,
      t.flight_no || null,
      t.from_city || null,
      t.from_date || null,
      t.from_time || null,
      t.to_city || null,
      t.to_date || null,
      t.to_time || null,
      t.via || null,
      t.sort_order || i + 1
    ]);

    // Insert new transport items
    if (values.length > 0) {
      await conn.query(
        `INSERT INTO tour_transports
        (tour_id, description, airline, flight_no, from_city, from_date, from_time,
         to_city, to_date, to_time, via, sort_order)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.status(201).json({ 
      success: true,
      message: 'Transport saved successfully', 
      count: items.length 
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error saving bulk transport:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  } finally {
    conn.release();
  }
});

// DELETE ALL segments of a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tour_transports WHERE tour_id = ?`, 
      [req.params.tour_id]
    );
    
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} transport rows for tour ${req.params.tour_id}` 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;