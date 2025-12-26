const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST - Submit contact form
router.post('/', async (req, res) => {
  const { name, email, phone, destination, travelDate, travelers, message } = req.body;

  // Validation
  if (!name || !email || !phone || !message) {
    return res.status(400).json({ 
      success: false, 
      message: 'Name, email, phone, and message are required fields.' 
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please provide a valid email address.' 
    });
  }

  // Phone validation (basic)
  if (phone.length < 10) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please provide a valid phone number.' 
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO contact_submissions 
       (name, email, phone, destination, travel_date, travelers, message) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.trim(),
        phone.trim(),
        destination || null,
        travelDate || null,
        travelers || null,
        message.trim()
      ]
    );

    console.log(`New contact submission from: ${email} (ID: ${result.insertId})`);

    res.status(201).json({
      success: true,
      message: 'Your inquiry has been submitted successfully!',
      submissionId: result.insertId,
      data: {
        name,
        email,
        submittedAt: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('Contact submission error:', err);
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A similar submission already exists.'
      });
    }

    // Check for database connection error
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED') {
      console.error('Database connection error. Please check your XAMPP MySQL service.');
      return res.status(503).json({
        success: false,
        message: 'Database connection failed. Please try again later.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit your inquiry. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET - Retrieve all contact submissions (for admin)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, email, phone, destination, 
             DATE_FORMAT(travel_date, '%Y-%m-%d') as travel_date,
             travelers, 
             SUBSTRING(message, 1, 100) as message_preview,
             DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i:%s') as submitted_at,
             status
      FROM contact_submissions
      ORDER BY submitted_at DESC
    `);
    
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (err) {
    console.error('Error fetching contact submissions:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submissions',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET single submission by ID
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *, DATE_FORMAT(travel_date, '%Y-%m-%d') as formatted_travel_date
      FROM contact_submissions 
      WHERE id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (err) {
    console.error('Error fetching submission:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// PUT - Update submission status
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  
  if (!['new', 'contacted', 'resolved'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Use: new, contacted, or resolved'
    });
  }

  try {
    const [result] = await pool.query(
      'UPDATE contact_submissions SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    res.json({
      success: true,
      message: 'Status updated successfully'
    });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;