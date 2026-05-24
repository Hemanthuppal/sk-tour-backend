const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all instructions for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT instruction_id, item, item_option1, item_option2, item_active, sort_order
       FROM tour_instructions
       WHERE tour_id = ?
       ORDER BY sort_order ASC, instruction_id ASC`,
      [req.params.tour_id]
    );

    res.json({
      tour_id: parseInt(req.params.tour_id),
      count: rows.length,
      instructions: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// CREATE single instruction
router.post('/', async (req, res) => {
  const { tour_id, item, item_option1, item_option2, item_active, sort_order } = req.body;

  if (!tour_id) {
    return res.status(400).json({ message: 'tour_id is required' });
  }

  try {
    const activeItem = item_active === 'option2' ? (item_option2 || item) : (item_option1 || item);
    
    const [result] = await pool.query(
      `INSERT INTO tour_instructions (tour_id, item, item_option1, item_option2, item_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tour_id, activeItem, item_option1 || null, item_option2 || null, item_active || 'option1', sort_order || 1]
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
  const { item, item_option1, item_option2, item_active, sort_order } = req.body;

  if (!item && !item_option1 && !item_option2 && sort_order == null) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  try {
    const activeItem = item_active === 'option2' ? (item_option2 || item) : (item_option1 || item);
    
    const [result] = await pool.query(
      `UPDATE tour_instructions 
       SET item = ?, item_option1 = ?, item_option2 = ?, item_active = ?, sort_order = ?
       WHERE instruction_id = ?`,
      [activeItem, item_option1 || null, item_option2 || null, item_active || 'option1', sort_order, req.params.id]
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
    const values = items.map((text, idx) => {
      let itemText, itemOpt1, itemOpt2, itemActive;
      
      if (typeof text === 'object') {
        itemOpt1 = text.item_option1 || null;
        itemOpt2 = text.item_option2 || null;
        itemActive = text.item_active || 'option1';
        itemText = itemActive === 'option2' ? (itemOpt2 || text.item) : (itemOpt1 || text.item);
      } else {
        itemText = String(text).trim();
        itemOpt1 = itemText;
        itemOpt2 = null;
        itemActive = 'option1';
      }
      
      return [
        tour_id,
        itemText,
        itemOpt1,
        itemOpt2,
        itemActive,
        idx + 1
      ];
    });

    await conn.query(
      `INSERT INTO tour_instructions (tour_id, item, item_option1, item_option2, item_active, sort_order)
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



// DELETE ALL instructions for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tour_instructions WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} instructions` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
