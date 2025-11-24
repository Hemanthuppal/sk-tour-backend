const express = require("express");
const db = require("../../config/db");
const router = express.Router();


// POST API for advanced cruise booking
router.post("/cruise-booking-advanced", (req, res) => {
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
      message: "Please fill all required fields including passenger details"
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
    JSON.stringify(passengers) // Store passenger details as JSON
  ];

  db.query(insertQuery, values, (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({
        success: false,
        message: "Database error occurred"
      });
    }

    res.status(201).json({
      success: true,
      message: "Advanced cruise booking submitted successfully!",
      bookingId: result.insertId
    });
  });
});

// GET API to retrieve all advanced cruise bookings (optional - for admin)
router.get("/cruise-bookings-advanced", (req, res) => {
  const query = "SELECT * FROM cruise_booking_advanced ORDER BY created_at DESC";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({
        success: false,
        message: "Database error occurred"
      });
    }

    // Parse JSON passenger details
    const bookings = results.map(booking => ({
      ...booking,
      passenger_details: JSON.parse(booking.passenger_details)
    }));

    res.json({
      success: true,
      data: bookings
    });
  });
});

module.exports = router;