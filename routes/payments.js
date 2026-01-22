// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Your database connection

// GET all payments with checkout details
router.get('/payments', async (req, res) => {
  try {
    const query = `
      SELECT 
        c.*,
        p.payment_id,
        p.amount as payment_amount,
        p.payment_gateway,
        p.gateway_txn_id,
        p.payment_date,
        p.status as payment_status,
        p.created_at as payment_created_at,
        p.updated_at as payment_updated_at,
        p.payment_type as payment_payment_type,
        p.installment_number
      FROM checkouts c
      LEFT JOIN payments p ON c.checkout_id = p.booking_id
      ORDER BY c.created_at DESC
    `;
    
    const [results] = await db.query(query);
    
    // Group by checkout_id to handle multiple payments for same booking
    const groupedResults = results.reduce((acc, row) => {
      const checkoutId = row.checkout_id;
      if (!acc[checkoutId]) {
        acc[checkoutId] = {
          checkout_info: {
            checkout_id: row.checkout_id,
            tour_id: row.tour_id,
            tour_code: row.tour_code,
            tour_title: row.tour_title,
            tour_duration: row.tour_duration,
            tour_locations: row.tour_locations,
            tour_image_url: row.tour_image_url,
            total_tour_cost: row.total_tour_cost,
            advance_percentage: row.advance_percentage,
            advance_amount: row.advance_amount,
            emi_price: row.emi_price,
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            phone: row.phone,
            address: row.address,
            city: row.city,
            state: row.state,
            pincode: row.pincode,
            country: row.country,
            payment_method: row.payment_method,
            payment_status: row.payment_status,
            phonepe_order_id: row.phonepe_order_id,
            phonepe_transaction_id: row.phonepe_transaction_id,
            source_page: row.source_page,
            terms_accepted: row.terms_accepted,
            notes: row.notes,
            created_at: row.created_at,
            updated_at: row.updated_at,
            payment_type: row.payment_type,
            custom_payment_amount: row.custom_payment_amount,
            balance_due: row.balance_due,
            payment_schedule: row.payment_schedule
          },
          payments: []
        };
      }
      
      // Add payment if exists
      if (row.payment_id) {
        acc[checkoutId].payments.push({
          payment_id: row.payment_id,
          booking_id: row.booking_id,
          amount: row.payment_amount,
          payment_gateway: row.payment_gateway,
          gateway_txn_id: row.gateway_txn_id,
          payment_date: row.payment_date,
          status: row.payment_status,
          created_at: row.payment_created_at,
          updated_at: row.payment_updated_at,
          payment_type: row.payment_payment_type,
          installment_number: row.installment_number
        });
      }
      
      return acc;
    }, {});
    
    const finalResult = Object.values(groupedResults);
    
    res.json({
      success: true,
      data: finalResult,
      total: finalResult.length
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
});

// GET single payment by ID
router.get('/payments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        c.*,
        p.payment_id,
        p.amount as payment_amount,
        p.payment_gateway,
        p.gateway_txn_id,
        p.payment_date,
        p.status as payment_status,
        p.created_at as payment_created_at,
        p.updated_at as payment_updated_at,
        p.payment_type as payment_payment_type,
        p.installment_number
      FROM checkouts c
      LEFT JOIN payments p ON c.checkout_id = p.booking_id
      WHERE c.checkout_id = ?
      ORDER BY p.payment_date DESC
    `;
    
    const [results] = await db.query(query, [id]);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    const checkoutInfo = {
      checkout_id: results[0].checkout_id,
      tour_id: results[0].tour_id,
      tour_code: results[0].tour_code,
      tour_title: results[0].tour_title,
      tour_duration: results[0].tour_duration,
      tour_locations: results[0].tour_locations,
      tour_image_url: results[0].tour_image_url,
      total_tour_cost: results[0].total_tour_cost,
      advance_percentage: results[0].advance_percentage,
      advance_amount: results[0].advance_amount,
      emi_price: results[0].emi_price,
      first_name: results[0].first_name,
      last_name: results[0].last_name,
      email: results[0].email,
      phone: results[0].phone,
      address: results[0].address,
      city: results[0].city,
      state: results[0].state,
      pincode: results[0].pincode,
      country: results[0].country,
      payment_method: results[0].payment_method,
      payment_status: results[0].payment_status,
      phonepe_order_id: results[0].phonepe_order_id,
      phonepe_transaction_id: results[0].phonepe_transaction_id,
      source_page: results[0].source_page,
      terms_accepted: results[0].terms_accepted,
      notes: results[0].notes,
      created_at: results[0].created_at,
      updated_at: results[0].updated_at,
      payment_type: results[0].payment_type,
      custom_payment_amount: results[0].custom_payment_amount,
      balance_due: results[0].balance_due,
      payment_schedule: results[0].payment_schedule
    };
    
    const payments = results
      .filter(row => row.payment_id)
      .map(row => ({
        payment_id: row.payment_id,
        booking_id: row.booking_id,
        amount: row.payment_amount,
        payment_gateway: row.payment_gateway,
        gateway_txn_id: row.gateway_txn_id,
        payment_date: row.payment_date,
        status: row.payment_status,
        created_at: row.payment_created_at,
        updated_at: row.payment_updated_at,
        payment_type: row.payment_payment_type,
        installment_number: row.installment_number
      }));
    
    res.json({
      success: true,
      data: {
        checkout_info: checkoutInfo,
        payments: payments
      }
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message
    });
  }
});

// Update payment status
router.put('/payments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const query = 'UPDATE checkouts SET payment_status = ? WHERE checkout_id = ?';
    const [result] = await db.query(query, [status, id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Payment status updated successfully'
    });
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment status',
      error: error.message
    });
  }
});

// Get payment statistics
router.get('/payments/stats', async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_bookings,
        SUM(CASE WHEN payment_status = 'completed' THEN 1 ELSE 0 END) as completed_payments,
        SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending_payments,
        SUM(total_tour_cost) as total_revenue,
        SUM(CASE WHEN payment_status = 'completed' THEN total_tour_cost ELSE 0 END) as completed_revenue
      FROM checkouts
    `;
    
    const [stats] = await db.query(query);
    
    res.json({
      success: true,
      data: stats[0]
    });
  } catch (error) {
    console.error('Error fetching payment stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching payment statistics',
      error: error.message
    });
  }
});

// Search payments
router.get('/payments/search', async (req, res) => {
  try {
    const { query: searchQuery } = req.query;
    
    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    const sqlQuery = `
      SELECT 
        c.*,
        p.payment_id,
        p.amount as payment_amount,
        p.payment_gateway,
        p.gateway_txn_id,
        p.payment_date,
        p.status as payment_status
      FROM checkouts c
      LEFT JOIN payments p ON c.checkout_id = p.booking_id
      WHERE 
        c.first_name LIKE ? OR 
        c.last_name LIKE ? OR 
        c.email LIKE ? OR 
        c.phone LIKE ? OR 
        c.tour_code LIKE ? OR 
        c.tour_title LIKE ?
      ORDER BY c.created_at DESC
    `;
    
    const searchTerm = `%${searchQuery}%`;
    const [results] = await db.query(sqlQuery, [
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm
    ]);
    
    res.json({
      success: true,
      data: results,
      total: results.length
    });
  } catch (error) {
    console.error('Error searching payments:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching payments',
      error: error.message
    });
  }
});

module.exports = router;