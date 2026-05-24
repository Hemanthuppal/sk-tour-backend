const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = require('../config/db');

// EMI calculation function
const calculateEMI = (loanAmount, months, interestRate = 18) => {
  const principal = parseFloat(loanAmount);
  const monthlyRate = (interestRate / 100) / 12;
  const n = parseInt(months, 10);
  
  if (isNaN(principal) || principal <= 0 || isNaN(n) || n <= 0) return 0;
  
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, n) / 
              (Math.pow(1 + monthlyRate, n) - 1);
  
  return Math.round(emi * 100) / 100;
};

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
    const { tour_id, loan_amount, particulars, months, emi, emi_remarks, emi_remarks_option1, emi_remarks_option2, emi_remarks_active } = req.body;
    
    if (!tour_id || !loan_amount || !particulars || !months || emi === undefined) {
      return res.status(400).json({ 
        error: 'All fields (tour_id, loan_amount, particulars, months, emi) are required' 
      });
    }
    
    const query = `
      INSERT INTO emi_options (tour_id, loan_amount, particulars, months, emi, emi_remarks, emi_remarks_option1, emi_remarks_option2, emi_remarks_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await db.execute(query, [
      tour_id,
      loan_amount,
      particulars,
      months,
      emi,
      emi_remarks || null,
      emi_remarks_option1 || null,
      emi_remarks_option2 || null,
      emi_remarks_active || 'option1'
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


// BULK CREATE EMI options
router.post('/emi/bulk', async (req, res) => {
  const { tour_id, loan_amount, emi_options, emi_remarks, emi_remarks_option1, emi_remarks_option2, emi_remarks_active } = req.body;

  if (!tour_id) {
    return res.status(400).json({ error: 'tour_id is required' });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    // First delete existing EMI options
    await conn.query('DELETE FROM emi_options WHERE tour_id = ?', [tour_id]);

    let values = [];
    
    if (loan_amount && loan_amount > 0) {
      // Generate all EMI options with the provided loan amount
      const monthsList = [6, 12, 18, 24, 30, 36, 48];
      const rate = 18; // Default interest rate
      
      monthsList.forEach(months => {
        const principal = parseFloat(loan_amount);
        const monthlyRate = (rate / 100) / 12;
        const n = parseInt(months, 10);
        
        let emi = 0;
        if (!isNaN(principal) && principal > 0 && !isNaN(n) && n > 0) {
          emi = principal * monthlyRate * Math.pow(1 + monthlyRate, n) / 
                (Math.pow(1 + monthlyRate, n) - 1);
          emi = Math.round(emi * 100) / 100;
        }
        
        values.push([
          tour_id,
          loan_amount,
          'Per Month Payment',
          months,
          emi,
          emi_remarks || null,
          emi_remarks_option1 || null,
          emi_remarks_option2 || null,
          emi_remarks_active || 'option1'
        ]);
      });
    } else if (emi_options && Array.isArray(emi_options) && emi_options.length > 0) {
      values = emi_options.map(opt => [
        tour_id,
        opt.loan_amount,
        opt.particulars,
        opt.months,
        opt.emi,
        opt.emi_remarks || emi_remarks || null,
        opt.emi_remarks_option1 || emi_remarks_option1 || null,
        opt.emi_remarks_option2 || emi_remarks_option2 || null,
        opt.emi_remarks_active || emi_remarks_active || 'option1'
      ]);
    }

    if (values.length > 0) {
      await conn.query(
        `INSERT INTO emi_options 
         (tour_id, loan_amount, particulars, months, emi, emi_remarks, emi_remarks_option1, emi_remarks_option2, emi_remarks_active)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      message: `${values.length} EMI options saved successfully`,
      tour_id
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error saving EMI options:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});



// Calculate EMI endpoint
router.post('/calculate', (req, res) => {
  try {
    const { loan_amount, months, interest_rate = 18 } = req.body;
    
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
    const { loan_amount, particulars, months, emi, emi_remarks, emi_remarks_option1, emi_remarks_option2, emi_remarks_active } = req.body;
    
    if (!loan_amount || !particulars || !months || emi === undefined) {
      return res.status(400).json({ 
        error: 'All fields (loan_amount, particulars, months, emi) are required' 
      });
    }
    
    const query = `
      UPDATE emi_options 
      SET loan_amount = ?, particulars = ?, months = ?, emi = ?, emi_remarks = ?, emi_remarks_option1 = ?, emi_remarks_option2 = ?, emi_remarks_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE emi_option_id = ?
    `;
    
    const [result] = await pool.query(query, [
      loan_amount,
      particulars,
      months,
      emi,
      emi_remarks || null,
      emi_remarks_option1 || null,
      emi_remarks_option2 || null,
      emi_remarks_active || 'option1',
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


// DELETE single EMI option
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

// DELETE ALL EMI options for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const { tour_id } = req.params;
    const query = 'DELETE FROM emi_options WHERE tour_id = ?';
    const [result] = await db.execute(query, [tour_id]);
    
    res.json({
      success: true,
      message: `${result.affectedRows} EMI options deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting EMI options:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;