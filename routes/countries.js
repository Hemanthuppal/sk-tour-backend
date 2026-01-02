// routes/countries.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all countries
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT country_id, name, is_domestic 
      FROM countries 
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET only international countries
router.get('/international', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT country_id, name, is_domestic 
      FROM countries 
      WHERE is_domestic = 0
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET only domestic countries (for separation)
router.get('/domestic', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT country_id, name, is_domestic 
      FROM countries 
      WHERE is_domestic = 1
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single country by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM countries WHERE country_id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Country not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new country
router.post('/add-country', async (req, res) => {
  const { name, is_domestic = 0 } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Country name is required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO countries (name, is_domestic) VALUES (?, ?)`,
      [name.trim(), is_domestic ? 1 : 0]
    );
    res.status(201).json({
      country_id: result.insertId,
      name,
      is_domestic: is_domestic ? true : false,
      message: "Country added successfully"
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Country already exists" });
    }
    res.status(500).json({ error: err.message });
  }
});

// UPDATE country
router.put('/:id', async (req, res) => {
  const { name, is_domestic } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE countries SET name = ?, is_domestic = ? WHERE country_id = ?`,
      [name?.trim(), is_domestic ? 1 : 0, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Country not found" });
    }

    res.json({ message: "Country updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE country (be careful – only if no destinations linked)
router.delete('/:id', async (req, res) => {
  try {
    // Optional: Check if country has destinations
    const [destinations] = await pool.query(`SELECT COUNT(*) AS count FROM destinations WHERE country_id = ?`, [req.params.id]);
    if (destinations[0].count > 0) {
      return res.status(400).json({ message: "Cannot delete: Country has destinations linked" });
    }

    const [result] = await pool.query(`DELETE FROM countries WHERE country_id = ?`, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Country not found" });
    }

    res.json({ message: "Country deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




module.exports = router;