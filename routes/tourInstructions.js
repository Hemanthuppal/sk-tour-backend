const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all instructions for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT instruction_id, item, sort_order
       FROM tour_instructions
       WHERE tour_id = ?
       ORDER BY sort_order ASC, instruction_id ASC`,
      [req.params.tour_id]
    );

    const instructions = rows.map(r => r.item);
    res.json({
      tour_id: parseInt(req.params.tour_id),
      count: rows.length,
      instructions_list: instructions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE single instruction
router.post('/', async (req, res) => {
  const { tour_id, item, sort_order } = req.body;

  if (!tour_id || !item) {
    return res.status(400).json({ message: 'tour_id and item are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_instructions (tour_id, item, sort_order)
       VALUES (?, ?, ?)`,
      [tour_id, item.trim(), sort_order || 1]
    );

    res.status(201).json({
      instruction_id: result.insertId,
      message: 'Instruction added successfully'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE instruction
router.put('/:id', async (req, res) => {
  const { item, sort_order } = req.body;

  if (!item && sort_order == null) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE tour_instructions SET ? WHERE instruction_id = ?`,
      [req.body, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Instruction not found' });

    res.json({ message: 'Instruction updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE instruction
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM tour_instructions WHERE instruction_id = ?`,
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: 'Instruction not found' });

    res.json({ message: 'Instruction deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE ALL instructions of a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_instructions WHERE tour_id = ?`, [
      req.params.tour_id
    ]);
    res.json({ message: 'All instructions removed for this tour' });
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
    const values = items.map((text, idx) => [
      tour_id,
      String(text).trim(),
      idx + 1
    ]);

    await conn.query(
      `INSERT INTO tour_instructions (tour_id, item, sort_order)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${items.length} instructions added`,
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


module.exports = router;
