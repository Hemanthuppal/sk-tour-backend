const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all POI items for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_booking_poi 
       WHERE tour_id = ? 
       ORDER BY sort_order ASC, poi_id ASC`,
      [req.params.tour_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE single POI item
router.post('/', async (req, res) => {
  const { tour_id, title, item, sort_order } = req.body;

  if (!tour_id || !item) {
    return res.status(400).json({ message: 'tour_id and item are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_booking_poi (tour_id, title, item, sort_order)
       VALUES (?, ?, ?, ?)`,
      [tour_id, title || null, item.trim(), sort_order || 1]
    );

    res.status(201).json({
      poi_id: result.insertId,
      message: 'Booking POI item added successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE item
router.put('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE tour_booking_poi SET ? WHERE poi_id = ?`,
      [req.body, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'POI item not found' });

    res.json({ message: 'POI item updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE item
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tour_booking_poi WHERE poi_id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'POI item not found' });

    res.json({ message: 'POI item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE ALL POI for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_booking_poi WHERE tour_id = ?`, [
      req.params.tour_id
    ]);
    res.json({ message: 'All booking POI removed for this tour' });
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
    const values = items.map((p, idx) => [
      tour_id,
      null,                       // title optional
      p.item,                     // <-- FIXED
      idx + 1,
      p.amount_details || null    // <-- FIXED
    ]);

    await conn.query(
      `INSERT INTO tour_booking_poi 
        (tour_id, title, item, sort_order, amount_details)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${items.length} booking POI items added`,
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


// DELETE ALL POI items for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tour_booking_poi WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} booking POI items` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
