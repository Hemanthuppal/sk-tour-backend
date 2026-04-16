const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../config/db'); // Your database connection

// =====================
// REGISTER USER (Plain text password)
// =====================
router.post('/users', async (req, res) => {
  const { email, password } = req.body;
  
  console.log('Signup request:', { email, password: password ? '***' : 'missing' });

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Check if user already exists
    const [existingUsers] = await db.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Store password as plain text (NO HASHING)
    const plainTextPassword = password;

    // Insert user with plain text password
    const [result] = await db.execute(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email, plainTextPassword]
    );

    console.log('User registered successfully:', { id: result.insertId, email });

    res.status(201).json({ 
      message: 'User registered successfully',
      userId: result.insertId 
    });
    
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('Login attempt:', { email });

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }

  try {
    // Get user by email
    const sql = 'SELECT id, email, password FROM users WHERE email = ?';
    const [rows] = await db.query(sql, [email]);

    if (rows.length === 0) {
      console.log('User not found:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = rows[0];

    // Plain text password comparison
    if (user.password !== password) {
      console.log('Invalid password for:', email);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    console.log('Login successful:', email);

    // Remove password from response
    delete user.password;

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: user
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// =====================
// UPDATE USER
// =====================
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { email, password } = req.body;

  try {
    let sql = 'UPDATE users SET email = ?';
    let values = [email];

    if (password) {
      // For update, store plain text as well
      sql += ', password = ?';
      values.push(password); // Plain text password
    }

    sql += ' WHERE id = ?';
    values.push(id);

    const [result] = await db.execute(sql, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================
// DELETE USER
// =====================
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================
// GET ALL USERS
// =====================
router.get('/users', async (req, res) => {
  try {
    const sql = 'SELECT id, email, password, created_at FROM users';
    const [rows] = await db.query(sql);

    return res.status(200).json({
      success: true,
      users: rows
    });

  } catch (err) {
    console.error('Error fetching users:', err);
    return res.status(500).json({
      success: false,
      error: 'Database error'
    });
  }
});

// =====================
// GET USER BY ID
// =====================
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
    console.error('Error fetching user:', err);
    return res.status(500).json({
      success: false,
      error: 'Database error'
    });
  }
});

module.exports = router;