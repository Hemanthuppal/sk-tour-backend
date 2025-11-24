const express = require("express");
const db = require("../../config/db");
const router = express.Router();

// POST API for visa consultancy booking
router.post("/visa-consultancy", async (req, res) => {
  try {
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
    if (!name || !cellNo || !emailId || !address || !city || !pinCode || !state || !country ||
        !consultancyCountry || !convenientDate || !convenientTime || !noOfPeople) {
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

    const [result] = await db.query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: "Visa consultancy appointment booked successfully!",
      appointmentId: result.insertId
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({
      success: false,
      message: "Database error occurred"
    });
  }
});

// GET API to retrieve all visa consultancy appointments
router.get("/visa-appointments", async (req, res) => {
  try {
    const query = "SELECT * FROM visa_consultancy ORDER BY created_at DESC";

    const [results] = await db.query(query);

    res.json({
      success: true,
      data: results
    });

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({
      success: false,
      message: "Database error occurred"
    });
  }
});

// GET API to retrieve appointment by ID
router.get("/visa-appointments/:id", async (req, res) => {
  try {
    const appointmentId = req.params.id;

    const query = "SELECT * FROM visa_consultancy WHERE id = ?";

    const [results] = await db.query(query, [appointmentId]);

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

  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({
      success: false,
      message: "Database error occurred"
    });
  }
});

module.exports = router;
