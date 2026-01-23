const express = require("express");
const router = express.Router();
const db = require("../config/db");

// POST: Save new enquiry
router.post("/tour-enquiry", (req, res) => {
  const {
    tour_id,
    tour_code,
    tour_title,
    name,
    email,
    phone,
    message
  } = req.body;

  const sql = `
    INSERT INTO tour_enquiries 
    (tour_id, tour_code, tour_title, name, email, phone, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `;

  db.query(
    sql,
    [tour_id, tour_code, tour_title, name, email, phone, message],
    (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ 
          success: false,
          message: "Error saving enquiry",
          error: err.message 
        });
      }
      res.status(200).json({ 
        success: true,
        message: "Enquiry saved successfully",
        enquiryId: result.insertId 
      });
    }
  );
});

// GET: Fetch all tour enquiries with pagination and filters
// GET API – fetch all tour enquiries
// GET API – mysql2 promise pool compatible
router.get("/tour-enquiries", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        tour_id,
        tour_code,
        tour_title,
        name,
        email,
        phone,
        message,
        created_at,
        is_read,
        read_at
      FROM tour_enquiries
      ORDER BY created_at DESC
    `);

    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});



module.exports = router;