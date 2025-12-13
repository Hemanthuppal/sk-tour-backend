// routes/tourDepartures.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Get all departures for a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *, 
      (total_seats - booked_seats) AS available_seats
      FROM tour_departures 
      WHERE tour_id = ? 
      ORDER BY 
        CASE WHEN tour_type = 'Group' THEN start_date ELSE NULL END,
        departure_date
    `, [req.params.tour_id]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching departures:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create single departure
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
      price = null,
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

    // For backward compatibility, if price is provided but adult_price is not, use price
    const finalAdultPrice = adult_price || price;

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
      tour_id, tour_type, description, departure_text,
      start_date, end_date, departure_date, return_date,
      status, finalAdultPrice, child_price, infant_price,
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
    ];

    const [result] = await conn.query(query, values);
    await conn.commit();
    
    res.status(201).json({ 
      departure_id: result.insertId,
      message: 'Departure created successfully'
    });
  } catch (err) {
    await conn.rollback();
    console.error('Error creating departure:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// BULK CREATE MULTIPLE DEPARTURES (Updated for both Individual and Group)
router.post('/bulk', async (req, res) => {
  const { tour_id, departures } = req.body;

  if (!tour_id || !Array.isArray(departures) || departures.length === 0) {
    return res.status(400).json({ message: "tour_id and departures array are required" });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const values = departures.map(dep => {
      const isIndividual = dep.tour_type === 'Individual';

      return [
        tour_id,
        dep.tour_type || 'Group',

        // description (Group only)
        isIndividual ? null : (dep.description || null),

        // departure_text (Individual only) ✅ FIX
        isIndividual ? (dep.departure_text || null) : null,

        // Dates
        dep.start_date || null,
        dep.end_date || null,
        dep.departure_date || null,
        dep.return_date || null,

        // Pricing & status
        dep.status || 'Available',
        dep.price || dep.adult_price || null,
        dep.child_price || null,
        dep.infant_price || null,

        dep.total_seats || 0,
        dep.booked_seats || 0,

        // 3 Star
        dep.tour_costs?.threeStar?.perPaxTwin || null,
        dep.tour_costs?.threeStar?.perPaxTriple || null,
        dep.tour_costs?.threeStar?.childWithBed || null,
        dep.tour_costs?.threeStar?.childWithoutBed || null,
        dep.tour_costs?.threeStar?.infant || null,
        dep.tour_costs?.threeStar?.perPaxSingle || null,

        // 4 Star
        dep.tour_costs?.fourStar?.perPaxTwin || null,
        dep.tour_costs?.fourStar?.perPaxTriple || null,
        dep.tour_costs?.fourStar?.childWithBed || null,
        dep.tour_costs?.fourStar?.childWithoutBed || null,
        dep.tour_costs?.fourStar?.infant || null,
        dep.tour_costs?.fourStar?.perPaxSingle || null,

        // 5 Star
        dep.tour_costs?.fiveStar?.perPaxTwin || null,
        dep.tour_costs?.fiveStar?.perPaxTriple || null,
        dep.tour_costs?.fiveStar?.childWithBed || null,
        dep.tour_costs?.fiveStar?.childWithoutBed || null,
        dep.tour_costs?.fiveStar?.infant || null,
        dep.tour_costs?.fiveStar?.perPaxSingle || null
      ];
    });

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
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});


// Update departure
router.put('/:id', async (req, res) => {
  try {
    const departureId = req.params.id;
    const updateData = req.body;
    
    await pool.query('UPDATE tour_departures SET ? WHERE departure_id = ?', [updateData, departureId]);
    
    res.json({ 
      message: "Departure updated successfully",
      departure_id: departureId
    });
  } catch (err) {
    console.error('Error updating departure:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete departure
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tour_departures WHERE departure_id = ?', [req.params.id]);
    res.json({ message: "Departure deleted successfully" });
  } catch (err) {
    console.error('Error deleting departure:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;