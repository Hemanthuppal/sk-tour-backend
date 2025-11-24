const express = require("express");
const db = require("../../db");
const router = express.Router();


// POST API for cruise booking
router.post("/cruise-booking", (req, res) => {
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
    remarks,
    copyEmail
  } = req.body;

  // Validation
  if (!name || !cellNo || !emailId || !noOfPeople) {
    return res.status(400).json({
      success: false,
      message: "Please fill all required fields"
    });
  }

  const insertQuery = `
    INSERT INTO cruise_booking 
    (name, cell_no, email_id, no_of_people, no_of_adult, no_of_child, no_of_infant, 
     cruise_name, boarding_port, exit_port, departure_date, cabin_type, sailing_days, remarks, copy_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    remarks,
    copyEmail
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
      message: "Cruise booking submitted successfully!",
      bookingId: result.insertId
    });
  });
});

// GET API to retrieve all cruise bookings (optional - for admin)
router.get("/cruise-bookings", (req, res) => {
  const query = "SELECT * FROM cruise_booking ORDER BY created_at DESC";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({
        success: false,
        message: "Database error occurred"
      });
    }

    res.json({
      success: true,
      data: results
    });
  });
});

module.exports = router;