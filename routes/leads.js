const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Create new lead
router.post('/', async (req, res) => {
  try {
    const { first_name, phone, city, email, source = 'popup_form' } = req.body;
    
    // Validate required fields
    if (!first_name || !phone || !city || !email) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }
    
    // Validate phone number (basic validation)
    const phoneRegex = /^[0-9+\-\s()]{10,}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid phone number'
      });
    }
    
    // Check if lead already exists with same email and source
    const [existingLeads] = await pool.query(
      'SELECT id FROM leads WHERE email = ? AND source = ?',
      [email, source]
    );
    
    if (existingLeads.length > 0) {
      // Update existing lead
      const [result] = await pool.query(
        `UPDATE leads 
         SET first_name = ?, phone = ?, city = ?, updated_at = NOW()
         WHERE email = ? AND source = ?`,
        [first_name, phone, city, email, source]
      );
      
      const [updatedLead] = await pool.query(
        'SELECT * FROM leads WHERE email = ? AND source = ?',
        [email, source]
      );
      
      return res.status(200).json({
        success: true,
        message: 'Lead updated successfully',
        data: updatedLead[0]
      });
    }
    
    // Create new lead
    const [result] = await pool.query(
      `INSERT INTO leads (first_name, phone, city, email, source)
       VALUES (?, ?, ?, ?, ?)`,
      [first_name, phone, city, email, source]
    );
    
    const [newLead] = await pool.query(
      'SELECT * FROM leads WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Thank you! We will contact you soon.',
      data: newLead[0]
    });
    
  } catch (error) {
    console.error('Error creating lead:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted your details'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error submitting form',
      error: error.message
    });
  }
});

// Get all leads for admin
router.get('/admin', async (req, res) => {
  try {
    const { status, search, startDate, endDate, page = 1, limit = 20 } = req.query;
    
    let query = 'SELECT * FROM leads WHERE 1=1';
    const params = [];
    
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (search) {
      query += ' AND (first_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    
    if (startDate) {
      query += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }
    
    query += ' ORDER BY created_at DESC';
    
    // Count total records
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;
    
    // Add pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const [leads] = await pool.query(query, params);
    
    res.json({
      success: true,
      data: leads,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching leads',
      error: error.message
    });
  }
});

// Get lead by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [leads] = await pool.query(
      'SELECT * FROM leads WHERE id = ?',
      [id]
    );
    
    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    res.json({
      success: true,
      data: leads[0]
    });
    
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching lead',
      error: error.message
    });
  }
});

// Update lead status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const validStatuses = ['new', 'contacted', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    const updateData = { status };
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    
    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    
    Object.keys(updateData).forEach(key => {
      updateFields.push(`${key} = ?`);
      updateValues.push(updateData[key]);
    });
    
    updateValues.push(id);
    
    const query = `UPDATE leads SET ${updateFields.join(', ')} WHERE id = ?`;
    
    const [result] = await pool.query(query, updateValues);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    const [updatedLead] = await pool.query(
      'SELECT * FROM leads WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Lead status updated successfully',
      data: updatedLead[0]
    });
    
  } catch (error) {
    console.error('Error updating lead status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating lead status',
      error: error.message
    });
  }
});

// Delete lead
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query(
      'DELETE FROM leads WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting lead',
      error: error.message
    });
  }
});

// Get leads statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_leads,
        SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted_leads,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted_leads,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_leads,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today_leads,
        SUM(CASE WHEN DATE(created_at) = CURDATE() - INTERVAL 1 DAY THEN 1 ELSE 0 END) as yesterday_leads
      FROM leads
    `);
    
    const [sourceStats] = await pool.query(`
      SELECT source, COUNT(*) as count
      FROM leads
      GROUP BY source
      ORDER BY count DESC
    `);
    
    const [cityStats] = await pool.query(`
      SELECT city, COUNT(*) as count
      FROM leads
      GROUP BY city
      ORDER BY count DESC
      LIMIT 10
    `);
    
    const [recentLeads] = await pool.query(`
      SELECT * FROM leads 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    res.json({
      success: true,
      data: {
        overview: stats[0],
        sources: sourceStats,
        top_cities: cityStats,
        recent_leads: recentLeads
      }
    });
    
  } catch (error) {
    console.error('Error fetching lead stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

// Export leads to CSV
router.get('/export/csv', async (req, res) => {
  try {
    const [leads] = await pool.query(`
      SELECT 
        id,
        first_name,
        email,
        phone,
        city,
        source,
        status,
        DATE(created_at) as date,
        notes
      FROM leads 
      ORDER BY created_at DESC
    `);
    
    // Convert to CSV
    const headers = ['ID', 'Name', 'Email', 'Phone', 'City', 'Source', 'Status', 'Date', 'Notes'];
    const csvRows = [
      headers.join(','),
      ...leads.map(lead => [
        lead.id,
        `"${lead.first_name}"`,
        `"${lead.email}"`,
        `"${lead.phone}"`,
        `"${lead.city}"`,
        `"${lead.source}"`,
        `"${lead.status}"`,
        `"${lead.date}"`,
        `"${lead.notes || ''}"`
      ].join(','))
    ];
    
    const csvString = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
    res.send(csvString);
    
  } catch (error) {
    console.error('Error exporting leads:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting leads',
      error: error.message
    });
  }
});

module.exports = router;