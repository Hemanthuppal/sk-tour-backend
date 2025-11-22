// Template for: customers.js, inquiries.js, reviews.js, promotions.js, etc.
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const table = 'customers'; // change per file

router.get('/', async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM ${table}`);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM ${table} WHERE ${table.replace('s','')}_id = ?`, [req.params.id]);
  rows.length ? res.json(rows[0]) : res.status(404).json({ message: "Not found" });
});

router.post('/', async (req, res) => {
  await pool.query(`INSERT INTO ${table} SET ?`, req.body);
  res.status(201).json({ message: "Created" });
});

router.put('/:id', async (req, res) => {
  await pool.query(`UPDATE ${table} SET ? WHERE ${table.replace('s','')}_id = ?`, [req.body, req.params.id]);
  res.json({ message: "Updated" });
});

router.delete('/:id', async (req, res) => {
  await pool.query(`DELETE FROM ${table} WHERE ${table.replace('s','')}_id = ?`, [req.params.id]);
  res.json({ message: "Deleted" });
});

module.exports = router;