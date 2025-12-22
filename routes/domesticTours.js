const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all domestic tours (with optional filter by tour_type)
router.get('/', async (req, res) => {
  try {
    const { tour_type } = req.query;
    
    let query = 'SELECT * FROM domestic_tours WHERE is_active = TRUE';
    const params = [];
    
    if (tour_type) {
      query += ' AND tour_type = ?';
      params.push(tour_type);
    }
    
    query += ' ORDER BY display_order ASC, created_at DESC';
    
    console.log('Executing query:', query);
    console.log('With params:', params);
    
    const [tours] = await pool.query(query, params);
    
    console.log(`Found ${tours.length} tours`);
    
    res.json({
      success: true,
      count: tours.length,
      data: tours
    });
  } catch (error) {
    console.error('Error fetching domestic tours:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching domestic tours',
      error: error.message
    });
  }
});

// Get all tours for admin (including inactive)
router.get('/admin', async (req, res) => {
  try {
    const [tours] = await pool.query(`
      SELECT * FROM domestic_tours 
      ORDER BY tour_type, display_order, created_at DESC
    `);
    
    res.json({
      success: true,
      count: tours.length,
      data: tours
    });
  } catch (error) {
    console.error('Error fetching all domestic tours:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching domestic tours',
      error: error.message
    });
  }
});

// Get single tour by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [tours] = await pool.query(
      'SELECT * FROM domestic_tours WHERE id = ?',
      [id]
    );
    
    if (tours.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tour not found'
      });
    }
    
    res.json({
      success: true,
      data: tours[0]
    });
  } catch (error) {
    console.error('Error fetching tour:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tour',
      error: error.message
    });
  }
});

// Create new domestic tour
router.post('/', async (req, res) => {
  try {
    const {
      name,
      location,
      duration,
      price,
      image,
      travelers,
      tour_id,
      emi,
      tour_type = 'individual',
      is_active = true,
      display_order = 0
    } = req.body;
    
    // Validate required fields
    if (!name || !location || !duration || !price || !image || !tour_id) {
      return res.status(400).json({
        success: false,
        message: 'Name, location, duration, price, image, and tour_id are required'
      });
    }
    
    const [result] = await pool.query(
      `INSERT INTO domestic_tours 
       (name, location, duration, price, image, travelers, tour_id, emi, tour_type, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, location, duration, price, image, travelers || 0, tour_id, emi, tour_type, is_active, display_order || 0]
    );
    
    const [newTour] = await pool.query(
      'SELECT * FROM domestic_tours WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Tour created successfully',
      data: newTour[0]
    });
  } catch (error) {
    console.error('Error creating tour:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Tour ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating tour',
      error: error.message
    });
  }
});

// Update domestic tour
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if tour exists
    const [existing] = await pool.query(
      'SELECT * FROM domestic_tours WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tour not found'
      });
    }
    
    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    
    const allowedFields = [
      'name', 'location', 'duration', 'price', 'image', 
      'travelers', 'tour_id', 'emi', 'tour_type', 
      'is_active', 'display_order'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateFields.push(`${field} = ?`);
        updateValues.push(updates[field]);
      }
    });
    
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    updateValues.push(id);
    
    const query = `UPDATE domestic_tours SET ${updateFields.join(', ')} WHERE id = ?`;
    
    await pool.query(query, updateValues);
    
    const [updatedTour] = await pool.query(
      'SELECT * FROM domestic_tours WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Tour updated successfully',
      data: updatedTour[0]
    });
  } catch (error) {
    console.error('Error updating tour:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Tour ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating tour',
      error: error.message
    });
  }
});

// Delete domestic tour
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [result] = await pool.query(
      'DELETE FROM domestic_tours WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tour not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Tour deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tour:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting tour',
      error: error.message
    });
  }
});

// Toggle tour status (active/inactive)
router.patch('/:id/toggle-status', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [tour] = await pool.query(
      'SELECT is_active FROM domestic_tours WHERE id = ?',
      [id]
    );
    
    if (tour.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tour not found'
      });
    }
    
    const newStatus = !tour[0].is_active;
    
    await pool.query(
      'UPDATE domestic_tours SET is_active = ? WHERE id = ?',
      [newStatus, id]
    );
    
    res.json({
      success: true,
      message: `Tour ${newStatus ? 'activated' : 'deactivated'} successfully`,
      data: { is_active: newStatus }
    });
  } catch (error) {
    console.error('Error toggling tour status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling tour status',
      error: error.message
    });
  }
});

// Update display order (bulk update)
router.put('/reorder/display-order', async (req, res) => {
  try {
    const { tours } = req.body;
    
    if (!Array.isArray(tours)) {
      return res.status(400).json({
        success: false,
        message: 'Tours array is required'
      });
    }
    
    // Use transaction for bulk update
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      for (const tour of tours) {
        await connection.query(
          'UPDATE domestic_tours SET display_order = ? WHERE id = ?',
          [tour.display_order, tour.id]
        );
      }
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Display order updated successfully'
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating display order:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating display order',
      error: error.message
    });
  }
});

// Get statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_tours,
        SUM(CASE WHEN tour_type = 'individual' THEN 1 ELSE 0 END) as individual_tours,
        SUM(CASE WHEN tour_type = 'group' THEN 1 ELSE 0 END) as group_tours,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_tours,
        SUM(travelers) as total_travelers
      FROM domestic_tours
    `);
    
    const [popularLocations] = await pool.query(`
      SELECT location, COUNT(*) as tour_count
      FROM domestic_tours
      WHERE is_active = TRUE
      GROUP BY location
      ORDER BY tour_count DESC
      LIMIT 5
    `);
    
    res.json({
      success: true,
      data: {
        overview: stats[0],
        popular_locations: popularLocations
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

module.exports = router;