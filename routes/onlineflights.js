// routes/booking.routes.js - Properly Fixed Version

const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Save booking details when proceeding to payment
router.post('/save-booking', async (req, res) => {
  // Log the entire request body
  console.log("🔍 REQUEST BODY - FULL:");
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const {
      flight,
      bookingParams = {},
      tripType = 0,
      passengerDetails = [],
      contactDetails = {},
      bookingTokenId = null
    } = req.body;

    // Validate required fields
    if (!flight || !flight.id) {
      return res.status(400).json({
        success: false,
        message: 'Flight details are required'
      });
    }

    if (!contactDetails || !contactDetails.email || !contactDetails.phone) {
      return res.status(400).json({
        success: false,
        message: 'Contact details are required'
      });
    }

    const original_flight_id = flight.id;
    const bookingId = 'FLT' + Date.now() + Math.floor(1000 + Math.random() * 9000);

    const onward = flight || {};
    const rtn = flight.return_flight_data || {};

    const totalPassengers =
      (bookingParams.adults || 0) +
      (bookingParams.children || 0) +
      (bookingParams.infants || 0);

    // Count the columns from your table structure (excluding auto-generated timestamps)
    // Total columns: 71, but we exclude created_at and updated_at as they have defaults
    const columns = [
      'original_flight_id', 'booking_id', 'reference_id', 'booking_token_id', 'trip_type',
      'airline_name', 'flight_number', 'airline_code',
      'dep_city_code', 'dep_city_name', 'dep_airport_code', 'dep_airport_name',
      'dep_terminal', 'dep_time', 'dep_date',
      'arr_city_code', 'arr_city_name', 'arr_airport_code', 'arr_airport_name',
      'arr_terminal', 'arr_time', 'arr_date',
      'flight_duration', 'number_of_stops', 'stop_details',
      'return_airline_name', 'return_flight_number', 'return_airline_code',
      'return_dep_city_code', 'return_dep_city_name',
      'return_dep_airport_code', 'return_dep_airport_name',
      'return_dep_terminal', 'return_dep_time', 'return_dep_date',
      'return_arr_city_code', 'return_arr_city_name',
      'return_arr_airport_code', 'return_arr_airport_name',
      'return_arr_terminal', 'return_arr_time', 'return_arr_date',
      'return_flight_duration', 'return_number_of_stops', 'return_stop_details',
      'international_flight',
      'adult_count', 'child_count', 'infant_count', 'total_passengers',
      'check_in_baggage_adult', 'check_in_baggage_child', 'check_in_baggage_infant',
      'cabin_baggage_adult', 'cabin_baggage_child', 'cabin_baggage_infant',
      'total_price', 'per_adult_child_price', 'per_infant_price',
      'available_seats',
      'contact_name', 'contact_email', 'contact_phone',
      'passenger_details',
      'booking_status', 'payment_status',
      'api_response', 'static_value', 'user_ip'
    ];

    // Create placeholders string
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `
      INSERT INTO onlineflights (${columns.join(', ')})
      VALUES (${placeholders})
    `;

    // Build values array with exactly the same number as columns (69 values)
    const values = [
      // 1-5: Basic identifiers
      original_flight_id,                // 1
      bookingId,                          // 2
      null,                               // 3 - reference_id
      bookingTokenId,                     // 4 - booking_token_id
      tripType,                           // 5 - trip_type
      
      // 6-8: Airline details
      onward.airline_name || null,        // 6
      onward.flight_number || null,       // 7
      onward.airline_code || null,        // 8
      
      // 9-12: Departure city/airport
      onward.dep_city_code || null,       // 9
      onward.dep_city_name || null,       // 10
      onward.dep_airport_code || null,    // 11
      onward.dep_airport_name || null,    // 12
      
      // 13-15: Departure terminal/time/date
      onward.dep_terminal_no || null,     // 13
      onward.dep_time || null,            // 14
      bookingParams.onwardDate || null,   // 15
      
      // 16-19: Arrival city/airport
      onward.arr_city_code || null,       // 16
      onward.arr_city_name || null,       // 17
      onward.arr_airport_code || null,    // 18
      onward.arr_airport_name || null,    // 19
      
      // 20-22: Arrival terminal/time/date
      onward.arr_terminal_no || null,     // 20
      onward.arr_time || null,            // 21
      onward.arr_date || null,            // 22
      
      // 23-25: Flight details
      onward.duration || null,            // 23
      onward.no_of_stop || 0,             // 24
      JSON.stringify(onward.stop_data || []), // 25
      
      // 26-28: Return airline
      rtn.return_airline_name || null,    // 26
      rtn.return_flight_number || null,   // 27
      rtn.return_airline_code || null,    // 28
      
      // 29-32: Return departure city/airport
      rtn.return_dep_city_code || null,   // 29
      rtn.return_dep_city_name || null,   // 30
      rtn.return_dep_airport_code || null, // 31
      rtn.return_dep_airport_name || null, // 32
      
      // 33-35: Return departure terminal/time/date
      rtn.return_dep_terminal_no || null, // 33
      rtn.return_dep_time || null,        // 34
      bookingParams.returnDate || null,   // 35
      
      // 36-39: Return arrival city/airport
      rtn.return_arr_city_code || null,   // 36
      rtn.return_arr_city_name || null,   // 37
      rtn.return_arr_airport_code || null, // 38
      rtn.return_arr_airport_name || null, // 39
      
      // 40-42: Return arrival terminal/time/date
      rtn.return_arr_terminal_no || null, // 40
      rtn.return_arr_time || null,        // 41
      rtn.return_arr_date || null,        // 42
      
      // 43-45: Return flight details
      rtn.return_trip_duration || null,   // 43
      rtn.return_no_of_stop || 0,         // 44
      JSON.stringify(rtn.return_stop_data || []), // 45
      
      // 46: International flight
      onward.international_flight_staus || 0, // 46
      
      // 47-50: Passenger counts
      bookingParams.adults || 1,           // 47
      bookingParams.children || 0,         // 48
      bookingParams.infants || 0,          // 49
      totalPassengers,                      // 50
      
      // 51-53: Check-in baggage
      onward.check_in_baggage_adult || 15, // 51
      onward.check_in_baggage_children || 15, // 52
      onward.check_in_baggage_infant || 0, // 53
      
      // 54-56: Cabin baggage
      onward.cabin_baggage_adult || 7,     // 54
      onward.cabin_baggage_children || 7,  // 55
      onward.cabin_baggage_infant || 7,    // 56
      
      // 57-59: Prices
      bookingParams.totalAmount || onward.total_payable_price || 0, // 57
      onward.per_adult_child_price || 0,   // 58
      onward.per_infant_price || 0,        // 59
      
      // 60: Available seats
      onward.available_seats || 0,         // 60
      
      // 61-63: Contact details
      contactDetails.name || `${contactDetails.first_name || ''} ${contactDetails.last_name || ''}`.trim(), // 61
      contactDetails.email || null,        // 62
      contactDetails.phone || null,        // 63
      
      // 64: Passenger details JSON
      JSON.stringify(passengerDetails),    // 64
      
      // 65-66: Status
      'Pending',                           // 65 - booking_status
      'Pending',                           // 66 - payment_status
      
      // 67: API response
      null,                                // 67 - api_response
      
      // 68: Static value
      bookingParams.staticValue || onward.static || null, // 68
      
      // 69: User IP
      req.ip || null                       // 69 - user_ip
    ];

    // Verify placeholder count matches values count
    console.log(`Columns count: ${columns.length}, Values count: ${values.length}`);
    
    if (columns.length !== values.length) {
      console.error(`Column/Value count mismatch: ${columns.length} columns, ${values.length} values`);
      throw new Error(`Database query configuration error: ${columns.length} columns vs ${values.length} values`);
    }

    await db.query(sql, values);

    res.status(201).json({
      success: true,
      bookingId,
      message: 'Booking saved successfully'
    });

  } catch (err) {
    console.error('BOOKING ERROR:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to save booking'
    });
  }
});

