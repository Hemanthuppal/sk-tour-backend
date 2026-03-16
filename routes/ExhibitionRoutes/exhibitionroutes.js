const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/exhibition/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'exhibition-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
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

// Helper function to handle multiple file uploads
const uploadMultiple = upload.array('images', 10);

// ========== ABOUT EXHIBITION ROUTES (unchanged) ==========
router.get('/about', async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [aboutRecords] = await connection.query(`
      SELECT * FROM about_exhibition 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (aboutRecords.length === 0) {
      return res.json(null);
    }

    const exhibition = aboutRecords[0];
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
    if (connection) connection.release();
  }
});

router.post('/about', (req, res) => {
  upload.single('bannerImage')(req, res, async (err) => {
    let connection;
    try {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { questions, isEdit } = req.body;
      let parsedQuestions = [];
      
      if (questions) {
        try {
          parsedQuestions = JSON.parse(questions);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid questions format' });
        }
      }

      const bannerImage = req.file ? req.file.filename : null;

      connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        const [existing] = await connection.query('SELECT id, banner_image FROM about_exhibition LIMIT 1');
        
        let exhibitionId;
        
        if (existing.length > 0) {
          exhibitionId = existing[0].id;
          
          if (bannerImage) {
            if (existing[0].banner_image) {
              const oldFilePath = path.join('uploads/exhibition/', existing[0].banner_image);
              if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
              }
            }
            
            await connection.query(
              'UPDATE about_exhibition SET banner_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [bannerImage, exhibitionId]
            );
          }
          
          await connection.query('DELETE FROM about_exhibition_qa WHERE about_exhibition_id = ?', [exhibitionId]);
        } else {
          if (!bannerImage) {
            await connection.rollback();
            return res.status(400).json({ error: 'Banner image is required for new records' });
          }
          
          const [result] = await connection.query(
            'INSERT INTO about_exhibition (banner_image) VALUES (?)',
            [bannerImage]
          );
          exhibitionId = result.insertId;
        }

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
        throw error;
      }
    } catch (error) {
      console.error('Error saving about exhibition:', error);
      res.status(500).json({ error: 'Error saving about exhibition' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// ========== DOMESTIC EXHIBITION ROUTES ==========

// Get all domestic exhibitions with their cities
router.get('/domestic', async (req, res) => {
  try {
    const [exhibitions] = await db.query(`
      SELECT * FROM domestic_exhibition 
      ORDER BY created_at DESC
    `);
    
    for (let exhibition of exhibitions) {
      const [cities] = await db.query(
        'SELECT id, city_name, image, price FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ? ORDER BY created_at',
        [exhibition.id]
      );
      exhibition.cities = cities || [];
    }
    
    res.json(exhibitions);
  } catch (error) {
    console.error('Error fetching domestic exhibitions:', error);
    res.status(500).json({ error: 'Error fetching domestic exhibitions' });
  }
});

// Get single domestic exhibition with its cities
router.get('/domestic/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [exhibitions] = await db.query(
      'SELECT * FROM domestic_exhibition WHERE id = ?',
      [id]
    );
    
    if (exhibitions.length === 0) {
      return res.status(404).json({ error: 'Exhibition not found' });
    }
    
    const exhibition = exhibitions[0];
    
    const [cities] = await db.query(
      'SELECT id, city_name, image, price FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ? ORDER BY created_at',
      [id]
    );
    
    exhibition.cities = cities || [];
    
    res.json(exhibition);
  } catch (error) {
    console.error('Error fetching domestic exhibition:', error);
    res.status(500).json({ error: 'Error fetching domestic exhibition' });
  }
});

// Add new domestic exhibition (with optional cities)
router.post('/domestic', (req, res) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { country_name, cityNames, prices } = req.body;
      const files = req.files || [];
      
      if (!country_name || country_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      // Parse the JSON strings if they exist
      let cityNamesArray = [];
      let pricesArray = [];
      
      if (cityNames) {
        try {
          cityNamesArray = JSON.parse(cityNames);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid city names format' });
        }
      }
      
      if (prices) {
        try {
          pricesArray = JSON.parse(prices);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid prices format' });
        }
      }
      
      // Validate if cities are provided
      if (cityNamesArray.length > 0) {
        if (cityNamesArray.length !== pricesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities and prices' });
        }
        
        if (cityNamesArray.length !== files.length) {
          return res.status(400).json({ error: 'Please upload an image for each city' });
        }
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      // Insert the main exhibition
      const [result] = await connection.query(
        'INSERT INTO domestic_exhibition (country_name) VALUES (?)',
        [country_name.trim()]
      );
      
      const exhibitionId = result.insertId;
      
      // Insert cities only if they exist
      if (cityNamesArray.length > 0) {
        for (let i = 0; i < cityNamesArray.length; i++) {
          const cityName = cityNamesArray[i]?.trim();
          const price = pricesArray[i];
          const imageFile = files[i];
          
          if (!cityName) {
            await connection.rollback();
            return res.status(400).json({ error: 'City name cannot be empty' });
          }
          
          if (!price || price <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Valid price is required for each city' });
          }
          
          await connection.query(
            'INSERT INTO domestic_exhibition_cities (domestic_exhibition_id, city_name, image, price) VALUES (?, ?, ?, ?)',
            [exhibitionId, cityName, imageFile.filename, price]
          );
        }
      }
      
      await connection.commit();
      
      res.json({ 
        message: 'Domestic exhibition added successfully',
        id: exhibitionId 
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error adding domestic exhibition:', error);
      
      // Delete uploaded files if there was an error
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/exhibition/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error adding domestic exhibition' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Update domestic exhibition
router.put('/domestic/:id', (req, res) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { id } = req.params;
      const { country_name, cityNames, prices, existingCityIds, existingImages } = req.body;
      const files = req.files || [];
      
      if (!country_name || country_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      // Parse the JSON strings
      let cityNamesArray = [];
      let pricesArray = [];
      let existingCityIdsArray = [];
      let existingImagesArray = [];
      
      if (cityNames) cityNamesArray = JSON.parse(cityNames || '[]');
      if (prices) pricesArray = JSON.parse(prices || '[]');
      if (existingCityIds) existingCityIdsArray = JSON.parse(existingCityIds || '[]');
      if (existingImages) existingImagesArray = JSON.parse(existingImages || '[]');
      
      // Validate if cities are provided
      if (cityNamesArray.length > 0) {
        if (cityNamesArray.length !== pricesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities and prices' });
        }
        
        const totalCities = cityNamesArray.length;
        const totalImages = existingImagesArray.length + files.length;
        
        if (totalCities !== totalImages) {
          return res.status(400).json({ error: 'Please ensure each city has an image' });
        }
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      // Update the main exhibition
      await connection.query(
        'UPDATE domestic_exhibition SET country_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [country_name.trim(), id]
      );
      
      // Get existing cities to delete old images
      const [oldCities] = await connection.query(
        'SELECT id, image FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ?',
        [id]
      );
      
      // Delete old city records
      await connection.query('DELETE FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ?', [id]);
      
      // Insert updated cities only if there are any
      if (cityNamesArray.length > 0) {
        let fileIndex = 0;
        let existingImageIndex = 0;
        
        for (let i = 0; i < cityNamesArray.length; i++) {
          const cityName = cityNamesArray[i]?.trim();
          const price = pricesArray[i];
          
          if (!cityName) {
            await connection.rollback();
            return res.status(400).json({ error: 'City name cannot be empty' });
          }
          
          if (!price || price <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Valid price is required for each city' });
          }
          
          let imageFilename;
          
          // Check if this city is using an existing image or a new uploaded image
          if (existingImagesArray.length > 0 && existingImageIndex < existingImagesArray.length) {
            imageFilename = existingImagesArray[existingImageIndex];
            existingImageIndex++;
          } else if (files.length > 0 && fileIndex < files.length) {
            imageFilename = files[fileIndex].filename;
            fileIndex++;
          } else {
            await connection.rollback();
            return res.status(400).json({ error: 'Image missing for city: ' + cityName });
          }
          
          await connection.query(
            'INSERT INTO domestic_exhibition_cities (domestic_exhibition_id, city_name, image, price) VALUES (?, ?, ?, ?)',
            [id, cityName, imageFilename, price]
          );
        }
        
        // Delete old image files that are no longer used
        const newImageFilenames = existingImagesArray.concat(files.map(f => f.filename));
        
        for (let oldCity of oldCities) {
          if (!newImageFilenames.includes(oldCity.image)) {
            const oldFilePath = path.join('uploads/exhibition/', oldCity.image);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          }
        }
      }
      
      await connection.commit();
      
      res.json({ message: 'Domestic exhibition updated successfully' });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error updating domestic exhibition:', error);
      
      // Delete newly uploaded files if there was an error
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/exhibition/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error updating domestic exhibition' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Delete domestic exhibition
router.delete('/domestic/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    
    connection = await db.getConnection();
    
    // Get all city images to delete files
    const [cities] = await connection.query(
      'SELECT image FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ?',
      [id]
    );
    
    // Delete image files
    for (let city of cities) {
      if (city.image) {
        const filePath = path.join('uploads/exhibition/', city.image);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
    
    // Delete the exhibition (cities will be deleted by CASCADE)
    await connection.query('DELETE FROM domestic_exhibition WHERE id = ?', [id]);
    
    res.json({ message: 'Domestic exhibition deleted successfully' });
  } catch (error) {
    console.error('Error deleting domestic exhibition:', error);
    res.status(500).json({ error: 'Error deleting domestic exhibition' });
  } finally {
    if (connection) connection.release();
  }
});

// ========== INTERNATIONAL EXHIBITION ROUTES ==========

// Get all international exhibitions with their cities
router.get('/international', async (req, res) => {
  try {
    const [exhibitions] = await db.query(`
      SELECT * FROM international_exhibition 
      ORDER BY created_at DESC
    `);
    
    for (let exhibition of exhibitions) {
      const [cities] = await db.query(
        'SELECT id, city_name, image, price FROM international_exhibition_cities WHERE international_exhibition_id = ? ORDER BY created_at',
        [exhibition.id]
      );
      exhibition.cities = cities || [];
    }
    
    res.json(exhibitions);
  } catch (error) {
    console.error('Error fetching international exhibitions:', error);
    res.status(500).json({ error: 'Error fetching international exhibitions' });
  }
});

// Get single international exhibition with its cities
router.get('/international/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [exhibitions] = await db.query(
      'SELECT * FROM international_exhibition WHERE id = ?',
      [id]
    );
    
    if (exhibitions.length === 0) {
      return res.status(404).json({ error: 'Exhibition not found' });
    }
    
    const exhibition = exhibitions[0];
    
    const [cities] = await db.query(
      'SELECT id, city_name, image, price FROM international_exhibition_cities WHERE international_exhibition_id = ? ORDER BY created_at',
      [id]
    );
    
    exhibition.cities = cities || [];
    
    res.json(exhibition);
  } catch (error) {
    console.error('Error fetching international exhibition:', error);
    res.status(500).json({ error: 'Error fetching international exhibition' });
  }
});

// Add new international exhibition (with optional cities)
router.post('/international', (req, res) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { country_name, cityNames, prices } = req.body;
      const files = req.files || [];
      
      if (!country_name || country_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      let cityNamesArray = [];
      let pricesArray = [];
      
      if (cityNames) {
        try {
          cityNamesArray = JSON.parse(cityNames);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid city names format' });
        }
      }
      
      if (prices) {
        try {
          pricesArray = JSON.parse(prices);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid prices format' });
        }
      }
      
      if (cityNamesArray.length > 0) {
        if (cityNamesArray.length !== pricesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities and prices' });
        }
        
        if (cityNamesArray.length !== files.length) {
          return res.status(400).json({ error: 'Please upload an image for each city' });
        }
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const [result] = await connection.query(
        'INSERT INTO international_exhibition (country_name) VALUES (?)',
        [country_name.trim()]
      );
      
      const exhibitionId = result.insertId;
      
      if (cityNamesArray.length > 0) {
        for (let i = 0; i < cityNamesArray.length; i++) {
          const cityName = cityNamesArray[i]?.trim();
          const price = pricesArray[i];
          const imageFile = files[i];
          
          if (!cityName) {
            await connection.rollback();
            return res.status(400).json({ error: 'City name cannot be empty' });
          }
          
          if (!price || price <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Valid price is required for each city' });
          }
          
          await connection.query(
            'INSERT INTO international_exhibition_cities (international_exhibition_id, city_name, image, price) VALUES (?, ?, ?, ?)',
            [exhibitionId, cityName, imageFile.filename, price]
          );
        }
      }
      
      await connection.commit();
      
      res.json({ 
        message: 'International exhibition added successfully',
        id: exhibitionId 
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error adding international exhibition:', error);
      
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/exhibition/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error adding international exhibition' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Update international exhibition
router.put('/international/:id', (req, res) => {
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { id } = req.params;
      const { country_name, cityNames, prices, existingCityIds, existingImages } = req.body;
      const files = req.files || [];
      
      if (!country_name || country_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      let cityNamesArray = [];
      let pricesArray = [];
      let existingImagesArray = [];
      
      if (cityNames) cityNamesArray = JSON.parse(cityNames || '[]');
      if (prices) pricesArray = JSON.parse(prices || '[]');
      if (existingImages) existingImagesArray = JSON.parse(existingImages || '[]');
      
      if (cityNamesArray.length > 0) {
        if (cityNamesArray.length !== pricesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities and prices' });
        }
        
        const totalCities = cityNamesArray.length;
        const totalImages = existingImagesArray.length + files.length;
        
        if (totalCities !== totalImages) {
          return res.status(400).json({ error: 'Please ensure each city has an image' });
        }
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      await connection.query(
        'UPDATE international_exhibition SET country_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [country_name.trim(), id]
      );
      
      const [oldCities] = await connection.query(
        'SELECT id, image FROM international_exhibition_cities WHERE international_exhibition_id = ?',
        [id]
      );
      
      await connection.query('DELETE FROM international_exhibition_cities WHERE international_exhibition_id = ?', [id]);
      
      if (cityNamesArray.length > 0) {
        let fileIndex = 0;
        let existingImageIndex = 0;
        
        for (let i = 0; i < cityNamesArray.length; i++) {
          const cityName = cityNamesArray[i]?.trim();
          const price = pricesArray[i];
          
          if (!cityName) {
            await connection.rollback();
            return res.status(400).json({ error: 'City name cannot be empty' });
          }
          
          if (!price || price <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Valid price is required for each city' });
          }
          
          let imageFilename;
          
          if (existingImagesArray.length > 0 && existingImageIndex < existingImagesArray.length) {
            imageFilename = existingImagesArray[existingImageIndex];
            existingImageIndex++;
          } else if (files.length > 0 && fileIndex < files.length) {
            imageFilename = files[fileIndex].filename;
            fileIndex++;
          } else {
            await connection.rollback();
            return res.status(400).json({ error: 'Image missing for city: ' + cityName });
          }
          
          await connection.query(
            'INSERT INTO international_exhibition_cities (international_exhibition_id, city_name, image, price) VALUES (?, ?, ?, ?)',
            [id, cityName, imageFilename, price]
          );
        }
        
        const newImageFilenames = existingImagesArray.concat(files.map(f => f.filename));
        
        for (let oldCity of oldCities) {
          if (!newImageFilenames.includes(oldCity.image)) {
            const oldFilePath = path.join('uploads/exhibition/', oldCity.image);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          }
        }
      }
      
      await connection.commit();
      
      res.json({ message: 'International exhibition updated successfully' });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error updating international exhibition:', error);
      
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/exhibition/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error updating international exhibition' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Delete international exhibition
router.delete('/international/:id', async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    
    connection = await db.getConnection();
    
    const [cities] = await connection.query(
      'SELECT image FROM international_exhibition_cities WHERE international_exhibition_id = ?',
      [id]
    );
    
    for (let city of cities) {
      if (city.image) {
        const filePath = path.join('uploads/exhibition/', city.image);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
    
    await connection.query('DELETE FROM international_exhibition WHERE id = ?', [id]);
    
    res.json({ message: 'International exhibition deleted successfully' });
  } catch (error) {
    console.error('Error deleting international exhibition:', error);
    res.status(500).json({ error: 'Error deleting international exhibition' });
  } finally {
    if (connection) connection.release();
  }
});

// Bulk add domestic exhibitions (simple categories without cities)
router.post('/domestic/bulk', async (req, res) => {
  try {
    const { countries } = req.body;
    
    if (!Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: 'Countries array is required' });
    }
    
    const validCountries = countries
      .filter(country => country && country.trim() !== '')
      .map(country => country.trim());
    
    if (validCountries.length === 0) {
      return res.status(400).json({ error: 'No valid country names provided' });
    }
    
    const values = validCountries.map(country => [country]);
    const [result] = await db.query(
      'INSERT IGNORE INTO domestic_exhibition (country_name) VALUES ?',
      [values]
    );
    
    res.json({ 
      message: `Added ${result.affectedRows} domestic categories successfully`,
      added: result.affectedRows
    });
  } catch (error) {
    console.error('Error adding bulk domestic exhibitions:', error);
    res.status(500).json({ error: 'Error adding domestic exhibitions' });
  }
});

// Bulk add international exhibitions (simple categories without cities)
router.post('/international/bulk', async (req, res) => {
  try {
    const { countries } = req.body;
    
    if (!Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({ error: 'Countries array is required' });
    }
    
    const validCountries = countries
      .filter(country => country && country.trim() !== '')
      .map(country => country.trim());
    
    if (validCountries.length === 0) {
      return res.status(400).json({ error: 'No valid country names provided' });
    }
    
    const values = validCountries.map(country => [country]);
    const [result] = await db.query(
      'INSERT IGNORE INTO international_exhibition (country_name) VALUES ?',
      [values]
    );
    
    res.json({ 
      message: `Added ${result.affectedRows} international categories successfully`,
      added: result.affectedRows
    });
  } catch (error) {
    console.error('Error adding bulk international exhibitions:', error);
    res.status(500).json({ error: 'Error adding international exhibitions' });
  }
});

module.exports = router;