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
    mode,
    from_city,
    to_city,
    carrier,
    number_code,
    departure_datetime,
    arrival_datetime,
    description,
    sort_order
  } = req.body;

  if (!tour_id || !mode || !from_city || !to_city) {
    return res.status(400).json({ message: 'tour_id, mode, from_city and to_city are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_transports
        (tour_id, mode, from_city, to_city, carrier, number_code, 
         departure_datetime, arrival_datetime, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tour_id,
        mode,
        from_city,
        to_city,
        carrier || null,
        number_code || null,
        departure_datetime || null,
        arrival_datetime || null,
        description || null,
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

// DELETE ALL segments of a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_transports WHERE tour_id = ?`, [
      req.params.tour_id
    ]);
    res.json({ message: 'All transport details removed for this tour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  const { tour_id, items } = req.body;

  if (!tour_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'tour_id and items[] are required' });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
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
      i + 1
    ]);

    await conn.query(
      `INSERT INTO tour_transports
      (tour_id, description, airline, flight_no, from_city, from_date, from_time,
       to_city, to_date, to_time, via, sort_order)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({ message: 'Transport saved', count: items.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// DELETE ALL transports for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tour_transports WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} transport rows` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



module.exports = router;