// Update booking with reference ID after successful confirmation
router.put('/update-booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const {
      referenceId,
      bookingStatus,
      paymentStatus,
      apiResponse
    } = req.body;

    const apiResponseJson = apiResponse ? JSON.stringify(apiResponse) : null;

    const [result] = await db.query(
      `UPDATE onlineflights 
       SET reference_id = ?,
           booking_status = ?,
           payment_status = ?,
           api_response = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE booking_id = ?`,
      [referenceId, bookingStatus, paymentStatus, apiResponseJson, bookingId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Booking updated successfully'
    });

  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking',
      error: error.message
    });
  }
});

// Get booking by ID
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const [rows] = await db.query(
      'SELECT * FROM onlineflights WHERE booking_id = ?',
      [bookingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Parse JSON fields
    const booking = rows[0];
    if (booking.stop_details) booking.stop_details = JSON.parse(booking.stop_details);
    if (booking.return_stop_details) booking.return_stop_details = JSON.parse(booking.return_stop_details);
    if (booking.passenger_details) booking.passenger_details = JSON.parse(booking.passenger_details);
    if (booking.api_response) booking.api_response = JSON.parse(booking.api_response);

    res.status(200).json({
      success: true,
      data: booking
    });

  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message
    });
  }
});

// Get user's bookings
router.get('/user-bookings', async (req, res) => {
  try {
    const { email, phone } = req.query;
    
    let query = 'SELECT * FROM onlineflights WHERE 1=1';
    const params = [];

    if (email) {
      query += ' AND contact_email = ?';
      params.push(email);
    }
    
    if (phone) {
      query += ' AND contact_phone = ?';
      params.push(phone);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await db.query(query, params);

    // Parse JSON fields for each booking
    const bookings = rows.map(booking => {
      const parsedBooking = { ...booking };
      if (booking.stop_details) parsedBooking.stop_details = JSON.parse(booking.stop_details);
      if (booking.return_stop_details) parsedBooking.return_stop_details = JSON.parse(booking.return_stop_details);
      if (booking.passenger_details) parsedBooking.passenger_details = JSON.parse(booking.passenger_details);
      if (booking.api_response) parsedBooking.api_response = JSON.parse(booking.api_response);
      return parsedBooking;
    });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });

  } catch (error) {
    console.error('Error fetching user bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
});

module.exports = router;