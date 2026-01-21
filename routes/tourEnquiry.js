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
          message: "Error saving enquiry",
          error: err.message 
        });
      }
      res.status(200).json({ 
        message: "Enquiry saved successfully",
        enquiryId: result.insertId 
      });
    }
  );
});

// GET: Fetch all enquiries with optional filters
router.get("/tour-enquiries", (req, res) => {
  let sql = `
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
      is_read
    FROM tour_enquiries 
    WHERE 1=1
  `;
  
  const params = [];
  
  // Add optional filters
  if (req.query.search) {
    sql += ` AND (
      name LIKE ? OR 
      email LIKE ? OR 
      phone LIKE ? OR 
      tour_title LIKE ? OR 
      tour_code LIKE ?
    )`;
    const searchTerm = `%${req.query.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }
  
  if (req.query.is_read !== undefined) {
    sql += ` AND is_read = ?`;
    params.push(req.query.is_read === 'true' ? 1 : 0);
  }
  
  // Date range filter
  if (req.query.start_date && req.query.end_date) {
    sql += ` AND DATE(created_at) BETWEEN ? AND ?`;
    params.push(req.query.start_date, req.query.end_date);
  }
  
  // Tour specific filter
  if (req.query.tour_id) {
    sql += ` AND tour_id = ?`;
    params.push(req.query.tour_id);
  }
  
  // Sorting
  const sortBy = req.query.sortBy || 'created_at';
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortBy} ${sortOrder}`;
  
  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching enquiries",
        error: err.message 
      });
    }
    
    // Get total count for pagination
    let countSql = "SELECT COUNT(*) as total FROM tour_enquiries WHERE 1=1";
    const countParams = params.slice(0, -2); // Remove LIMIT and OFFSET params
    
    db.query(countSql, countParams, (countErr, countResult) => {
      if (countErr) {
        console.error("Count error:", countErr);
        return res.status(500).json({ 
          message: "Error counting enquiries",
          error: countErr.message 
        });
      }
      
      const total = countResult[0].total;
      const totalPages = Math.ceil(total / limit);
      
      res.status(200).json({
        enquiries: results,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      });
    });
  });
});

// GET: Get single enquiry by ID
router.get("/tour-enquiries/:id", (req, res) => {
  const { id } = req.params;
  
  const sql = `
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
      is_read
    FROM tour_enquiries 
    WHERE id = ?
  `;
  
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error fetching enquiry",
        error: err.message 
      });
    }
    
    if (result.length === 0) {
      return res.status(404).json({ 
        message: "Enquiry not found" 
      });
    }
    
    res.status(200).json(result[0]);
  });
});

// PUT: Mark enquiry as read
router.put("/tour-enquiries/:id/mark-read", (req, res) => {
  const { id } = req.params;
  
  const sql = `
    UPDATE tour_enquiries 
    SET is_read = 1, 
        read_at = NOW()
    WHERE id = ?
  `;
  
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error updating enquiry",
        error: err.message 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        message: "Enquiry not found" 
      });
    }
    
    res.status(200).json({ 
      message: "Enquiry marked as read" 
    });
  });
});

// DELETE: Delete an enquiry
router.delete("/tour-enquiries/:id", (req, res) => {
  const { id } = req.params;
  
  const sql = "DELETE FROM tour_enquiries WHERE id = ?";
  
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ 
        message: "Error deleting enquiry",
        error: err.message 
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        message: "Enquiry not found" 
      });
    }
    
    res.status(200).json({ 
      message: "Enquiry deleted successfully" 
    });
  });
});

module.exports = router;