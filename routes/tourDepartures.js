const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all departures for a tour - FIXED for both Individual and Group
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *, 
      (total_seats - booked_seats) AS available_seats
      FROM tour_departures 
      WHERE tour_id = ? 
      ORDER BY 
        CASE 
          WHEN tour_type = 'Group' THEN start_date 
          ELSE departure_date 
        END
    `, [req.params.tour_id]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching departures:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE single departure - UPDATED with proper handling
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const {
      tour_id,
      tour_type = 'Group',
      description = null,
      departure_text = null,
      start_date = null,
      end_date = null,
      departure_date = null,
      return_date = null,
      status = 'Available',
      adult_price = null,
      child_price = null,
      infant_price = null,
      total_seats = 40,
      booked_seats = 0,
      // 3 Star prices
      three_star_twin = null,
      three_star_triple = null,
      three_star_child_with_bed = null,
      three_star_child_without_bed = null,
      three_star_infant = null,
      three_star_single = null,
      // 4 Star prices
      four_star_twin = null,
      four_star_triple = null,
      four_star_child_with_bed = null,
      four_star_child_without_bed = null,
      four_star_infant = null,
      four_star_single = null,
      // 5 Star prices
      five_star_twin = null,
      five_star_triple = null,
      five_star_child_with_bed = null,
      five_star_child_without_bed = null,
      five_star_infant = null,
      five_star_single = null
    } = req.body;

    // Validate required fields
    if (!tour_id || !tour_type) {
      return res.status(400).json({ 
        error: 'tour_id and tour_type are required' 
      });
    }

    // For Group tours, validate start_date
    if (tour_type === 'Group' && !start_date) {
      return res.status(400).json({ 
        error: 'start_date is required for Group tours' 
      });
    }

    // For Individual tours, validate departure_text
    if (tour_type === 'Individual' && !departure_text) {
      return res.status(400).json({ 
        error: 'departure_text is required for Individual tours' 
      });
    }

    const query = `
      INSERT INTO tour_departures (
        tour_id, tour_type, description, departure_text,
        start_date, end_date, departure_date, return_date,
        status, adult_price, child_price, infant_price,
        total_seats, booked_seats,
        three_star_twin, three_star_triple, 
        three_star_child_with_bed, three_star_child_without_bed,
        three_star_infant, three_star_single,
        four_star_twin, four_star_triple,
        four_star_child_with_bed, four_star_child_without_bed,
        four_star_infant, four_star_single,
        five_star_twin, five_star_triple,
        five_star_child_with_bed, five_star_child_without_bed,
        five_star_infant, five_star_single
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      tour_id, 
      tour_type, 
      description, 
      departure_text,
      start_date, 
      end_date, 
      departure_date, 
      return_date,
      status, 
      adult_price, 
      child_price, 
      infant_price,
      total_seats, 
      booked_seats,
      three_star_twin, 
      three_star_triple,
      three_star_child_with_bed, 
      three_star_child_without_bed,
      three_star_infant, 
      three_star_single,
      four_star_twin, 
      four_star_triple,
      four_star_child_with_bed, 
      four_star_child_without_bed,
      four_star_infant, 
      four_star_single,
      five_star_twin, 
      five_star_triple,
      five_star_child_with_bed, 
      five_star_child_without_bed,
      five_star_infant, 
      five_star_single
    ];

    console.log('Creating departure:', { tour_id, tour_type, start_date, departure_text });

    const [result] = await conn.query(query, values);
    await conn.commit();
    
    res.status(201).json({ 
      departure_id: result.insertId,
      message: 'Departure created successfully'
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error creating departure:', err);
    res.status(500).json({ 
      error: err.message,
      sqlMessage: err.sqlMessage 
    });
  } finally {
    conn.release();
  }
});

