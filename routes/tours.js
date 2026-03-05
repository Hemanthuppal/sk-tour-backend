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

// GET next tour code - UPDATED FOR ALL TOUR TYPES INCLUDING SPORTS AND FESTIVAL
router.get('/next-tour-code', async (req, res) => {
  try {
    // Get the tour_type and is_international from query parameters
    const { tour_type, is_international = '0' } = req.query;
    
    if (!tour_type) {
      return res.status(400).json({ error: 'tour_type query parameter is required' });
    }
    
    // Determine base prefix based on tour type (case-insensitive)
    const type = tour_type.toLowerCase();
    let basePrefix;
    
    switch(type) {
      case 'individual':
        basePrefix = 'I';
        break;
      case 'group':
        basePrefix = 'G';
        break;
      case 'ladies':
      case 'ladiesspecial':
        basePrefix = 'L';
        break;
      case 'senior':
      case 'seniorcitizen':
        basePrefix = 'S';
        break;
      case 'student':
        basePrefix = 'T';
        break;
      case 'honeymoon':
        basePrefix = 'H';
        break;
      // NEW: Sports tour
      case 'sports':
        basePrefix = 'P';
        break;
      // NEW: Festival tour
      case 'festival':
        basePrefix = 'F';
        break;
      default:
        return res.status(400).json({ 
          error: 'Invalid tour_type. Valid types: individual, group, ladies, senior, student, honeymoon, sports, festival' 
        });
    }
    
    // Add DOM or INTL prefix based on is_international
    const prefix = is_international === '1' ? `INT${basePrefix}` : `DOM${basePrefix}`;
    
    // Get the highest tour_code for this specific prefix
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
    
    // Format with leading zeros (5 digits total)
    const nextCode = `${prefix}${nextNumber.toString().padStart(5, '0')}`;
    
    res.json({ 
      next_tour_code: nextCode,
      tour_type: tour_type,
      prefix: prefix,
      is_international: is_international
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
    country_id,
    duration_days, 
    overview, 
    base_price_adult, 
    emi_price,
    is_international = 0,
    cost_remarks,
    hotel_remarks,
    transport_remarks,
    emi_remarks,
    booking_poi_remarks,
    cancellation_remarks,
    optional_tour_remarks, 
    status = 1
  } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO tours 
      (tour_code, title, tour_type, primary_destination_id, country_id, duration_days, overview,
       base_price_adult, emi_price, is_international, cost_remarks, hotel_remarks,
       transport_remarks, emi_remarks, booking_poi_remarks, cancellation_remarks, optional_tour_remarks, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tour_code, 
        title, 
        tour_type,
        primary_destination_id, 
        country_id,
        duration_days, 
        overview, 
        base_price_adult, 
        emi_price,
        is_international,
        cost_remarks,
        hotel_remarks,
        transport_remarks,
        emi_remarks,
        booking_poi_remarks,
        cancellation_remarks,
        optional_tour_remarks,
        status
      ]
    );

    res.status(201).json({ tour_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE
router.put('/:id', async (req, res) => {
  const tourId = req.params.id;
  const updateData = req.body;

  try {
    // Check if tour exists
    const [existingTour] = await pool.query(
      'SELECT tour_id FROM tours WHERE tour_id = ?',
      [tourId]
    );

    if (existingTour.length === 0) {
      return res.status(404).json({ message: "Tour not found" });
    }

    // List of allowed fields to update
    const allowedFields = [
      'title', 'tour_type', 'primary_destination_id', 'country_id', 'duration_days',
      'overview', 'base_price_adult','emi_price', 'is_international', 'cost_remarks',
      'hotel_remarks', 'transport_remarks', 'emi_remarks',
      'booking_poi_remarks', 'cancellation_remarks', 'optional_tour_remarks'
    ];

    // Filter and prepare update data
    const filteredData = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    // Add updated_at timestamp
    filteredData.updated_at = new Date();

    console.log('Updating tour:', tourId, 'with data:', filteredData);

    const [result] = await pool.query(
      'UPDATE tours SET ? WHERE tour_id = ?',
      [filteredData, tourId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "Failed to update tour" });
    }

    res.json({ 
      success: true,
      message: "Tour updated successfully",
      tour_id: tourId 
    });
  } catch (err) {
    console.error('Error updating tour:', err);
    res.status(500).json({ 
      success: false,
      error: err.message,
      details: err.sqlMessage || 'Database error'
    });
  }
});

router.put('/status/:tour_id', async (req, res) => {
  const { tour_id } = req.params;
  const { status } = req.body;

  try {
    await pool.query(
      `UPDATE tours SET status = ? WHERE tour_id = ?`,
      [status, tour_id]
    );

    res.json({ message: 'Status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE
router.delete('/bulk/:tour_id', async (req, res) => {
  try {
    const tourId = req.params.tour_id;
    await pool.query('DELETE FROM tours WHERE tour_id = ?', [tourId]);
    res.json({ success: true, message: 'Tour is deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== SPORTS TOUR ROUTES ====================
router.get('/tour/full/sports/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (SPORTS TOUR)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'sports'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sports tour not found' });
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

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

    // 9️⃣ TRANSPORT
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

    res.json({ 
      success: true, 
      tour_type: 'sports', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== FESTIVAL TOUR ROUTES ====================
router.get('/tour/full/festival/:tour_id', async (req, res) => {
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (FESTIVAL TOUR)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'festival'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Festival tour not found' });
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

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

    // 9️⃣ TRANSPORT
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

    res.json({ 
      success: true, 
      tour_type: 'festival', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ALL SPORTS TOURS ====================
router.get('/tour/full/all-sports', async (req, res) => {
  try {
    // Get query parameter for international filter
    const isInternational = req.query.is_international;
    
    // Build base query
    let query = `SELECT * FROM tours WHERE tour_type = 'sports'`;
    let params = [];
    
    // Add filter if provided
    if (isInternational !== undefined) {
      query += ` AND is_international = ?`;
      params.push(isInternational === 'true' ? 1 : 0);
    }

    // 1️⃣ Get Sports tours with optional filter
    const [tours] = await pool.query(query, params);

    if (tours.length === 0) {
      return res.json({
        success: true,
        tour_type: 'sports',
        is_international: isInternational,
        data: []
      });
    }

    const result = [];

    // 2️⃣ Loop through each Sports tour
    for (const tour of tours) {
      const tourId = tour.tour_id;

      const [images] = await Promise.all([
        pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId])
      ]);

      result.push({
        basic_details: tour,
        images: images[0],
      });
    }

    res.json({
      success: true,
      tour_type: 'sports',
      is_international: isInternational,
      total: result.length,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ==================== ALL FESTIVAL TOURS ====================
router.get('/tour/full/all-festival', async (req, res) => {
  try {
    // Get query parameter for international filter
    const isInternational = req.query.is_international;
    
    // Build base query
    let query = `SELECT * FROM tours WHERE tour_type = 'festival'`;
    let params = [];
    
    // Add filter if provided
    if (isInternational !== undefined) {
      query += ` AND is_international = ?`;
      params.push(isInternational === 'true' ? 1 : 0);
    }

    // 1️⃣ Get Festival tours with optional filter
    const [tours] = await pool.query(query, params);

    if (tours.length === 0) {
      return res.json({
        success: true,
        tour_type: 'festival',
        is_international: isInternational,
        data: []
      });
    }

    const result = [];

    // 2️⃣ Loop through each Festival tour
    for (const tour of tours) {
      const tourId = tour.tour_id;

      const [images] = await Promise.all([
        pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId])
      ]);

      result.push({
        basic_details: tour,
        images: images[0],
      });
    }

    res.json({
      success: true,
      tour_type: 'festival',
      is_international: isInternational,
      total: result.length,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ==================== EXISTING ROUTES (unchanged) ====================
router.get('/tour/full/individual/:tour_id', async (req, res) => {
  // ... existing code ...
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

    // 9️⃣ TRANSPORT
    const [transport] = await pool.query(`SELECT * FROM tour_transports WHERE tour_id = ?`, [tourId]);
    response.transport = transport;

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

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

    res.json({ 
      success: true, 
      tour_type: 'Individual', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tour/full/honeymoon/:tour_id', async (req, res) => {
  // ... existing code (unchanged) ...
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (ONLY HONEYMOON)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'honeymoon'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Honeymoon tour not found' });
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

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

    // 9️⃣ TRANSPORT
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

    res.json({ 
      success: true, 
      tour_type: 'honeymoon', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tour/full/group/:tour_id', async (req, res) => {
  // ... existing code (unchanged) ...
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

    // 9️⃣ TRANSPORT
    const [transport] = await pool.query(`SELECT * FROM tour_transports WHERE tour_id = ?`, [tourId]);
    response.transport = transport;

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

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

    res.json({ 
      success: true, 
      tour_type: 'Group', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tour/full/ladiesspecial/:tour_id', async (req, res) => {
  // ... existing code (unchanged) ...
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (ONLY LADIES SPECIAL)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'ladiesspecial'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ladies Special tour not found' });
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

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

    // 9️⃣ TRANSPORT
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

    res.json({ 
      success: true, 
      tour_type: 'ladiesspecial', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tour/full/seniorcitizen/:tour_id', async (req, res) => {
  // ... existing code (unchanged) ...
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (ONLY SENIOR CITIZEN)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'seniorcitizen'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Senior Citizen tour not found' });
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

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

    // 9️⃣ TRANSPORT
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

    res.json({ 
      success: true, 
      tour_type: 'seniorcitizen', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/tour/full/student/:tour_id', async (req, res) => {
  // ... existing code (unchanged) ...
  const tourId = req.params.tour_id;

  try {
    const response = {};

    // 1️⃣ BASIC DETAILS (ONLY STUDENT)
    const [tourRows] = await pool.query(`
      SELECT *
      FROM tours
      WHERE tour_id = ? AND tour_type = 'student'
    `, [tourId]);

    if (tourRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student tour not found' });
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

    // ========================
    // VISA DATA
    // ========================
    const [
      visaDetails,
      visaForms,
      visaFees,
      visaSubmission
    ] = await Promise.all([
      pool.query('SELECT * FROM tour_visa_details WHERE tour_id = ? ORDER BY type, visa_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_forms WHERE tour_id = ? ORDER BY form_id', [tourId]),
      pool.query('SELECT * FROM tour_visa_fees WHERE tour_id = ? ORDER BY row_order', [tourId]),
      pool.query('SELECT * FROM tour_visa_submission WHERE tour_id = ? ORDER BY row_order', [tourId])
    ]);

    response.visa_details = visaDetails[0];
    response.visa_forms = visaForms[0];
    response.visa_fees = visaFees[0];
    response.visa_submission = visaSubmission[0];

    // Process visa forms with file URLs
    const processedVisaForms = visaForms[0].map(form => ({
      ...form,
      action1_file_url: form.action1_file ? `/api/visa/file/${form.action1_file}` : null,
      action2_file_url: form.action2_file ? `/api/visa/file/${form.action2_file}` : null
    }));
    response.visa_forms = processedVisaForms;

    // 9️⃣ TRANSPORT
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

    res.json({ 
      success: true, 
      tour_type: 'student', 
      tour_id: tourId, 
      ...response 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ALL TOURS BY TYPE (with international filter) ====================
router.get('/tour/full/all-individual', async (req, res) => {
  // ... existing code (unchanged) ...
  try {
    // Get query parameter for international filter
    const isInternational = req.query.is_international;
    
    // Build base query
    let query = `SELECT * FROM tours WHERE tour_type = 'Individual'`;
    let params = [];
    
    // Add filter if provided
    if (isInternational !== undefined) {
      query += ` AND is_international = ?`;
      params.push(isInternational === 'true' ? 1 : 0);
    }

    // 1️⃣ Get Individual tours with optional filter
    const [tours] = await pool.query(query, params);

    if (tours.length === 0) {
      return res.json({
        success: true,
        tour_type: 'Individual',
        is_international: isInternational,
        data: []
      });
    }

    const result = [];

    // 2️⃣ Loop each tour and get full details
    for (const tour of tours) {
      const tourId = tour.tour_id;

      const [images] = await Promise.all([
        pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId]),
      ]);

      result.push({
        basic_details: tour,
        images: images[0],
      });
    }

    res.json({
      success: true,
      tour_type: 'Individual',
      is_international: isInternational,
      total: result.length,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

router.get('/tour/full/all-group', async (req, res) => {
  // ... existing code (unchanged) ...
  try {
    // Get query parameter for international filter
    const isInternational = req.query.is_international;
    
    // Build base query
    let query = `SELECT * FROM tours WHERE tour_type = 'Group'`;
    let params = [];
    
    // Add filter if provided
    if (isInternational !== undefined) {
      query += ` AND is_international = ?`;
      params.push(isInternational === 'true' ? 1 : 0);
    }

    // 1️⃣ Get Group tours with optional filter
    const [tours] = await pool.query(query, params);

    if (tours.length === 0) {
      return res.json({
        success: true,
        tour_type: 'Group',
        is_international: isInternational,
        data: []
      });
    }

    const result = [];

    // 2️⃣ Loop through each Group tour
    for (const tour of tours) {
      const tourId = tour.tour_id;

      const [images] = await Promise.all([
        pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId])
      ]);

      result.push({
        basic_details: tour,
        images: images[0],
      });
    }

    res.json({
      success: true,
      tour_type: 'Group',
      is_international: isInternational,
      total: result.length,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// Ladies Special Tours
router.get('/tour/full/all-ladies', async (req, res) => {
  try {
    // Get query parameter for international filter
    const isInternational = req.query.is_international;
    
    // Build base query
    let query = `SELECT * FROM tours WHERE tour_type = 'Ladiesspecial'`;
    let params = [];
    
    // Add filter if provided
    if (isInternational !== undefined) {
      query += ` AND is_international = ?`;
      params.push(isInternational === 'true' ? 1 : 0);
    }

    // 1️⃣ Get Ladies tours with optional filter
    const [tours] = await pool.query(query, params);

    if (tours.length === 0) {
      return res.json({
        success: true,
        tour_type: 'Ladies',
        is_international: isInternational,
        data: []
      });
    }

    const result = [];

    // 2️⃣ Loop through each Ladies tour
    for (const tour of tours) {
      const tourId = tour.tour_id;

      const [images] = await Promise.all([
        pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId])
      ]);

      result.push({
        basic_details: tour,
        images: images[0],
      });
    }

    res.json({
      success: true,
      tour_type: 'Ladies',
      is_international: isInternational,
      total: result.length,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Student Tours
router.get('/tour/full/all-student', async (req, res) => {
  try {
    // Get query parameter for international filter
    const isInternational = req.query.is_international;
    
    // Build base query
    let query = `SELECT * FROM tours WHERE tour_type = 'Student'`;
    let params = [];
    
    // Add filter if provided
    if (isInternational !== undefined) {
      query += ` AND is_international = ?`;
      params.push(isInternational === 'true' ? 1 : 0);
    }

    // 1️⃣ Get Student tours with optional filter
    const [tours] = await pool.query(query, params);

    if (tours.length === 0) {
      return res.json({
        success: true,
        tour_type: 'Student',
        is_international: isInternational,
        data: []
      });
    }

    const result = [];

    // 2️⃣ Loop through each Student tour
    for (const tour of tours) {
      const tourId = tour.tour_id;

      const [images] = await Promise.all([
        pool.query(`SELECT * FROM tour_images WHERE tour_id = ?`, [tourId])
      ]);

      result.push({
        basic_details: tour,
        images: images[0],
      });
    }

    res.json({
      success: true,
      tour_type: 'Student',
      is_international: isInternational,
      total: result.length,
      data: result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;