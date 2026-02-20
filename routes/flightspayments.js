const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Your database connection


router.get('/flight-bookings/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // First get the booking details
    const bookingQuery = 'SELECT * FROM onlineflights WHERE booking_id = ?';
    const [bookingRows] = await db.execute(bookingQuery, [bookingId]);
    
    if (bookingRows.length === 0) {
      return res.json({
        success: false,
        message: 'Booking not found'
      });
    }

    const booking = bookingRows[0];
    
    // Get the transaction details if any
    const transactionQuery = `
      SELECT * FROM online_flightbooking_transactions 
      WHERE order_id = ? OR order_id = ?
      ORDER BY created_at DESC LIMIT 1
    `;
    
    const [transactionRows] = await db.execute(transactionQuery, [
      booking.booking_token_id,
      booking.reference_id
    ]);

    // Parse JSON fields
    if (booking.stop_details) booking.stop_details = JSON.parse(booking.stop_details);
    if (booking.return_stop_details) booking.return_stop_details = JSON.parse(booking.return_stop_details);
    if (booking.passenger_details) booking.passenger_details = JSON.parse(booking.passenger_details);
    
    const result = {
      ...booking,
      transaction: transactionRows.length > 0 ? transactionRows[0] : null
    };

    res.json({
      success: true,
      booking: result
    });

  } catch (error) {
    console.error('Error fetching flight booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
      error: error.message
    });
  }
});

// // Book flight using booking_token_id
// router.post('/flight-bookings/book/:bookingTokenId', async (req, res) => {
//   try {
//     const { bookingTokenId } = req.params;
//       alert ("before excuting query")

//     // Fetch booking details from onlineflights table
//     const bookingQuery = `
//       SELECT 
//         original_flight_id AS id,
//         dep_date AS onward_date,
//         IFNULL(return_dep_date, '') AS return_date,
//         adult_count AS adult,
//         child_count AS children,
//         infant_count AS infant,
//         dep_city_code,
//         arr_city_code,
//         total_passengers AS total_book_seats,
//         contact_name,
//         contact_email,
//         contact_phone AS contact_number,
//         static_value AS static,
//         booking_token_id,
//         total_price AS total_amount,
//         user_ip AS end_user_ip,
//         JSON_EXTRACT(passenger_details, '$') AS flight_traveller_details
//       FROM onlineflights
//       WHERE booking_token_id = ? AND booking_status = 'pending'
//     `;
    
//     const [bookingRows] = await db.execute(bookingQuery, [bookingTokenId]);
    
//     if (bookingRows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: 'Booking not found or already processed'
//       });
//     }
// else{
//   alert ("booking.data found")
// }
//     const bookingData = bookingRows[0];
    
//     // Parse flight_traveller_details if it's a string
//     if (typeof bookingData.flight_traveller_details === 'string') {
//       bookingData.flight_traveller_details = JSON.parse(bookingData.flight_traveller_details);
//     }

//     // Add the token (you might need to generate this or get it from somewhere)
//     bookingData.token = "3-1-NEWTEST-dmjkwj78BJHk8"; // This should be dynamic based on your logic
//       alert ("before excuting third party flight booking api")

//     // Make API call to third-party booking service
//     const response = await fetch('https://devapi.flightapi.co.in/v1/fbapi/book', {
//       method: 'POST',
//       headers: {
//         'x-api-key': '1FMQKB1639407126571',
//         'Content-Type': 'application/json'
//       },
//       body: JSON.stringify(bookingData)
//     });

//     const apiResponse = await response.json();

//     // Check if booking was successful (errorCode: 0 means success)
//     if (apiResponse.errorCode === 0) {
//             alert ("referrence number generated and booking is successfull")

//       const referenceId = apiResponse.data.reference_id;
      
//       // Update the booking with reference_id and status
//       const updateQuery = `
//         UPDATE onlineflights 
//         SET reference_id = ?, 
//             booking_status = 'confirmed',
//             updated_at = NOW()
//         WHERE booking_token_id = ?
//       `;
      
//       await db.execute(updateQuery, [referenceId, bookingTokenId]);

//       // Insert transaction record
//       const transactionQuery = `
//         INSERT INTO online_flightbooking_transactions 
//         (order_id, reference_id, transaction_data, status, created_at)
//         VALUES (?, ?, ?, 'success', NOW())
//       `;
      
//       await db.execute(transactionQuery, [
//         bookingTokenId,
//         referenceId,
//         JSON.stringify(apiResponse)
//       ]);

//       return res.json({
//         success: true,
//         message: 'Booking confirmed successfully',
//         reference_id: referenceId,
//         api_response: apiResponse
//       });
//     } else {
//                   alert (" booking is unsuccessfull")

//       // Handle booking failure
//       const updateQuery = `
//         UPDATE onlineflights 
//         SET booking_status = 'failed',
//             updated_at = NOW()
//         WHERE booking_token_id = ?
//       `;
      
//       await db.execute(updateQuery, [bookingTokenId]);

//       // Insert failed transaction record
//       const transactionQuery = `
//         INSERT INTO online_flightbooking_transactions 
//         (order_id, transaction_data, status, created_at)
//         VALUES (?, ?, 'failed', NOW())
//       `;
      
//       await db.execute(transactionQuery, [
//         bookingTokenId,
//         JSON.stringify(apiResponse)
//       ]);

//       return res.status(400).json({
//         success: false,
//         message: 'Booking failed',
//         api_response: apiResponse
//       });
//     }

//   } catch (error) {
//     console.error('Error booking flight:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to book flight',
//       error: error.message
//     });
//   }
// });