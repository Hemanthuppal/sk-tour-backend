// routes/destinations.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all destinations with country name and domestic flag
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.destination_id, d.name, d.short_desc, 
             c.name AS country_name, c.country_id, c.is_domestic
      FROM destinations d
      JOIN countries c ON d.country_id = c.country_id
      ORDER BY c.is_domestic DESC, c.name, d.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET destinations by country_id
router.get('/country/:country_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, c.name AS country_name, c.is_domestic
      FROM destinations d
      JOIN countries c ON d.country_id = c.country_id
      WHERE d.country_id = ?
      ORDER BY d.name
    `, [req.params.country_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET only domestic destinations (India)
router.get('/domestic', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, c.name AS country_name
      FROM destinations d
      JOIN countries c ON d.country_id = c.country_id
      WHERE c.is_domestic = 1
      ORDER BY d.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET only international destinations
router.get('/international', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, c.name AS country_name
      FROM destinations d
      JOIN countries c ON d.country_id = c.country_id
      WHERE c.is_domestic = 0
      ORDER BY c.name, d.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SEARCH destinations by name (partial match)
router.get('/search/:query', async (req, res) => {
  const query = `%${req.params.query}%`;
  try {
    const [rows] = await pool.query(`
      SELECT d.*, c.name AS country_name, c.is_domestic
      FROM destinations d
      JOIN countries c ON d.country_id = c.country_id
      WHERE d.name LIKE ?
      ORDER BY d.name
    `, [query]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single destination
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, c.name AS country_name, c.is_domestic
      FROM destinations d
      JOIN countries c ON d.country_id = c.country_id
      WHERE d.destination_id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: "Destination not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE new destination
router.post('/', async (req, res) => {
  const { country_id, name, short_desc } = req.body;

  if (!country_id || !name) {
    return res.status(400).json({ message: "country_id and name are required" });
  }

  try {
    // Validate country exists
    const [countryCheck] = await pool.query('SELECT 1 FROM countries WHERE country_id = ?', [country_id]);
    if (countryCheck.length === 0) {
      return res.status(400).json({ message: "Invalid country_id" });
    }

    const [result] = await pool.query(
      `INSERT INTO destinations (country_id, name, short_desc) VALUES (?, ?, ?)`,
      [country_id, name.trim(), short_desc || null]
    );

    res.status(201).json({
      destination_id: result.insertId,
      name,
      country_id,
      message: "Destination added successfully"
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: "Destination already exists in this country" });
    }
    res.status(500).json({ error: err.message });
  }
});

// UPDATE destination
router.put('/:id', async (req, res) => {
  const { country_id, name, short_desc } = req.body;

  try {
    const [result] = await pool.query(
      `UPDATE destinations SET country_id = ?, name = ?, short_desc = ? WHERE destination_id = ?`,
      [country_id || null, name?.trim(), short_desc || null, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Destination not found" });
    }

    res.json({ message: "Destination updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE destination (safe check)
router.delete('/:id', async (req, res) => {
  try {
    // Check if used in any tour
    const [usage] = await pool.query(`
      SELECT COUNT(*) AS count FROM tour_destinations WHERE destination_id = ?
    `, [req.params.id]);

    if (usage[0].count > 0) {
      return res.status(400).json({ message: "Cannot delete: Destination is used in tours" });
    }

    const [result] = await pool.query(`DELETE FROM destinations WHERE destination_id = ?`, [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Destination not found" });
    }

    res.json({ message: "Destination deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;