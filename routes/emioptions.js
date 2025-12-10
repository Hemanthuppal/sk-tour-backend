const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET all EMI options for a specific tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const { tour_id } = req.params;
    const query = 'SELECT * FROM emi_options WHERE tour_id = ? ORDER BY months';
    const [results] = await db.execute(query, [tour_id]);
    res.json(results);
  } catch (error) {
    console.error('Error fetching EMI options:', error);
    res.status(500).json({ error: 'Failed to fetch EMI options' });
  }
});

// GET single EMI option
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'SELECT * FROM emi_options WHERE emi_option_id = ?';
    const [results] = await db.execute(query, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'EMI option not found' });
    }
    
    res.json(results[0]);
  } catch (error) {
    console.error('Error fetching EMI option:', error);
    res.status(500).json({ error: 'Failed to fetch EMI option' });
  }
});

// POST create single EMI option
router.post('/', async (req, res) => {
  try {
    const { tour_id, loan_amount, particulars, months, emi } = req.body;
    
    if (!tour_id || !loan_amount || !particulars || !months || emi === undefined) {
      return res.status(400).json({ 
        error: 'All fields (tour_id, loan_amount, particulars, months, emi) are required' 
      });
    }
    
    const query = `
      INSERT INTO emi_options (tour_id, loan_amount, particulars, months, emi)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.execute(query, [
      tour_id,
      loan_amount,
      particulars,
      months,
      emi
    ]);
    
    res.status(201).json({
      message: 'EMI option created successfully',
      emi_option_id: result.insertId
    });
  } catch (error) {
    console.error('Error creating EMI option:', error);
    res.status(500).json({ error: 'Failed to create EMI option' });
  }
});

// POST bulk create EMI options
router.post('/bulk', async (req, res) => {
  try {
    const { tour_id, loan_amount, emi_options } = req.body;
    
    if (!tour_id || !loan_amount || !Array.isArray(emi_options)) {
      return res.status(400).json({ 
        error: 'Tour ID, loan amount, and emi_options array are required' 
      });
    }
    
    // Validate each option
    for (const option of emi_options) {
      if (!option.particulars || !option.months || option.emi === undefined) {
        return res.status(400).json({ 
          error: 'All EMI options must have particulars, months, and emi fields' 
        });
      }
    }
    
    // Prepare bulk insert
    const values = emi_options.map(option => [
      tour_id,
      loan_amount,
      option.particulars,
      option.months,
      option.emi
    ]);
    
    const query = `
      INSERT INTO emi_options (tour_id, loan_amount, particulars, months, emi)
      VALUES ?
    `;
    
    const [result] = await db.query(query, [values]);
    
    res.status(201).json({
      message: `${emi_options.length} EMI options created successfully`,
      affectedRows: result.affectedRows
    });
  } catch (error) {
    console.error('Error creating bulk EMI options:', error);
    res.status(500).json({ error: 'Failed to create EMI options' });
  }
});

// PUT update EMI option
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { loan_amount, particulars, months, emi } = req.body;
    
    if (!loan_amount || !particulars || !months || emi === undefined) {
      return res.status(400).json({ 
        error: 'All fields (loan_amount, particulars, months, emi) are required' 
      });
    }
    
    const query = `
      UPDATE emi_options 
      SET loan_amount = ?, particulars = ?, months = ?, emi = ?, updated_at = CURRENT_TIMESTAMP
      WHERE emi_option_id = ?
    `;
    
    const [result] = await db.execute(query, [
      loan_amount,
      particulars,
      months,
      emi,
      id
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'EMI option not found' });
    }
    
    res.json({ message: 'EMI option updated successfully' });
  } catch (error) {
    console.error('Error updating EMI option:', error);
    res.status(500).json({ error: 'Failed to update EMI option' });
  }
});

// DELETE EMI option
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM emi_options WHERE emi_option_id = ?';
    const [result] = await db.execute(query, [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'EMI option not found' });
    }
    
    res.json({ message: 'EMI option deleted successfully' });
  } catch (error) {
    console.error('Error deleting EMI option:', error);
    res.status(500).json({ error: 'Failed to delete EMI option' });
  }
});

// DELETE all EMI options for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const { tour_id } = req.params;
    const query = 'DELETE FROM emi_options WHERE tour_id = ?';
    const [result] = await db.execute(query, [tour_id]);
    
    res.json({
      message: `${result.affectedRows} EMI options deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting EMI options:', error);
    res.status(500).json({ error: 'Failed to delete EMI options' });
  }
});

module.exports = router;