const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db'); // Your database connection

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/exhibition/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'banner-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

// ========== ABOUT EXHIBITION ROUTES ==========

// Get About Exhibition (only one record allowed)
router.get('/about', async (req, res) => {
  let connection;
  try {
    // Get a connection from the pool
    connection = await db.getConnection();
    
    // First, get the main about exhibition record
    const [aboutRecords] = await connection.query(`
      SELECT * FROM about_exhibition 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (aboutRecords.length === 0) {
      return res.json(null);
    }

    const exhibition = aboutRecords[0];
    
    // Then get the questions separately
    const [questions] = await connection.query(`
      SELECT id, question, answer, display_order 
      FROM about_exhibition_qa 
      WHERE about_exhibition_id = ? 
      ORDER BY display_order ASC
    `, [exhibition.id]);

    exhibition.questions = questions || [];
    
    res.json(exhibition);
  } catch (error) {
    console.error('Error fetching about exhibition:', error);
    res.status(500).json({ error: 'Error fetching about exhibition' });
  } finally {
    // Release the connection back to the pool
    if (connection) connection.release();
  }
});

// Create or Update About Exhibition (Only one allowed)
// Create or Update About Exhibition (Only one allowed)
router.post('/about', (req, res) => {
  upload.single('bannerImage')(req, res, async (err) => {
    let connection;
    try {
      // Handle multer errors (only for new files)
      if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size too large. Maximum 5MB allowed.' });
      }
      if (err && err.message === 'Only image files are allowed!') {
        return res.status(400).json({ error: 'Only image files (jpeg, jpg, png, gif) are allowed.' });
      }
      // Don't return error if no file is uploaded (for updates)

      const { questions, isEdit } = req.body;
      let parsedQuestions = [];
      
      if (questions) {
        try {
          parsedQuestions = JSON.parse(questions);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid questions format' });
        }
      }

      const isEditing = isEdit === 'true';
      const bannerImage = req.file ? req.file.filename : null;

      // Get a connection from the pool
      connection = await db.getConnection();
      
      // Start transaction
      await connection.beginTransaction();

      try {
        // Check if about exhibition already exists
        const [existing] = await connection.query('SELECT id, banner_image FROM about_exhibition LIMIT 1');
        
        let exhibitionId;
        let currentBannerImage = existing.length > 0 ? existing[0].banner_image : null;
        
        // Validate: banner image is required for new records
        if (!isEditing && !bannerImage) {
          await connection.rollback();
          return res.status(400).json({ error: 'Banner image is required for new records' });
        }
        
        if (existing.length > 0) {
          // Update existing
          exhibitionId = existing[0].id;
          
          // Prepare update query based on whether new banner image is provided
          if (bannerImage) {
            // Delete old banner image file if exists
            if (currentBannerImage) {
              const oldFilePath = path.join('uploads/exhibition/', currentBannerImage);
              if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
              }
            }
            
            await connection.query(
              'UPDATE about_exhibition SET banner_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [bannerImage, exhibitionId]
            );
          } else {
            // Keep existing banner image
            await connection.query(
              'UPDATE about_exhibition SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [exhibitionId]
            );
          }
          
          // Delete existing questions
          await connection.query('DELETE FROM about_exhibition_qa WHERE about_exhibition_id = ?', [exhibitionId]);
        } else {
          // Create new (bannerImage must exist at this point due to validation above)
          if (!bannerImage) {
            await connection.rollback();
            return res.status(400).json({ error: 'Banner image is required' });
          }
          
          const [result] = await connection.query(
            'INSERT INTO about_exhibition (banner_image) VALUES (?)',
            [bannerImage]
          );
          exhibitionId = result.insertId;
        }

        // Insert new questions
        if (parsedQuestions.length > 0) {
          const questionValues = parsedQuestions.map((q, index) => [
            exhibitionId,
            q.question,
            q.answer,
            index
          ]);
          
          await connection.query(
            'INSERT INTO about_exhibition_qa (about_exhibition_id, question, answer, display_order) VALUES ?',
            [questionValues]
          );
        }

        await connection.commit();
        
        res.json({ 
          message: existing.length > 0 ? 'About exhibition updated successfully' : 'About exhibition created successfully',
          id: exhibitionId 
        });
        
      } catch (error) {
        await connection.rollback();
        console.error('Database error:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error saving about exhibition:', error);
      res.status(500).json({ error: 'Error saving about exhibition' });
    } finally {
      // Release the connection back to the pool
      if (connection) connection.release();
    }
  });
});

// Delete About Exhibition
router.delete('/about/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    
    // Get a connection from the pool
    connection = await db.getConnection();
    
    // Get banner image path to delete file
    const [exhibition] = await connection.query('SELECT banner_image FROM about_exhibition WHERE id = ?', [id]);
    
    if (exhibition.length > 0) {
      // Delete the file
      const filePath = path.join('uploads/exhibition/', exhibition[0].banner_image);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await connection.query('DELETE FROM about_exhibition WHERE id = ?', [id]);
    
    res.json({ message: 'About exhibition deleted successfully' });
  } catch (error) {
    console.error('Error deleting about exhibition:', error);
    res.status(500).json({ error: 'Error deleting about exhibition' });
  } finally {
    // Release the connection back to the pool
    if (connection) connection.release();
  }
});

// ========== DOMESTIC EXHIBITION ROUTES ==========

// Get all domestic countries
router.get('/domestic', async (req, res) => {
  try {
    const [countries] = await db.query(`
      SELECT * FROM domestic_exhibition 
      ORDER BY country_name ASC
    `);
    res.json(countries);
  } catch (error) {
    console.error('Error fetching domestic countries:', error);
    res.status(500).json({ error: 'Error fetching domestic countries' });
  }
});

// Add domestic country
router.post('/domestic', async (req, res) => {
  try {
    const { country_name } = req.body;
    
    if (!country_name || country_name.trim() === '') {
      return res.status(400).json({ error: 'Country name is required' });
    }
    
    const [result] = await db.query(
      'INSERT INTO domestic_exhibition (country_name) VALUES (?)',
      [country_name.trim()]
    );
    
    res.json({ 
      message: 'Domestic country added successfully',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error adding domestic country:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Country already exists' });
    } else {
      res.status(500).json({ error: 'Error adding domestic country' });
    }
  }
});

// Update domestic country
router.put('/domestic/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { country_name } = req.body;
    
    if (!country_name || country_name.trim() === '') {
      return res.status(400).json({ error: 'Country name is required' });
    }
    
    await db.query(
      'UPDATE domestic_exhibition SET country_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [country_name.trim(), id]
    );
    
    res.json({ message: 'Domestic country updated successfully' });
  } catch (error) {
    console.error('Error updating domestic country:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Country already exists' });
    } else {
      res.status(500).json({ error: 'Error updating domestic country' });
    }
  }
});

// Delete domestic country
router.delete('/domestic/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query('DELETE FROM domestic_exhibition WHERE id = ?', [id]);
    
    res.json({ message: 'Domestic country deleted successfully' });
  } catch (error) {
    console.error('Error deleting domestic country:', error);
    res.status(500).json({ error: 'Error deleting domestic country' });
  }
});

// Bulk add domestic countries
router.post('/domestic/bulk', async (req, res) => {
  try {
    const { countries } = req.body;
    
    if (!Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: 'Countries array is required' });
    }
    
    // Filter out empty country names
    const validCountries = countries
      .filter(country => country && country.trim() !== '')
      .map(country => country.trim());
    
    if (validCountries.length === 0) {
      return res.status(400).json({ error: 'No valid country names provided' });
    }
    
    // Insert countries
    const values = validCountries.map(country => [country]);
    const [result] = await db.query(
      'INSERT IGNORE INTO domestic_exhibition (country_name) VALUES ?',
      [values]
    );
    
    res.json({ 
      message: `Added ${result.affectedRows} domestic countries successfully`,
      added: result.affectedRows
    });
  } catch (error) {
    console.error('Error adding bulk domestic countries:', error);
    res.status(500).json({ error: 'Error adding domestic countries' });
  }
});

// ========== INTERNATIONAL EXHIBITION ROUTES ==========

// Get all international countries
router.get('/international', async (req, res) => {
  try {
    const [countries] = await db.query(`
      SELECT * FROM international_exhibition 
      ORDER BY country_name ASC
    `);
    res.json(countries);
  } catch (error) {
    console.error('Error fetching international countries:', error);
    res.status(500).json({ error: 'Error fetching international countries' });
  }
});

// Add international country
router.post('/international', async (req, res) => {
  try {
    const { country_name } = req.body;
    
    if (!country_name || country_name.trim() === '') {
      return res.status(400).json({ error: 'Country name is required' });
    }
    
    const [result] = await db.query(
      'INSERT INTO international_exhibition (country_name) VALUES (?)',
      [country_name.trim()]
    );
    
    res.json({ 
      message: 'International country added successfully',
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error adding international country:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Country already exists' });
    } else {
      res.status(500).json({ error: 'Error adding international country' });
    }
  }
});

// Update international country
router.put('/international/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { country_name } = req.body;
    
    if (!country_name || country_name.trim() === '') {
      return res.status(400).json({ error: 'Country name is required' });
    }
    
    await db.query(
      'UPDATE international_exhibition SET country_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [country_name.trim(), id]
    );
    
    res.json({ message: 'International country updated successfully' });
  } catch (error) {
    console.error('Error updating international country:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Country already exists' });
    } else {
      res.status(500).json({ error: 'Error updating international country' });
    }
  }
});

// Delete international country
router.delete('/international/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.query('DELETE FROM international_exhibition WHERE id = ?', [id]);
    
    res.json({ message: 'International country deleted successfully' });
  } catch (error) {
    console.error('Error deleting international country:', error);
    res.status(500).json({ error: 'Error deleting international country' });
  }
});

// Bulk add international countries
router.post('/international/bulk', async (req, res) => {
  try {
    const { countries } = req.body;
    
    if (!Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: 'Countries array is required' });
    }
    
    // Filter out empty country names
    const validCountries = countries
      .filter(country => country && country.trim() !== '')
      .map(country => country.trim());
    
    if (validCountries.length === 0) {
      return res.status(400).json({ error: 'No valid country names provided' });
    }
    
    // Insert countries
    const values = validCountries.map(country => [country]);
    const [result] = await db.query(
      'INSERT IGNORE INTO international_exhibition (country_name) VALUES ?',
      [values]
    );
    
    res.json({ 
      message: `Added ${result.affectedRows} international countries successfully`,
      added: result.affectedRows
    });
  } catch (error) {
    console.error('Error adding bulk international countries:', error);
    res.status(500).json({ error: 'Error adding international countries' });
  }
});


// ========== ADD THESE ROUTES TO YOUR BACKEND ==========

// Get single domestic country
router.get('/domestic/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [countries] = await db.query(
      'SELECT * FROM domestic_exhibition WHERE id = ?',
      [id]
    );
    
    if (countries.length === 0) {
      return res.status(404).json({ error: 'Country not found' });
    }
    
    res.json(countries[0]);
  } catch (error) {
    console.error('Error fetching domestic country:', error);
    res.status(500).json({ error: 'Error fetching domestic country' });
  }
});

// Get single international country
router.get('/international/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [countries] = await db.query(
      'SELECT * FROM international_exhibition WHERE id = ?',
      [id]
    );
    
    if (countries.length === 0) {
      return res.status(404).json({ error: 'Country not found' });
    }
    
    res.json(countries[0]);
  } catch (error) {
    console.error('Error fetching international country:', error);
    res.status(500).json({ error: 'Error fetching international country' });
  }
});

module.exports = router;