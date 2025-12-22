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
// POST bulk create EMI options (with individual loan amounts)
router.post('/emi/bulk', async (req, res) => {
  try {
    const { tour_id, emi_options } = req.body;
    
    console.log('=== EMI BULK INSERT REQUEST ===');
    console.log('Tour ID:', tour_id);
    console.log('EMI Options:', JSON.stringify(emi_options, null, 2));
    console.log('EMI Options type:', typeof emi_options);
    console.log('Is Array:', Array.isArray(emi_options));
    console.log('============================');
    
    if (!tour_id) {
      console.error('Missing tour_id');
      return res.status(400).json({ 
        error: 'Tour ID is required' 
      });
    }
    
    if (!Array.isArray(emi_options)) {
      console.error('emi_options is not an array:', emi_options);
      return res.status(400).json({ 
        error: 'emi_options must be an array' 
      });
    }
    
    if (emi_options.length === 0) {
      console.log('Empty emi_options array, skipping insert');
      return res.status(200).json({
        message: 'No EMI options to insert',
        affectedRows: 0
      });
    }
    
    // Validate each option with more detailed logging
    for (let i = 0; i < emi_options.length; i++) {
      const option = emi_options[i];
      console.log(`Validating option ${i + 1}:`, option);
      
      if (!option.particulars) {
        console.error(`Missing particulars for option ${i + 1}`);
        return res.status(400).json({ 
          error: `Option ${i + 1} missing particulars field` 
        });
      }
      
      if (!option.months) {
        console.error(`Missing months for option ${i + 1}`);
        return res.status(400).json({ 
          error: `Option ${i + 1} missing months field` 
        });
      }
      
      if (option.loan_amount === undefined || option.loan_amount === null) {
        console.error(`Missing loan_amount for option ${i + 1}`);
        return res.status(400).json({ 
          error: `Option ${i + 1} missing loan_amount field` 
        });
      }
      
      if (option.emi === undefined || option.emi === null) {
        console.error(`Missing emi for option ${i + 1}`);
        return res.status(400).json({ 
          error: `Option ${i + 1} missing emi field` 
        });
      }
    }
    
    // Prepare bulk insert with type conversion
    const values = emi_options.map(option => [
      tour_id,
      parseFloat(option.loan_amount),
      option.particulars,
      parseInt(option.months, 10),
      parseFloat(option.emi)
    ]);
    
    console.log('Prepared values for insertion:', values);
    
    const query = `
      INSERT INTO emi_options (tour_id, loan_amount, particulars, months, emi)
      VALUES ?
    `;
    
    console.log('Executing query:', query);
    console.log('With values array:', [values]);
    
    const [result] = await db.query(query, [values]);
    
    console.log('MySQL Result:', result);
    
    res.status(201).json({
      message: `${emi_options.length} EMI options created successfully`,
      affectedRows: result.affectedRows,
      insertId: result.insertId
    });
  } catch (error) {
    console.error('=== Error creating bulk EMI options ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('=============================');
    
    // Check for MySQL specific errors
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ 
        error: 'Database table not found. Please check if emi_options table exists.' 
      });
    }
    
    if (error.code === 'ER_PARSE_ERROR') {
      return res.status(500).json({ 
        error: 'SQL Syntax Error', 
        details: error.sqlMessage 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create EMI options',
      details: error.message 
    });
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

// DELETE ALL EMI options for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM emi_options WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} EMI options` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;