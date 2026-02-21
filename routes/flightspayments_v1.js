// routes/flightPaymentRoutes.js - Fixed version
const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Your database connection

// Save flight transaction to online_flightbooking_transactions table
// routes/flightPaymentRoutes.js - Fixed save-transaction endpoint

// Save flight transaction to online_flightbooking_transactions table
router.post('/flight-bookings/save-transaction', async (req, res) => {
  try {
    const {
      user_id,
      order_id,
      payment_id,
      payment_amount,
      payment_method,
      payment_status,
      email
    } = req.body;

    console.log('Saving flight transaction to online_flightbooking_transactions:', {
      user_id,
      order_id,
      payment_id,
      payment_amount,
      payment_status,
      email
    });

    // Check if a transaction with this order_id already exists
    const [existing] = await db.execute(
      'SELECT id FROM online_flightbooking_transactions WHERE order_id = ?',
      [order_id]
    );

    if (existing.length > 0) {
      console.log('Transaction already exists, updating status...');
      
      // Update existing transaction
      const updateQuery = `
        UPDATE online_flightbooking_transactions 
        SET 
          payment_status = ?,
          payment_id = ?,
          payment_amount = ?,
          updated_at = NOW()
        WHERE order_id = ?
      `;
      
      await db.execute(updateQuery, [
        payment_status,
        payment_id,
        payment_amount,
        order_id
      ]);

      return res.json({
        success: true,
        message: 'Transaction updated successfully',
        transactionId: existing[0].id
      });
    }

    const query = `
      INSERT INTO online_flightbooking_transactions 
      (user_id, order_id, payment_id, payment_amount, payment_method, payment_status, email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const values = [
      user_id || null,              // user_id
      order_id || null,              // order_id
      payment_id || null,            // payment_id
      payment_amount || 0,           // payment_amount
      payment_method || 'PhonePe',   // payment_method
      payment_status || 'Pending',   // payment_status
      email || ''                    // email
    ];

    const [result] = await db.execute(query, values);

    // Also update the main booking table with transaction reference
    if (result.insertId) {
      // Get the booking_id from localStorage or reference in the request
      // You might need to pass booking_id in the request or derive it from order_id
      const bookingId = req.body.booking_id; // Add this to your request if needed
      
      if (bookingId) {
        const updateQuery = `
          UPDATE onlineflights 
          SET 
            payment_status = ?,
            booking_status = ?,
            updated_at = NOW()
          WHERE booking_id = ?
        `;
        
        await db.execute(updateQuery, [
          payment_status === 'Success' ? 'Completed' : 'Failed',
          payment_status === 'Success' ? 'Confirmed' : 'Failed',
          bookingId
        ]);
      }
    }

    res.json({
      success: true,
      message: 'Transaction saved successfully',
      transactionId: result.insertId
    });

  } catch (error) {
    console.error('Error saving flight transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save transaction',
      error: error.message
    });
  }
});

// Get flight booking by ID with transaction details
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
    
    // Then get the transaction details if any
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

// Get all flight transactions
router.get('/flight-transactions', async (req, res) => {
  try {
    const query = `
      SELECT 
        t.*,
        b.flight_number,
        b.airline_name,
        b.dep_city_code,
        b.arr_city_code,
        b.passenger_count,
        b.contact_name,
        b.contact_email,
        b.contact_phone
      FROM online_flightbooking_transactions t
      LEFT JOIN onlineflights b ON t.order_id = b.booking_token_id OR t.order_id = b.reference_id
      ORDER BY t.created_at DESC
    `;
    
    const [rows] = await db.execute(query);
    
    res.json({
      success: true,
      data: rows,
      total: rows.length
    });
  } catch (error) {
    console.error('Error fetching flight transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.message
    });
  }
});

// Get single flight transaction by ID
router.get('/flight-transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        t.*,
        b.flight_number,
        b.airline_name,
        b.dep_city_code,
        b.arr_city_code,
        b.dep_time,
        b.arr_time,
        b.passenger_details,
        b.contact_name,
        b.contact_email,
        b.contact_phone
      FROM online_flightbooking_transactions t
      LEFT JOIN onlineflights b ON t.order_id = b.booking_token_id OR t.order_id = b.reference_id
      WHERE t.id = ?
    `;
    
    const [rows] = await db.execute(query, [id]);
    
    if (rows.length > 0) {
      // Parse passenger details if needed
      if (rows[0].passenger_details) {
        try {
          rows[0].passenger_details = JSON.parse(rows[0].passenger_details);
        } catch (e) {
          // Keep as is if not JSON
        }
      }
      
      res.json({
        success: true,
        transaction: rows[0]
      });
    } else {
      res.json({
        success: false,
        message: 'Transaction not found'
      });
    }
  } catch (error) {
    console.error('Error fetching flight transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction',
      error: error.message
    });
  }
});

