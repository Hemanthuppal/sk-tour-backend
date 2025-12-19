// routes/tours.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all tours
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT t.*, d.name AS primary_destination_name
      FROM tours t
      LEFT JOIN destinations d ON t.primary_destination_id = d.destination_id
      ORDER BY t.tour_id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET next tour code - MODIFIED FOR BOTH INDIVIDUAL AND GROUP TOURS

router.get('/next-tour-code', async (req, res) => {
  try {
    // Get the tour_type from query parameters
    const { tour_type } = req.query;
    
    if (!tour_type) {
      return res.status(400).json({ error: 'tour_type query parameter is required' });
    }
    
    // Determine prefix based on tour type (case-insensitive)
    let prefix;
    const type = tour_type.toLowerCase();
    
    switch(type) {
      case 'individual':
        prefix = 'DOMI';
        break;
      case 'group':
        prefix = 'DOMG';
        break;
      case 'ladies':
        prefix = 'DOML'; // Ladies tour code prefix
        break;
      case 'senior':
        prefix = 'DOMS'; // Senior tour code prefix
        break;
      case 'student':
        prefix = 'DOMT'; // Student tour code prefix (using T for STudent to avoid conflict)
        break;
      case 'honeymoon':
        prefix = 'DOMH'; // Honeymoon tour code prefix
        break;
      default:
        return res.status(400).json({ 
          error: 'Invalid tour_type. Valid types: individual, group, ladies, senior, student, honeymoon' 
        });
    }
    
    // Get the highest tour_code for this specific tour type
    const [rows] = await pool.query(`
      SELECT tour_code 
      FROM tours 
      WHERE tour_code LIKE ? 
      ORDER BY tour_code DESC 
      LIMIT 1
    `, [`${prefix}%`]);
    
    let nextNumber = 1;
    
    if (rows.length > 0 && rows[0].tour_code) {
      // Extract the numeric part and increment
      const lastCode = rows[0].tour_code;
      const lastNumber = parseInt(lastCode.replace(prefix, ''));
      nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
    }
    
    // Format with leading zeros (5 digits total for 4 zeros after prefix)
    const nextCode = `${prefix}${nextNumber.toString().padStart(5, '0')}`;
    
    res.json({ 
      next_tour_code: nextCode,
      tour_type: tour_type,
      prefix: prefix
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    tour_type,
    primary_destination_id, 
    duration_days, 
    overview, 
    base_price_adult, 
    is_international = 0,
    cost_remarks,
    hotel_remarks,
    transport_remarks,
    emi_remarks,
    booking_poi_remarks,
    cancellation_remarks,
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO tours 
        (tour_code, title, tour_type, primary_destination_id, duration_days, overview, base_price_adult, is_international, cost_remarks, hotel_remarks, transport_remarks,
        emi_remarks, booking_poi_remarks, cancellation_remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tour_code, 
        title, 
        tour_type,
        primary_destination_id, 
        duration_days, 
        overview, 
        base_price_adult, 
        is_international,
        cost_remarks,
        hotel_remarks,
        transport_remarks,
        emi_remarks,
        booking_poi_remarks,
        cancellation_remarks,
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

router.get('/tour/full/individual/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (ONLY INDIVIDUAL)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'Individual'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Individual tour not found' });
    }

    response.basic_details = tourRows[0];

    // 2️⃣ DEPARTURES
    const [departures] = await pool.query(`SELECT * FROM tour_departures WHERE tour_id = ?`, [tourId]);
    response.departures = departures;

    // 3️⃣ IMAGES
    const [images] = await pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId]);
    response.images = images;

    // 4️⃣ INCLUSIONS
    const [inclusions] = await pool.query(`SELECT * FROM tour_inclusions WHERE tour_id = ?`, [tourId]);
    response.inclusions = inclusions;

    // 5️⃣ EXCLUSIONS
    const [exclusions] = await pool.query(`SELECT * FROM tour_exclusions WHERE tour_id = ?`, [tourId]);
    response.exclusions = exclusions;

    // 6️⃣ ITINERARY
    const [itinerary] = await pool.query(`SELECT * FROM tour_itineraries WHERE tour_id = ?`, [tourId]);
    response.itinerary = itinerary;

    // 7️⃣ COSTS
    const [costs] = await pool.query(`SELECT * FROM tour_costs WHERE tour_id = ?`, [tourId]);
    response.costs = costs;

    // 8️⃣ HOTELS
    const [hotels] = await pool.query(`SELECT * FROM tour_hotels WHERE tour_id = ?`, [tourId]);
    response.hotels = hotels;

    // 9️⃣ TRANSPORT (INDIVIDUAL = description based)
    const [transport] = await pool.query(`SELECT * FROM tour_transports WHERE tour_id = ?`, [tourId]);
    response.transport = transport;

    // 🔟 BOOKING POI
    const [poi] = await pool.query(`SELECT * FROM tour_booking_poi WHERE tour_id = ?`, [tourId]);
    response.booking_poi = poi;

    // 1️⃣1️⃣ CANCELLATION
    const [cancellation] = await pool.query(`SELECT * FROM tour_cancellation_policies WHERE tour_id = ?`, [tourId]);
    response.cancellation_policies = cancellation;

    // 1️⃣2️⃣ INSTRUCTIONS
    const [instructions] = await pool.query(`SELECT * FROM tour_instructions WHERE tour_id = ?`, [tourId]);
    response.instructions = instructions;

    // 1️⃣3️⃣ OPTIONAL TOURS
    const [optionalTours] = await pool.query(`SELECT * FROM optional_tours WHERE tour_id = ?`, [tourId]);
    response.optional_tours = optionalTours;

    // 1️⃣4️⃣ EMI OPTIONS
    const [emi] = await pool.query(`SELECT * FROM emi_options WHERE tour_id = ?`, [tourId]);
    response.emi_options = emi;

    res.json({ success: true, tour_type: 'Individual', tour_id: tourId, ...response });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tour/full/group/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (ONLY GROUP)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'Group'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Group tour not found' });
    }

    response.basic_details = tourRows[0];

    // 2️⃣ DEPARTURES
    const [departures] = await pool.query(`SELECT * FROM tour_departures WHERE tour_id = ?`, [tourId]);
    response.departures = departures;

    // 3️⃣ IMAGES
    const [images] = await pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId]);
    response.images = images;

    // 4️⃣ INCLUSIONS
    const [inclusions] = await pool.query(`SELECT * FROM tour_inclusions WHERE tour_id = ?`, [tourId]);
    response.inclusions = inclusions;

    // 5️⃣ EXCLUSIONS
    const [exclusions] = await pool.query(`SELECT * FROM tour_exclusions WHERE tour_id = ?`, [tourId]);
    response.exclusions = exclusions;

    // 6️⃣ ITINERARY
    const [itinerary] = await pool.query(`SELECT * FROM tour_itineraries WHERE tour_id = ?`, [tourId]);
    response.itinerary = itinerary;

    // 7️⃣ COSTS
    const [costs] = await pool.query(`SELECT * FROM tour_costs WHERE tour_id = ?`, [tourId]);
    response.costs = costs;

    // 8️⃣ HOTELS
    const [hotels] = await pool.query(`SELECT * FROM tour_hotels WHERE tour_id = ?`, [tourId]);
    response.hotels = hotels;

    // 9️⃣ TRANSPORT (GROUP = flight based)
    const [transport] = await pool.query(`SELECT * FROM tour_transports WHERE tour_id = ?`, [tourId]);
    response.transport = transport;

    // 🔟 BOOKING POI
    const [poi] = await pool.query(`SELECT * FROM tour_booking_poi WHERE tour_id = ?`, [tourId]);
    response.booking_poi = poi;

    // 1️⃣1️⃣ CANCELLATION
    const [cancellation] = await pool.query(`SELECT * FROM tour_cancellation_policies WHERE tour_id = ?`, [tourId]);
    response.cancellation_policies = cancellation;

    // 1️⃣2️⃣ INSTRUCTIONS
    const [instructions] = await pool.query(`SELECT * FROM tour_instructions WHERE tour_id = ?`, [tourId]);
    response.instructions = instructions;

    // 1️⃣3️⃣ OPTIONAL TOURS
    const [optionalTours] = await pool.query(`SELECT * FROM optional_tours WHERE tour_id = ?`, [tourId]);
    response.optional_tours = optionalTours;

    // 1️⃣4️⃣ EMI OPTIONS
    const [emi] = await pool.query(`SELECT * FROM emi_options WHERE tour_id = ?`, [tourId]);
    response.emi_options = emi;

    res.json({ success: true, tour_type: 'Group', tour_id: tourId, ...response });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;