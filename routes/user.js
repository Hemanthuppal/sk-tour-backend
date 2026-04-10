const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');


router.post('/users', async (req, res) => {
  const { email, password } = req.body;

  console.log("req.body", req.body);

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = 'INSERT INTO users (email, password) VALUES (?, ?)';

    await db.query(sql, [email, hashedPassword]);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully!'
    });

  } catch (err) {
    console.error(err);

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        error: 'Email already exists'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Database error'
    });
  }
});
// GET ALL USERS
router.get('/users', async (req, res) => {
  try {
    const sql = 'SELECT id, email, password, created_at FROM users';

    const [rows] = await db.query(sql);

    return res.status(200).json({
      success: true,
      users: rows
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Database error'
    });
  }
});

router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const sql = 'SELECT id, email, password FROM users WHERE id = ?';

    const [rows] = await db.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      user: rows[0]
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Database error'
    });
  }
});


// =====================
// UPDATE USER (PUT)
// =====================
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;

  try {
    let sql = 'UPDATE users SET email = ?';
    let values = [email];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      sql += ', password = ?';
      values.push(hashedPassword);
    }

    sql += ' WHERE id = ?';
    values.push(id);

    db.query(sql, values, (err, result) => {
      if (err) return res.status(500).json(err);
      res.json({ message: 'User updated successfully' });
    });
  } catch (error) {
    res.status(500).json(error);
  }
});


// =====================
// DELETE USER
// =====================
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;

  const sql = 'DELETE FROM users WHERE id = ?';
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json({ message: 'User deleted successfully' });
  });
});

module.exports = router;