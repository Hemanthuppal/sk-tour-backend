const express = require("express");
const db = require("../../config/db");
const router = express.Router();


// POST API for visa consultancy booking
router.post("/visa-consultancy", (req, res) => {
  const {
    name,
    cellNo,
    emailId,
    address,
    city,
    pinCode,
    state,
    country,
    consultancyCountry,
    convenientDate,
    convenientTime,
    noOfPeople,
    agreed
  } = req.body;

  // Validation
  if (!name || !cellNo || !emailId || !address || !city || !pinCode || !state || !country || !consultancyCountry || !convenientDate || !convenientTime || !noOfPeople) {
    return res.status(400).json({
      success: false,
      message: "Please fill all required fields"
    });
  }

  if (!agreed) {
    return res.status(400).json({
      success: false,
      message: "Please agree to the terms and conditions"
    });
  }

  const insertQuery = `
    INSERT INTO visa_consultancy 
    (name, cell_no, email_id, address, city, pin_code, state, country, 
     consultancy_country, convenient_date, convenient_time, no_of_people, agreed_terms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    name,
    cellNo,
    emailId,
    address,
    city,
    pinCode,
    state,
    country,
    consultancyCountry,
    convenientDate,
    convenientTime,
    parseInt(noOfPeople) || 0,
    agreed
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
      message: "Visa consultancy appointment booked successfully!",
      appointmentId: result.insertId
    });
  });
});

// GET API to retrieve all visa consultancy appointments (optional - for admin)
router.get("/visa-appointments", (req, res) => {
  const query = "SELECT * FROM visa_consultancy ORDER BY created_at DESC";
  
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

// GET API to retrieve appointment by ID
router.get("/visa-appointments/:id", (req, res) => {
  const appointmentId = req.params.id;
  
  const query = "SELECT * FROM visa_consultancy WHERE id = ?";
  
  db.query(query, [appointmentId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({
        success: false,
        message: "Database error occurred"
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found"
      });
    }

    res.json({
      success: true,
      data: results[0]
    });
  });
});

module.exports = router;