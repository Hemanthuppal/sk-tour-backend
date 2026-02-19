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

    // Insert into online_flightbooking_transactions table
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

module.exports = router;