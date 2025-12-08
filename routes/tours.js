// routes/tours.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all tours
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, c.name AS category_name, d.name AS primary_destination_name
      FROM tours t
      LEFT JOIN tour_categories c ON t.category_id = c.category_id
      LEFT JOIN destinations d ON t.primary_destination_id = d.destination_id
      ORDER BY t.tour_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET next tour code
router.get('/next-tour-code', async (req, res) => {
  try {
    // Get the highest tour_code from the database
    const [rows] = await pool.query(`
      SELECT tour_code 
      FROM tours 
      WHERE tour_code LIKE 'DOMI%' 
      ORDER BY tour_code DESC 
      LIMIT 1
    `);
    
    let nextNumber = 1;
    
    if (rows.length > 0 && rows[0].tour_code) {
      // Extract the numeric part and increment
      const lastCode = rows[0].tour_code;
      const lastNumber = parseInt(lastCode.replace('DOMI', ''));
      nextNumber = lastNumber + 1;
    }
    
    // Format with leading zeros
    const nextCode = `DOMI${nextNumber.toString().padStart(5, '0')}`;
    
    res.json({ next_tour_code: nextCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single tour with full details
router.get('/:id', async (req, res) => {
  try {
    const [tour] = await pool.query('SELECT * FROM tours WHERE tour_id = ?', [req.params.id]);
    if (!tour.length) return res.status(404).json({ message: "Tour not found" });

    const details = await Promise.all([
      pool.query('SELECT d.* FROM destinations d JOIN tour_destinations td ON d.destination_id = td.destination_id WHERE td.tour_id = ?', [req.params.id]),
      pool.query('SELECT * FROM tour_itineraries WHERE tour_id = ? ORDER BY day', [req.params.id]),
      pool.query('SELECT item FROM tour_inclusions WHERE tour_id = ?', [req.params.id]),
      pool.query('SELECT item FROM tour_exclusions WHERE tour_id = ?', [req.params.id]),
      pool.query('SELECT * FROM tour_images WHERE tour_id = ?', [req.params.id]),
      pool.query('SELECT * FROM tour_departures WHERE tour_id = ? AND departure_date >= CURDATE() ORDER BY departure_date', [req.params.id])
    ]);

    res.json({
      tour: tour[0],
      destinations: details[0][0],
      itinerary: details[1][0],
      inclusions: details[2][0].map(i => i.item),
      exclusions: details[3][0].map(e => e.item),
      images: details[4][0],
      departures: details[5][0]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CREATE
router.post('/', async (req, res) => {
  const { 
    tour_code, 
    title, 
    category_id, 
    primary_destination_id, 
    duration_days, 
    overview, 
    base_price_adult, 
    is_international = 0,
    cost_remarks,
    hotel_remarks,
    transport_remarks
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO tours 
        (tour_code, title, category_id, primary_destination_id, duration_days, overview, base_price_adult, is_international, cost_remarks, hotel_remarks, transport_remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tour_code, 
        title, 
        category_id, 
        primary_destination_id, 
        duration_days, 
        overview, 
        base_price_adult, 
        is_international,
        cost_remarks,
        hotel_remarks,
        transport_remarks
      ]
    );

    res.status(201).json({ tour_id: result.insertId });

  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});


// UPDATE
router.put('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE tours SET ? WHERE tour_id = ?', [req.body, req.params.id]);
    res.json({ message: "Tour updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM tours WHERE tour_id = ?', [req.params.id]);
    res.json({ message: "Tour deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


router.get('/tour/full/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // -----------------------------------------------------
    // 1️⃣ BASIC DETAILS
    // -----------------------------------------------------
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ?
    `, [tourId]);
    response.basic_details = tourRows[0] || {};

    // -----------------------------------------------------
    // 2️⃣ DEPARTURES
    // -----------------------------------------------------
    const [departRows] = await pool.query(`
      SELECT *, (total_seats - booked_seats) AS available_seats
      FROM tour_departures
      WHERE tour_id = ?
      ORDER BY departure_date ASC
    `, [tourId]);
    response.departures = departRows;

    // -----------------------------------------------------
    // 3️⃣ IMAGES
    // -----------------------------------------------------
    const [imageRows] = await pool.query(`
      SELECT image_id, url, caption, is_cover
      FROM tour_images
      WHERE tour_id = ?
      ORDER BY is_cover DESC, image_id ASC
    `, [tourId]);
    response.images = imageRows;

    // -----------------------------------------------------
    // 4️⃣ INCLUSIONS
    // -----------------------------------------------------
    const [incRows] = await pool.query(`
      SELECT item
      FROM tour_inclusions
      WHERE tour_id = ?
      ORDER BY inclusion_id ASC
    `, [tourId]);
    response.inclusions = incRows.map(r => r.item);

    // -----------------------------------------------------
    // 5️⃣ EXCLUSIONS
    // -----------------------------------------------------
    const [excRows] = await pool.query(`
      SELECT item
      FROM tour_exclusions
      WHERE tour_id = ?
      ORDER BY exclusion_id ASC
    `, [tourId]);
    response.exclusions = excRows.map(r => r.item);

    // -----------------------------------------------------
    // 6️⃣ ITINERARY
    // -----------------------------------------------------
    const [itineraryRows] = await pool.query(`
      SELECT itinerary_id, day, title, description, meals
      FROM tour_itineraries
      WHERE tour_id = ?
      ORDER BY day ASC
    `, [tourId]);
    response.itinerary = itineraryRows;

    // -----------------------------------------------------
    // 7️⃣ COSTS (tour_costs)
    // -----------------------------------------------------
    const [costRows] = await pool.query(`
      SELECT cost_id, pax, standard_hotel, deluxe_hotel, executive_hotel,
             child_with_bed, child_no_bed, remarks
      FROM tour_costs
      WHERE tour_id = ?
      ORDER BY pax ASC
    `, [tourId]);

    response.costs = costRows;

    // -----------------------------------------------------
    // 8️⃣ HOTELS (tour_hotels)
    // -----------------------------------------------------
    const [hotelRows] = await pool.query(`
      SELECT hotel_id, city, hotel_name, room_type, nights, remarks
      FROM tour_hotels
      WHERE tour_id = ?
      ORDER BY hotel_id ASC
    `, [tourId]);

    response.hotels = hotelRows;

    // -----------------------------------------------------
    // 9️⃣ TRANSPORT SEGMENTS (tour_transports)
    // -----------------------------------------------------
    const [transportRows] = await pool.query(`
      SELECT transport_id, mode, from_city, to_city, carrier, number_code,
             departure_datetime, arrival_datetime, description, remarks, sort_order
      FROM tour_transports
      WHERE tour_id = ?
      ORDER BY sort_order ASC, transport_id ASC
    `, [tourId]);

    response.transport = transportRows;

    // -----------------------------------------------------
    // 🔟 BOOKING POI (tour_booking_poi)
    // -----------------------------------------------------
    const [poiRows] = await pool.query(`
      SELECT poi_id, item, sort_order
      FROM tour_booking_poi
      WHERE tour_id = ?
      ORDER BY sort_order ASC, poi_id ASC
    `, [tourId]);

    response.booking_poi = poiRows.map(p => p.item);

    // -----------------------------------------------------
    // 1️⃣1️⃣ CANCELLATION POLICIES
    // -----------------------------------------------------
    const [cancelRows] = await pool.query(`
      SELECT policy_id, days_min, days_max, charge_percentage, sort_order
      FROM tour_cancellation_policies
      WHERE tour_id = ?
      ORDER BY sort_order ASC, policy_id ASC
    `, [tourId]);

    response.cancellation_policies = cancelRows;

    // -----------------------------------------------------
    // 1️⃣2️⃣ INSTRUCTIONS (tour_instructions)
    // -----------------------------------------------------
    const [instRows] = await pool.query(`
      SELECT instruction_id, item, sort_order
      FROM tour_instructions
      WHERE tour_id = ?
      ORDER BY sort_order ASC, instruction_id ASC
    `, [tourId]);

    response.instructions = instRows.map(r => r.item);

    // -----------------------------------------------------
    // FINAL
    // -----------------------------------------------------
    res.json({
      success: true,
      tour_id: tourId,
      ...response
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



module.exports = router;