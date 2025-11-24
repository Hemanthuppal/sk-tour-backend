// routes/cruise/advancedCruiseBooking.js
const express = require("express");
const db = require("../../config/db");
const router = express.Router();

// POST API for advanced cruise booking
router.post("/cruise-booking-advanced", async (req, res) => {
  try {
    const {
      name,
      cellNo,
      emailId,
      noOfPeople,
      noOfAdult,
      noOfChild,
      noOfInfant,
      cruiseName,
      boardingPort,
      exitPort,
      departureDate,
      cabinType,
      sailingDays,
      bookingAmount,
      copyEmail,
      passengers
    } = req.body;

    // Validation
    if (!name || !cellNo || !emailId || !noOfPeople || !passengers || passengers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields including passenger details",
      });
    }

    const insertQuery = `
      INSERT INTO cruise_booking_advanced 
      (name, cell_no, email_id, no_of_people, no_of_adult, no_of_child, no_of_infant,
       cruise_name, boarding_port, exit_port, departure_date, cabin_type, sailing_days,
       booking_amount, copy_email, passenger_details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      name,
      cellNo,
      emailId,
      parseInt(noOfPeople) || 0,
      parseInt(noOfAdult) || 0,
      parseInt(noOfChild) || 0,
      parseInt(noOfInfant) || 0,
      cruiseName,
      boardingPort,
      exitPort,
      departureDate,
      cabinType,
      sailingDays,
      parseFloat(bookingAmount) || 0,
      copyEmail,
      JSON.stringify(passengers),
    ];

    const [result] = await db.query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: "Advanced cruise booking submitted successfully!",
      bookingId: result.insertId,
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({
      success: false,
      message: "Database error occurred",
    });
  }
});

// GET API to retrieve all advanced cruise bookings
router.get("/cruise-bookings-advanced", async (req, res) => {
  try {
    const query = "SELECT * FROM cruise_booking_advanced ORDER BY created_at DESC";

    const [results] = await db.query(query);

    // Parse passenger JSON
    const bookings = results.map((item) => ({
      ...item,
      passenger_details: JSON.parse(item.passenger_details),
    }));

    res.json({
      success: true,
      data: bookings,
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({
      success: false,
      message: "Database error occurred",
    });
  }
});

module.exports = router;
