// routes/promotions.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all active promotions
router.get('/active', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM promotions 
      WHERE is_active = 1 
      AND (valid_from IS NULL OR valid_from <= CURDATE())
      AND (valid_to IS NULL OR valid_to >= CURDATE())
      ORDER BY promo_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// APPLY promo code
router.post('/apply', async (req, res) => {
  const { code, total_amount } = req.body;
  try {
    const [promo] = await pool.query('SELECT * FROM promotions WHERE code = ? AND is_active = 1', [code.toUpperCase()]);
    if (promo.length === 0) return res.status(404).json({ message: "Invalid promo code" });

    const p = promo[0];
    if (p.min_amount && total_amount < p.min_amount) {
      return res.json({ valid: false, message: `Minimum amount ₹${p.min_amount} required` });
    }

    const discount = p.discount_type === 'Percentage' 
      ? (total_amount * p.discount_value) / 100 
      : p.discount_value;

    res.json({
      valid: true,
      code: p.code,
      discount_amount: discount,
      new_total: total_amount - discount,
      message: `${p.description}`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CRUD for admin
router.get('/', async (req, res) => { const [rows] = await pool.query('SELECT * FROM promotions'); res.json(rows); });
router.post('/', async (req, res) => { await pool.query('INSERT INTO promotions SET ?', req.body); res.status(201).json({ message: "Promo created" }); });
router.put('/:id', async (req, res) => { await pool.query('UPDATE promotions SET ? WHERE promo_id = ?', [req.body, req.params.id]); res.json({ message: "Updated" }); });
router.delete('/:id', async (req, res) => { await pool.query('DELETE FROM promotions WHERE promo_id = ?', [req.params.id]); res.json({ message: "Deleted" }); });

module.exports = router;