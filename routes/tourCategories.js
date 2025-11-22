// routes/tourCategories.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM tour_categories');
  res.json(rows);
});

router.post('/', async (req, res) => {
  await pool.query('INSERT INTO tour_categories SET ?', req.body);
  res.status(201).json({ message: "Category added" });
});

router.put('/:id', async (req, res) => {
  await pool.query('UPDATE tour_categories SET ? WHERE category_id = ?', [req.body, req.params.id]);
  res.json({ message: "Updated" });
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM tour_categories WHERE category_id = ?', [req.params.id]);
  res.json({ message: "Deleted" });
});

module.exports = router;