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
    (tour_id, tour_code, tour_title, name, email, phone, message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [tour_id, tour_code, tour_title, name, email, phone, message],
    (err) => {
      if (err) return res.status(500).json(err);
      res.status(200).json({ message: "Enquiry saved" });
    }
  );
});


module.exports = router;