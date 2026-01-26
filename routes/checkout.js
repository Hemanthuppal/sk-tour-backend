const express = require("express");
const router = express.Router();
const db = require("../config/db");

/* ================= CHECKOUT API ================= */

// Create a new checkout record
// In your checkout API (routes/checkout.js), update the create checkout endpoint:

router.post("/checkout", async (req, res) => {
    try {
        const {
            tour_id,
            tour_code,
            tour_title,
            tour_duration,
            tour_locations,
            tour_image_url,
            total_tour_cost,
            advance_percentage,
            advance_amount,
            emi_price,
            first_name,
            last_name,
            email,
            phone,
            address,
            city,
            state,
            pincode,
            country,
            payment_method,
            source_page,
            terms_accepted,
            notes
        } = req.body;

        // Validate required fields
        if (!tour_id || !total_tour_cost || !advance_amount) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: tour_id, total_tour_cost, advance_amount"
            });
        }

        // Insert checkout record
        const [result] = await db.execute(
            `INSERT INTO checkouts (
                tour_id, tour_code, tour_title, tour_duration, tour_locations,
                tour_image_url, total_tour_cost, advance_percentage, advance_amount,
                emi_price, first_name, last_name, email, phone, address, city,
                state, pincode, country, payment_method, source_page,
                terms_accepted, notes, payment_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
                tour_id, tour_code || '', tour_title || '', tour_duration || '', tour_locations || '',
                tour_image_url || '', total_tour_cost, advance_percentage || 20.00, advance_amount,
                emi_price || 0, first_name || '', last_name || '', email || '', phone || '',
                address || '', city || '', state || '', pincode || '', country || 'India',
                payment_method || 'card', source_page || 'tour-packages', terms_accepted || false,
                notes || ''
            ]
        );

        const checkoutId = result.insertId;

        // Also insert into payments table if needed
        await db.execute(
            `INSERT INTO payments (
                booking_id, amount, payment_gateway, gateway_txn_id, status
            ) VALUES (?, ?, ?, ?, ?)`,
            [
                checkoutId,
                advance_amount,
                'PhonePe',
                null, // gateway_txn_id will be updated later
                'Pending'
            ]
        );

        res.json({
            success: true,
            checkout_id: checkoutId,
            message: "Checkout record created successfully"
        });

    } catch (error) {
        console.error("Checkout API error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create checkout record",
            error: error.message
        });
    }
});

// Update the payment update endpoint:
router.put("/checkout/:id/payment", async (req, res) => {
    try {
        const checkoutId = req.params.id;
        const { phonepe_order_id, phonepe_transaction_id, payment_status } = req.body;

        if (!phonepe_order_id) {
            return res.status(400).json({
                success: false,
                message: "PhonePe order ID is required"
            });
        }

        const [result] = await db.execute(
            `UPDATE checkouts 
             SET phonepe_order_id = ?, 
                 phonepe_transaction_id = ?, 
                 payment_status = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                phonepe_order_id,
                phonepe_transaction_id || null,
                payment_status || 'processing',
                checkoutId
            ]
        );

        // Also update payments table
        if (phonepe_transaction_id) {
            await db.execute(
                `UPDATE payments 
                 SET gateway_txn_id = ?,
                     status = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE booking_id = ?`,
                [
                    phonepe_transaction_id,
                    payment_status === 'completed' ? 'Success' : 'Failed',
                    checkoutId
                ]
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Checkout record not found"
            });
        }

        res.json({
            success: true,
            message: "Payment details updated successfully"
        });

    } catch (error) {
        console.error("Update checkout payment error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update payment details",
            error: error.message
        });
    }
});

// Get checkout by ID
router.get("/checkout/:id", async (req, res) => {
    try {
        const checkoutId = req.params.id;

        const [rows] = await db.execute(
            `SELECT * FROM checkouts WHERE checkout_id = ?`,
            [checkoutId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Checkout record not found"
            });
        }

        res.json({
            success: true,
            checkout: rows[0]
        });

    } catch (error) {
        console.error("Get checkout error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch checkout record",
            error: error.message
        });
    }
});

// Update checkout with PhonePe order details
router.put("/checkout/:id/payment", async (req, res) => {
    try {
        const checkoutId = req.params.id;
        const { phonepe_order_id, phonepe_transaction_id, payment_status } = req.body;

        if (!phonepe_order_id) {
            return res.status(400).json({
                success: false,
                message: "PhonePe order ID is required"
            });
        }

        const [result] = await db.execute(
            `UPDATE checkouts 
             SET phonepe_order_id = ?, 
                 phonepe_transaction_id = ?, 
                 payment_status = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                phonepe_order_id,
                phonepe_transaction_id || null,
                payment_status || 'processing',
                checkoutId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Checkout record not found"
            });
        }

        res.json({
            success: true,
            message: "Payment details updated successfully"
        });

    } catch (error) {
        console.error("Update checkout payment error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update payment details",
            error: error.message
        });
    }
});

// Update checkout status
router.put("/checkout/:id/status", async (req, res) => {
    try {
        const checkoutId = req.params.id;
        const { payment_status } = req.body;

        if (!payment_status) {
            return res.status(400).json({
                success: false,
                message: "Payment status is required"
            });
        }

        const validStatuses = ['pending', 'processing', 'completed', 'failed'];
        if (!validStatuses.includes(payment_status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment status"
            });
        }

        const [result] = await db.execute(
            `UPDATE checkouts 
             SET payment_status = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [payment_status, checkoutId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Checkout record not found"
            });
        }

        res.json({
            success: true,
            message: "Checkout status updated successfully"
        });

    } catch (error) {
        console.error("Update checkout status error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update checkout status",
            error: error.message
        });
    }
});

// Get checkouts by tour ID
router.get("/checkout/tour/:tour_id", async (req, res) => {
    try {
        const tourId = req.params.tour_id;

        const [rows] = await db.execute(
            `SELECT * FROM checkouts 
             WHERE tour_id = ? 
             ORDER BY created_at DESC`,
            [tourId]
        );

        res.json({
            success: true,
            checkouts: rows
        });

    } catch (error) {
        console.error("Get checkouts by tour error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch checkouts",
            error: error.message
        });
    }
});

// Get all checkouts (with pagination)
router.get("/checkouts", async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const offset = (page - 1) * limit;

        let query = `SELECT * FROM checkouts`;
        let countQuery = `SELECT COUNT(*) as total FROM checkouts`;
        const params = [];
        const countParams = [];

        if (status) {
            query += ` WHERE payment_status = ?`;
            countQuery += ` WHERE payment_status = ?`;
            params.push(status);
            countParams.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        const [rows] = await db.execute(query, params);
        const [countResult] = await db.execute(countQuery, countParams);
        const total = countResult[0].total;

        res.json({
            success: true,
            checkouts: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error("Get all checkouts error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch checkouts",
            error: error.message
        });
    }
});

module.exports = router;