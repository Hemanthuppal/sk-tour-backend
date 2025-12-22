const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all optional tours for a specific tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const { tour_id } = req.params;
    const query = 'SELECT * FROM optional_tours WHERE tour_id = ? ORDER BY optional_tour_id';
    const [results] = await db.execute(query, [tour_id]);
    res.json(results);
  } catch (error) {
    console.error('Error fetching optional tours:', error);
    res.status(500).json({ error: 'Failed to fetch optional tours' });
  }
});

// GET single optional tour
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'SELECT * FROM optional_tours WHERE optional_tour_id = ?';
    const [results] = await db.execute(query, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Optional tour not found' });
    }
    
    res.json(results[0]);
  } catch (error) {
    console.error('Error fetching optional tour:', error);
    res.status(500).json({ error: 'Failed to fetch optional tour' });
  }
});

// POST create single optional tour
router.post('/', async (req, res) => {
  try {
    const { tour_id, tour_name, adult_price, child_price } = req.body;
    
    if (!tour_id || !tour_name) {
      return res.status(400).json({ error: 'Tour ID and tour name are required' });
    }
    
    const query = `
      INSERT INTO optional_tours (tour_id, tour_name, adult_price, child_price)
      VALUES (?, ?, ?, ?)
    `;
    
    const [result] = await db.execute(query, [
      tour_id,
      tour_name,
      adult_price || null,
      child_price || null
    ]);
    
    res.status(201).json({
      message: 'Optional tour created successfully',
      optional_tour_id: result.insertId
    });
  } catch (error) {
    console.error('Error creating optional tour:', error);
    res.status(500).json({ error: 'Failed to create optional tour' });
  }
});

// POST bulk create optional tours
router.post('/bulk', async (req, res) => {
  try {
    const { tour_id, optional_tours } = req.body;
    
    if (!tour_id || !Array.isArray(optional_tours)) {
      return res.status(400).json({ error: 'Tour ID and optional_tours array are required' });
    }
    
    // Validate each tour
    for (const tour of optional_tours) {
      if (!tour.tour_name) {
        return res.status(400).json({ error: 'Tour name is required for all optional tours' });
      }
    }
    
    // Prepare bulk insert
    const values = optional_tours.map(tour => [
      tour_id,
      tour.tour_name,
      tour.adult_price || null,
      tour.child_price || null
    ]);
    
    const query = `
      INSERT INTO optional_tours (tour_id, tour_name, adult_price, child_price)
      VALUES ?
    `;
    
    const [result] = await db.query(query, [values]);
    
    res.status(201).json({
      message: `${optional_tours.length} optional tours created successfully`,
      affectedRows: result.affectedRows
    });
  } catch (error) {
    console.error('Error creating bulk optional tours:', error);
    res.status(500).json({ error: 'Failed to create optional tours' });
  }
});

// PUT update optional tour
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tour_name, adult_price, child_price } = req.body;
    
    if (!tour_name) {
      return res.status(400).json({ error: 'Tour name is required' });
    }
    
    const query = `
      UPDATE optional_tours 
      SET tour_name = ?, adult_price = ?, child_price = ?, updated_at = CURRENT_TIMESTAMP
      WHERE optional_tour_id = ?
    `;
    
    const [result] = await db.execute(query, [
      tour_name,
      adult_price || null,
      child_price || null,
      id
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Optional tour not found' });
    }
    
    res.json({ message: 'Optional tour updated successfully' });
  } catch (error) {
    console.error('Error updating optional tour:', error);
    res.status(500).json({ error: 'Failed to update optional tour' });
  }
});

// DELETE optional tour
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM optional_tours WHERE optional_tour_id = ?';
    const [result] = await db.execute(query, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Optional tour not found' });
    }
    
    res.json({ message: 'Optional tour deleted successfully' });
  } catch (error) {
    console.error('Error deleting optional tour:', error);
    res.status(500).json({ error: 'Failed to delete optional tour' });
  }
});

// DELETE all optional tours for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const { tour_id } = req.params;
    const query = 'DELETE FROM optional_tours WHERE tour_id = ?';
    const [result] = await db.execute(query, [tour_id]);
    
    res.json({
      message: `${result.affectedRows} optional tours deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting optional tours:', error);
    res.status(500).json({ error: 'Failed to delete optional tours' });
  }
});

// DELETE ALL optional tours for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM optional_tours WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} optional tours` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;