// Update flight transaction status
router.put('/flight-transactions/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const query = 'UPDATE online_flightbooking_transactions SET payment_status = ?, updated_at = NOW() WHERE id = ?';
    const [result] = await db.execute(query, [status, id]);
    
    if (result.affectedRows > 0) {
      res.json({
        success: true,
        message: 'Transaction status updated successfully'
      });
    } else {
      res.json({
        success: false,
        message: 'Transaction not found'
      });
    }
  } catch (error) {
    console.error('Error updating transaction status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update transaction',
      error: error.message
    });
  }
});


// Book flight using booking_token_id
router.post('/flight-bookings/book/:bookingTokenId', async (req, res) => {
  try {
    const { bookingTokenId } = req.params;
     console.log("📦 Request Body:", req.body);
    console.log("Starting booking process for token:", bookingTokenId);

    // First, check if the booking exists regardless of status
    const checkQuery = `
      SELECT booking_status FROM onlineflights 
      WHERE booking_token_id = ?
    `;
    
    const [checkRows] = await db.execute(checkQuery, [bookingTokenId]);
    
    if (checkRows.length === 0) {
      console.log("No booking found at all for token:", bookingTokenId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    const currentStatus = checkRows[0].booking_status;
    console.log("Current booking status:", currentStatus);
    
    // If booking is already confirmed, return success with existing reference
    if (currentStatus === 'confirmed') {
      // Fetch the existing confirmed booking to get reference_id
      const confirmedQuery = `
        SELECT reference_id FROM onlineflights 
        WHERE booking_token_id = ?
      `;
      const [confirmedRows] = await db.execute(confirmedQuery, [bookingTokenId]);
      
      return res.json({
        success: true,
        message: 'Booking already confirmed',
        reference_id: confirmedRows[0].reference_id,
        already_confirmed: true
      });
    }
    
    // If booking failed previously, allow retry
    if (currentStatus === 'failed') {
      console.log("Previous booking failed, allowing retry for token:", bookingTokenId);
      // Continue with booking process
    } else if (currentStatus !== 'pending') {
    }

    // Fetch booking details from onlineflights table
    const bookingQuery = `
      SELECT 
        original_flight_id AS id,
        dep_date AS onward_date,
        IFNULL(return_dep_date, '') AS return_date,
        adult_count AS adult,
        child_count AS children,
        infant_count AS infant,
        dep_city_code,
        arr_city_code,
        total_passengers AS total_book_seats,
        contact_name,
        contact_email,
        contact_phone AS contact_number,
        static_value AS static,
        booking_token_id,
        total_price AS total_amount,
        user_ip AS end_user_ip,
        passenger_details AS flight_traveller_details
      FROM onlineflights
      WHERE booking_token_id = ?
    `;
    
    const [bookingRows] = await db.execute(bookingQuery, [bookingTokenId]);
    
    if (bookingRows.length === 0) {
      console.log("No booking found for token:", bookingTokenId);
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    else {
      console.log("Full bookingRows response after excuting the query:", bookingRows);
    }
    
    console.log("Booking data found for token:", bookingTokenId);
    
    const bookingData = bookingRows[0];
      bookingData.total_amount = Number(bookingData.total_amount);

    
    console.log("First booking row data:");
console.log(JSON.stringify(bookingData, null, 2));

    // Parse passenger_details if it's a string
    if (typeof bookingData.flight_traveller_details === 'string') {
      try {
        bookingData.flight_traveller_details = JSON.parse(bookingData.flight_traveller_details);
      } catch (parseError) {
        console.error("Error parsing flight_traveller_details:", parseError);
        // If parsing fails, try to use it as is or handle accordingly
        console.log("Raw passenger_details:", bookingData.flight_traveller_details);
      }
    }

    bookingData.token = "3-1-NEWTEST-dmjkwj78BJHk8"; // This should be dynamic based on your logic
    
    console.log("Calling third-party flight booking API for token:", bookingTokenId);
    console.log("Request payload:", JSON.stringify(bookingData, null, 2));

console.log("Booking Data:", bookingData);


    // Make API call to third-party booking service
    const response = await fetch('https://devapi.flightapi.co.in/v1/fbapi/book', {
      method: 'POST',
      headers: {
        'x-api-key': '1FMQKB1639407126571',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bookingData)

    });

    const apiResponse = await response.json();
    console.log("API Response received:", JSON.stringify(apiResponse, null, 2));



 // Check if booking was successful (errorCode: 0 means success)
    if (apiResponse.errorCode === 0) {
      console.log("Booking successful for token:", bookingTokenId);
      console.log("Reference number generated:", apiResponse.data.reference_id);

      const referenceId = apiResponse.data.reference_id;
      
      // Update the booking with reference_id and status
      const updateQuery = `
        UPDATE onlineflights 
        SET reference_id = ?, 
            booking_status = 'confirmed',
            updated_at = NOW()
        WHERE booking_token_id = ?
      `;
      
      await db.execute(updateQuery, [referenceId, bookingTokenId]);

      // Check if transaction record exists and update it, otherwise insert
      // const checkTransactionQuery = `
      //   SELECT id FROM online_flightbooking_transactions 
      //   WHERE order_id = ?
      // `;
      
      // const [transactionRows] = await db.execute(checkTransactionQuery, [bookingTokenId]);
      
      // if (transactionRows.length > 0) {
      //   // Update existing transaction record
      //   const updateTransactionQuery = `
      //     UPDATE online_flightbooking_transactions 
      //     SET payment_id = ?,
      //         transaction_data = ?,
      //         payment_status = 'success',
      //         updated_at = NOW()
      //     WHERE order_id = ?
      //   `;
        
      //   await db.execute(updateTransactionQuery, [
      //     referenceId,
      //     JSON.stringify(apiResponse),
      //     bookingTokenId
      //   ]);
      // } 
      // else {
      //   window.alert (`no transction found with the given order ${bookingTokenId} `)
      // }
      // else {
      //   const insertTransactionQuery = `
      //     INSERT INTO online_flightbooking_transactions 
      //     (order_id, payment_id, transaction_data, payment_status, created_at)
      //     VALUES (?, ?, ?, 'success', NOW())
      //   `;
        
      //   await db.execute(insertTransactionQuery, [
      //     bookingTokenId,
      //     referenceId,
      //     JSON.stringify(apiResponse)
      //   ]);
      // }

      return res.json({
        success: true,
        message: 'Booking confirmed successfully',
        reference_id: referenceId,
        api_response: apiResponse
      });
    } else {
      console.log("Booking failed for token:", bookingTokenId);
      console.log("API Error:", apiResponse);

      // Handle booking failure
      const updateQuery = `
        UPDATE onlineflights 
        SET booking_status = 'failed',
            updated_at = NOW()
        WHERE booking_token_id = ?
      `;
      
      await db.execute(updateQuery, [bookingTokenId]);

      // Check if transaction record exists and update it, otherwise insert
      const checkTransactionQuery = `
        SELECT id FROM online_flightbooking_transactions 
        WHERE order_id = ?
      `;
      
      const [transactionRows] = await db.execute(checkTransactionQuery, [bookingTokenId]);
      
      if (transactionRows.length > 0) {
        // Update existing transaction record with failed status
        const updateTransactionQuery = `
          UPDATE online_flightbooking_transactions 
          SET transaction_data = ?,
              payment_status = 'failed',
              updated_at = NOW()
          WHERE order_id = ?
        `;
        
        await db.execute(updateTransactionQuery, [
          JSON.stringify(apiResponse),
          bookingTokenId
        ]);
      }

      // return res.status(400).json({
      //   success: false,
      //   message: 'Booking failed',
      //   api_response: apiResponse
      // });
    }

  } catch (error) {
    console.error('Error booking flight:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to book flight',
      error: error.message
    });
  }
});
module.exports = router;