// BULK CREATE MULTIPLE DEPARTURES - FIXED
router.post('/bulk', async (req, res) => {
  const { tour_id, departures } = req.body;

  if (!tour_id || !Array.isArray(departures) || departures.length === 0) {
    return res.status(400).json({ 
      message: "tour_id and departures array are required" 
    });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const values = departures.map(dep => {
      const isIndividual = dep.tour_type === 'Individual';
      
      // For Group tours, use start_date as departure_date if not provided
      const effectiveDepartureDate = isIndividual 
        ? dep.departure_date 
        : (dep.departure_date || dep.start_date);
      
      // For Group tours, use end_date as return_date if not provided
      const effectiveReturnDate = isIndividual 
        ? dep.return_date 
        : (dep.return_date || dep.end_date);

      return [
        tour_id,
        dep.tour_type || 'Group',

        // Description (Group only) - Fixed
        isIndividual ? null : (dep.description || null),

        // departure_text (Individual only) - Fixed
        isIndividual ? (dep.departure_text || null) : null,

        // Dates
        dep.start_date || null,
        dep.end_date || null,
        effectiveDepartureDate,
        effectiveReturnDate,

        // Pricing & status
        dep.status || 'Available',
        dep.adult_price || null,
        dep.child_price || null,
        dep.infant_price || null,

        // Seats - default to 40 for Group, 0 for Individual
        dep.total_seats || (isIndividual ? 0 : 40),
        dep.booked_seats || 0,

        // 3 Star prices
        dep.three_star_twin || null,
        dep.three_star_triple || null,
        dep.three_star_child_with_bed || null,
        dep.three_star_child_without_bed || null,
        dep.three_star_infant || null,
        dep.three_star_single || null,

        // 4 Star prices
        dep.four_star_twin || null,
        dep.four_star_triple || null,
        dep.four_star_child_with_bed || null,
        dep.four_star_child_without_bed || null,
        dep.four_star_infant || null,
        dep.four_star_single || null,

        // 5 Star prices
        dep.five_star_twin || null,
        dep.five_star_triple || null,
        dep.five_star_child_with_bed || null,
        dep.five_star_child_without_bed || null,
        dep.five_star_infant || null,
        dep.five_star_single || null
      ];
    });

    console.log('Bulk inserting departures:', values.length);

    const query = `
      INSERT INTO tour_departures (
        tour_id, tour_type, description, departure_text,
        start_date, end_date, departure_date, return_date,
        status, adult_price, child_price, infant_price,
        total_seats, booked_seats,
        three_star_twin, three_star_triple, 
        three_star_child_with_bed, three_star_child_without_bed,
        three_star_infant, three_star_single,
        four_star_twin, four_star_triple,
        four_star_child_with_bed, four_star_child_without_bed,
        four_star_infant, four_star_single,
        five_star_twin, five_star_triple,
        five_star_child_with_bed, five_star_child_without_bed,
        five_star_infant, five_star_single
      ) VALUES ?
    `;

    await conn.query(query, [values]);
    await conn.commit();

    res.status(201).json({
      message: `${departures.length} departures added successfully`,
      tour_id
    });

  } catch (err) {
    await conn.rollback();
    console.error("❌ Bulk departures insert error:", err);
    res.status(500).json({ 
      error: err.message,
      sqlMessage: err.sqlMessage 
    });
  } finally {
    conn.release();
  }
});

// UPDATE departure - ENHANCED with validation
router.put('/:id', async (req, res) => {
  try {
    const departureId = req.params.id;
    const updateData = req.body;
    
    // Check if departure exists
    const [existing] = await pool.query(
      'SELECT * FROM tour_departures WHERE departure_id = ?',
      [departureId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Departure not found" });
    }
    
    // Add updated_at timestamp
    updateData.updated_at = new Date();
    
    // Validate Group tour requirements
    if (updateData.tour_type === 'Group' && !updateData.start_date) {
      return res.status(400).json({ 
        error: 'start_date is required for Group tours' 
      });
    }
    
    // Validate Individual tour requirements
    if (updateData.tour_type === 'Individual' && !updateData.departure_text) {
      return res.status(400).json({ 
        error: 'departure_text is required for Individual tours' 
      });
    }
    
    const [result] = await pool.query(
      'UPDATE tour_departures SET ? WHERE departure_id = ?', 
      [updateData, departureId]
    );
    
    res.json({ 
      message: "Departure updated successfully",
      departure_id: departureId
    });
  } catch (err) {
    console.error('Error updating departure:', err);
    res.status(500).json({ 
      error: err.message,
      sqlMessage: err.sqlMessage 
    });
  }
});

// DELETE departure
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tour_departures WHERE departure_id = ?', 
      [req.params.id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Departure not found" });
    }
    
    res.json({ 
      message: "Departure deleted successfully" 
    });
  } catch (err) {
    console.error('Error deleting departure:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE all departures for a tour
router.delete('/bulk/:tour_id', async (req, res) => {
  try {
    const tourId = req.params.tour_id;
    const [result] = await pool.query(
      'DELETE FROM tour_departures WHERE tour_id = ?', 
      [tourId]
    );
    
    res.json({ 
      success: true, 
      message: `${result.affectedRows} departures deleted successfully` 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

module.exports = router;