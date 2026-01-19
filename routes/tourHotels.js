const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM tour_hotels WHERE tour_id = ? ORDER BY hotel_id ASC`,
      [req.params.tour_id]
    );

    res.json(rows);

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { tour_id, city, hotel_name, room_type, nights } = req.body;

  if (!tour_id || !city || !hotel_name || !room_type || !nights) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO tour_hotels (tour_id, city, hotel_name, room_type, nights)
       VALUES (?, ?, ?, ?, ?)`,
      [tour_id, city, hotel_name, room_type, nights]
    );

    res.status(201).json({ message: "Hotel added", hotel_id: result.insertId });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:hotel_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE tour_hotels SET ? WHERE hotel_id = ?`,
      [req.body, req.params.hotel_id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Hotel not found" });

    res.json({ message: "Updated successfully" });

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:hotel_id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM tour_hotels WHERE hotel_id = ?`, [req.params.hotel_id]);
    res.json({ message: "Deleted successfully" });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  console.log('=== TOUR_HOTELS BULK API CALLED ===');
  console.log('Request received at:', new Date().toISOString());
  console.log('Request headers:', req.headers);
  console.log('Request body keys:', Object.keys(req.body));
  
  const { tour_id, hotels } = req.body;

  console.log('tour_id:', tour_id);
  console.log('hotels type:', typeof hotels);
  console.log('hotels is array?', Array.isArray(hotels));
  console.log('hotels length:', hotels ? hotels.length : 0);
  console.log('hotels sample (first 2):', hotels ? hotels.slice(0, 2) : 'none');

  // Validate input
  if (!tour_id) {
    console.error('ERROR: tour_id is missing or falsy');
    return res.status(400).json({ 
      message: 'tour_id is required',
      received_tour_id: tour_id 
    });
  }

  if (!Array.isArray(hotels)) {
    console.error('ERROR: hotels is not an array', { hotels_type: typeof hotels });
    return res.status(400).json({ 
      message: 'hotels must be an array',
      hotels_type: typeof hotels 
    });
  }

  if (hotels.length === 0) {
    console.warn('WARNING: hotels array is empty');
    return res.status(400).json({ 
      message: 'hotels array cannot be empty',
      received_hotels_length: hotels.length 
    });
  }

  console.log('Input validation passed');

  let conn;
  try {
    // Get database connection
    console.log('Attempting to get database connection...');
    conn = await pool.getConnection();
    console.log('Database connection acquired');

    // Begin transaction
    console.log('Starting transaction...');
    await conn.beginTransaction();
    console.log('Transaction started');

    // Prepare values for insertion
    console.log('Preparing hotel data for insertion...');
    const values = hotels.map((h, index) => {
      const rowValues = [
        tour_id,
        h.city || '',
        h.nights ? Number(h.nights) : null,
        h.remarks || null,
        h.standard_hotel_name || null,
        h.deluxe_hotel_name || null,
        h.executive_hotel_name || null
      ];
      
      console.log(`Hotel row ${index + 1}:`, {
        city: h.city,
        nights: h.nights,
        standard_hotel: h.standard_hotel_name,
        deluxe_hotel: h.deluxe_hotel_name,
        executive_hotel: h.executive_hotel_name,
        raw_values: rowValues
      });
      
      return rowValues;
    });

    console.log('Total rows to insert:', values.length);
    console.log('SQL VALUES to insert:', JSON.stringify(values, null, 2));

    // Execute INSERT query
    console.log('Executing INSERT query...');
    console.log('Table schema: tour_hotels (tour_id, city, nights, remarks, standard_hotel_name, deluxe_hotel_name, executive_hotel_name)');
    
    const insertQuery = `
      INSERT INTO tour_hotels 
      (tour_id, city, nights, remarks, standard_hotel_name, deluxe_hotel_name, executive_hotel_name)
      VALUES ?
    `;
    
    console.log('SQL Query:', insertQuery);
    console.log('Parameter count:', values[0] ? values[0].length : 0);

    const result = await conn.query(insertQuery, [values]);
    
    console.log('INSERT successful!');
    console.log('MySQL Result:', {
      affectedRows: result.affectedRows,
      insertId: result.insertId,
      warningCount: result.warningCount
    });

    // Commit transaction
    console.log('Committing transaction...');
    await conn.commit();
    console.log('Transaction committed successfully');

    // Success response
    const successResponse = {
      message: `${hotels.length} hotel rows added successfully`,
      tour_id,
      added_count: hotels.length,
      mysql_affected_rows: result.affectedRows,
      timestamp: new Date().toISOString()
    };

    console.log('Sending success response:', successResponse);
    res.status(201).json(successResponse);

  } catch (err) {
    console.error('=== CRITICAL ERROR IN BULK INSERT ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error sqlMessage:', err.sqlMessage);
    console.error('Error sqlState:', err.sqlState);
    console.error('Error sql:', err.sql);
    console.error('Error stack:', err.stack);
    
    // Rollback transaction if connection exists
    if (conn) {
      try {
        console.log('Attempting to rollback transaction...');
        await conn.rollback();
        console.log('Transaction rolled back successfully');
      } catch (rollbackErr) {
        console.error('Failed to rollback transaction:', rollbackErr.message);
      }
    }

    // Determine error type and send appropriate response
    let statusCode = 500;
    let errorMessage = err.message;
    
    // MySQL specific error codes
    if (err.code) {
      switch (err.code) {
        case 'ER_DUP_ENTRY':
          statusCode = 409; // Conflict
          errorMessage = 'Duplicate entry found';
          break;
        case 'ER_NO_REFERENCED_ROW':
        case 'ER_NO_REFERENCED_ROW_2':
          statusCode = 400; // Bad Request
          errorMessage = 'Invalid tour_id: Referenced tour does not exist';
          break;
        case 'ER_DATA_TOO_LONG':
          statusCode = 400;
          errorMessage = 'Data too long for one or more fields';
          break;
        case 'ER_BAD_NULL_ERROR':
          statusCode = 400;
          errorMessage = 'Required field is null';
          break;
      }
    }

    console.log(`Sending error response (${statusCode}):`, errorMessage);
    
    res.status(statusCode).json({
      error: errorMessage,
      mysql_error_code: err.code,
      mysql_sql_message: err.sqlMessage,
      timestamp: new Date().toISOString(),
      suggestion: 'Check database connection, table structure, and foreign key constraints'
    });

  } finally {
    // Always release connection
    if (conn) {
      try {
        console.log('Releasing database connection...');
        conn.release();
        console.log('Database connection released');
      } catch (releaseErr) {
        console.error('Error releasing connection:', releaseErr.message);
      }
    }
    
    console.log('=== TOUR_HOTELS BULK API COMPLETED ===\n');
  }
});

// DELETE ALL hotels for a tour
router.delete('/tour/:tour_id', async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM tour_hotels WHERE tour_id = ?',
      [req.params.tour_id]
    );
    res.json({ 
      success: true, 
      message: `Deleted ${result.affectedRows} hotel rows` 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;