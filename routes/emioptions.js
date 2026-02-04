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

// Add this calculation function at the top of the file
const calculateEMI = (loanAmount, months, interestRate = 10) => {
  // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
  // Where P = principal, r = monthly interest rate, n = number of months
  const principal = parseFloat(loanAmount);
  const monthlyRate = (interestRate / 100) / 12;
  const n = parseInt(months, 10);
  
  if (principal <= 0 || n <= 0) return 0;
  
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, n) / 
              (Math.pow(1 + monthlyRate, n) - 1);
  
  return Math.round(emi * 100) / 100; // Round to 2 decimal places
};

// Update the bulk create route to calculate EMI automatically
router.post('/emi/bulk', async (req, res) => {
  try {
    const { tour_id, emi_options, loan_amount: fixedLoanAmount } = req.body;
    
    console.log('=== EMI BULK INSERT REQUEST ===');
    console.log('Tour ID:', tour_id);
    console.log('Fixed Loan Amount:', fixedLoanAmount);
    console.log('EMI Options:', JSON.stringify(emi_options, null, 2));
    console.log('============================');
    
    if (!tour_id) {
      console.error('Missing tour_id');
      return res.status(400).json({ 
        error: 'Tour ID is required' 
      });
    }
    
    if (!fixedLoanAmount && (!Array.isArray(emi_options) || emi_options.length === 0)) {
      console.error('Missing loan amount and no EMI options provided');
      return res.status(400).json({ 
        error: 'Loan amount is required' 
      });
    }
    
    let optionsToInsert = [];
    
    // If fixed loan amount is provided, generate EMI options
    if (fixedLoanAmount) {
      const loanAmount = parseFloat(fixedLoanAmount);
      if (isNaN(loanAmount) || loanAmount <= 0) {
        return res.status(400).json({ 
          error: 'Valid loan amount is required' 
        });
      }
      
      // Generate EMI options for standard months
      const standardMonths = [6, 12, 18, 24, 30, 36, 48];
      optionsToInsert = standardMonths.map(months => ({
        particulars: 'Per Month Payment',
        months: months,
        loan_amount: loanAmount,
        emi: calculateEMI(loanAmount, months)
      }));
    } else if (Array.isArray(emi_options) && emi_options.length > 0) {
      // Use provided options (for backward compatibility)
      optionsToInsert = emi_options;
    } else {
      return res.status(400).json({ 
        error: 'Either loan amount or emi_options array is required' 
      });
    }
    
    console.log('Options to insert:', JSON.stringify(optionsToInsert, null, 2));
    
    // Validate each option
    for (let i = 0; i < optionsToInsert.length; i++) {
      const option = optionsToInsert[i];
      
      if (!option.particulars) {
        return res.status(400).json({ 
          error: `Option ${i + 1} missing particulars field` 
        });
      }
      
      if (!option.months) {
        return res.status(400).json({ 
          error: `Option ${i + 1} missing months field` 
        });
      }
      
      if (option.loan_amount === undefined || option.loan_amount === null) {
        return res.status(400).json({ 
          error: `Option ${i + 1} missing loan_amount field` 
        });
      }
      
      // Auto-calculate EMI if not provided
      if (option.emi === undefined || option.emi === null) {
        option.emi = calculateEMI(option.loan_amount, option.months);
      }
    }
    
    // Prepare bulk insert
    const values = optionsToInsert.map(option => [
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
    
    const [result] = await db.query(query, [values]);
    
    res.status(201).json({
      message: `${optionsToInsert.length} EMI options created successfully`,
      affectedRows: result.affectedRows,
      insertId: result.insertId
    });
  } catch (error) {
    console.error('=== Error creating bulk EMI options ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({ 
      error: 'Failed to create EMI options',
      details: error.message 
    });
  }
});

// Add a new route for calculating EMI
router.post('/calculate', (req, res) => {
  try {
    const { loan_amount, months, interest_rate = 10 } = req.body;
    
    if (!loan_amount || !months) {
      return res.status(400).json({ 
        error: 'Loan amount and months are required' 
      });
    }
    
    const emi = calculateEMI(loan_amount, months, interest_rate);
    
    res.json({
      loan_amount: parseFloat(loan_amount),
      months: parseInt(months, 10),
      interest_rate: parseFloat(interest_rate),
      emi: emi
    });
  } catch (error) {
    console.error('Error calculating EMI:', error);
    res.status(500).json({ error: 'Failed to calculate EMI' });
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