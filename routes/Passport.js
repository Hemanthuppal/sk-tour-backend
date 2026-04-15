const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get("/passport", async (req, res) => {
  try {
    const sql = "SELECT * FROM passport_form_one ORDER BY id DESC";

    const [result] = await db.query(sql);

    res.json(result);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/passport/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const sql = "SELECT * FROM passport_form_one WHERE id = ?";

    const [result] = await db.query(sql, [id]);

    res.json(result[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post("/form", async (req, res) => {
  try {
    const sanitizedData = {};
    for (const [key, value] of Object.entries(req.body)) {
      sanitizedData[key] = value === '' ? null : value;
    }

    const [result] = await db.query("INSERT INTO passport_form_one SET ?", sanitizedData);

    res.json({ success: true, id: result.insertId });

  } catch (err) {
    console.error("DB ERROR:", err.sqlMessage || err.message);
    res.status(500).json({ success: false, message: err.sqlMessage || "Insert failed" });
  }
});
router.put("/passport/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const sql = "UPDATE passport_form_one SET ? WHERE id = ?";
    
    const [result] = await db.query(sql, [req.body, id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Record not found"
      });
    }

    res.json({
      success: true,
      message: "Passport form updated"
    });

  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message
    });
  }
});

router.delete("/passportform/:id", (req, res) => {

  const { id } = req.params;

  const sql = "DELETE FROM passport_form_one WHERE id = ?";

  db.query(sql, [id], (err, result) => {

    if (err) {
      return res.status(500).json({
        success: false,
        message: "Delete failed"
      });
    }

    res.json({
      success: true,
      message: "Passport form deleted"
    });

  });

});
// Get all bookings with optional type filter
router.get("/bookedform", async (req, res) => {
  try {
    const { type } = req.query; // Get type from query parameter

    let sql = `
      SELECT 
        b.booking_id,
        b.bungalow_code,
        b.city,
        b.contact_person,
        b.cell_no AS booking_phone,
        b.email_id AS booking_email,
        b.address,
        b.pin_code,
        b.state,
        b.country,
        b.no_of_people,
        b.no_of_adults,
        b.no_of_child,
        b.no_of_rooms,
        b.city_location,
        b.type,
        b.created_at,

        bg.guest_id,
        bg.name AS guest_name,
        bg.age,
        bg.cell_no AS guest_phone,
        bg.email_id AS guest_email,
        bg.guest_type

      FROM bungalow_bookings b
      LEFT JOIN booking_guests bg 
      ON b.booking_id = bg.booking_id
    `;

    const params = [];
    
    // Add WHERE clause if type is provided
    if (type) {
      sql += ` WHERE b.type = ?`;
      params.push(type);
    }

    sql += ` ORDER BY b.booking_id DESC`;

    const [rows] = await db.query(sql, params);

    const bookingsMap = {};

    rows.forEach(row => {
      if (!bookingsMap[row.booking_id]) {
        bookingsMap[row.booking_id] = {
          booking_id: row.booking_id,
          bungalow_code: row.bungalow_code,
          city: row.city,
          contact_person: row.contact_person,
          booking_phone: row.booking_phone,
          booking_email: row.booking_email,
          address: row.address,
          pin_code: row.pin_code,
          state: row.state,
          country: row.country,
          no_of_people: row.no_of_people,
          no_of_adults: row.no_of_adults,
          no_of_child: row.no_of_child,
          no_of_rooms: row.no_of_rooms,
          city_location: row.city_location,
          type: row.type,
          created_at: row.created_at,
          guests: []
        };
      }

      if (row.guest_id) {
        bookingsMap[row.booking_id].guests.push({
          guest_id: row.guest_id,
          name: row.guest_name,
          age: row.age,
          phone: row.guest_phone,
          email: row.guest_email,
          guest_type: row.guest_type
        });
      }
    });

    const result = Object.values(bookingsMap);
    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get single booking by ID
router.get("/bookings/:id", async (req, res) => {
  try {
    const bookingId = req.params.id;

    const sql = `
      SELECT 
        b.booking_id,
        b.bungalow_code,
        b.city,
        b.contact_person,
        b.cell_no AS booking_phone,
        b.email_id AS booking_email,
        b.address,
        b.pin_code,
        b.state,
        b.country,
        b.no_of_people,
        b.no_of_adults,
        b.no_of_child,
        b.no_of_rooms,
        b.city_location,
        b.type,
        b.created_at,

        bg.guest_id,
        bg.name AS guest_name,
        bg.age,
        bg.cell_no AS guest_phone,
        bg.email_id AS guest_email,
        bg.guest_type

      FROM bungalow_bookings b
      LEFT JOIN booking_guests bg
      ON b.booking_id = bg.booking_id
      WHERE b.booking_id = ?
      ORDER BY bg.guest_id
    `;

    const [rows] = await db.query(sql, [bookingId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = {
      booking_id: rows[0].booking_id,
      bungalow_code: rows[0].bungalow_code,
      city: rows[0].city,
      contact_person: rows[0].contact_person,
      booking_phone: rows[0].booking_phone,
      booking_email: rows[0].booking_email,
      address: rows[0].address,
      pin_code: rows[0].pin_code,
      state: rows[0].state,
      country: rows[0].country,
      no_of_people: rows[0].no_of_people,
      no_of_adults: rows[0].no_of_adults,
      no_of_child: rows[0].no_of_child,
      no_of_rooms: rows[0].no_of_rooms,
      city_location: rows[0].city_location,
      type: rows[0].type,
      created_at: rows[0].created_at,
      guests: []
    };

    rows.forEach(row => {
      if (row.guest_id) {
        booking.guests.push({
          guest_id: row.guest_id,
          name: row.guest_name,
          age: row.age,
          phone: row.guest_phone,
          email: row.guest_email,
          guest_type: row.guest_type
        });
      }
    });

    res.json(booking);

  } catch (err) {
    console.error("Error fetching booking:", err);
    res.status(500).json({ error: err.message });
  }
});
// DELETE - Delete booking
router.delete('/bookings/:id', async (req, res) => {
    try {
        console.log('Deleting booking with ID:', req.params.id);
        
        // Start transaction
        await db.query('START TRANSACTION');

        try {
            // First check if booking exists
            const [check] = await db.query(
                'SELECT booking_id FROM bungalow_bookings WHERE booking_id = ?',
                [req.params.id]
            );

            if (check.length === 0) {
                await db.query('ROLLBACK');
                return res.status(404).json({ message: "Booking not found" });
            }

            // Delete guests first (foreign key constraint)
            const [guestsResult] = await db.query(
                'DELETE FROM booking_guests WHERE booking_id = ?',
                [req.params.id]
            );
            console.log(`Deleted ${guestsResult.affectedRows} guests`);

            // Delete booking
            const [result] = await db.query(
                'DELETE FROM bungalow_bookings WHERE booking_id = ?',
                [req.params.id]
            );

            console.log(`Deleted booking: ${result.affectedRows}`);

            // Commit transaction
            await db.query('COMMIT');

            res.json({
                success: true,
                message: 'Booking deleted successfully'
            });
        } catch (err) {
            // Rollback on error
            await db.query('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting booking:', err);
        res.status(500).json({ error: err.message });
    }
});
module.exports = router;