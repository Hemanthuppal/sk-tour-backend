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
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
});

const uploadMultiple = upload.array('images', 10);

// ========== ABOUT EXHIBITION ROUTES ==========
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
router.get('/domestic', async (req, res) => {
  console.log('📥 GET /domestic');
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

router.get('/domestic/:id', async (req, res) => {
  console.log(`📥 GET /domestic/${req.params.id}`);
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

router.post('/domestic', (req, res) => {
  console.log('📥 POST /domestic');
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
        'INSERT INTO domestic_exhibition (country_name) VALUES (?)',
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

router.put('/domestic/:id', (req, res) => {
  console.log(`📥 PUT /domestic/${req.params.id}`);
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { id } = req.params;
      const { country_name, cityNames, prices, existingImages } = req.body;
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
        'UPDATE domestic_exhibition SET country_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [country_name.trim(), id]
      );
      
      const [oldCities] = await connection.query(
        'SELECT id, image FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ?',
        [id]
      );
      
      await connection.query('DELETE FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ?', [id]);
      
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
            'INSERT INTO domestic_exhibition_cities (domestic_exhibition_id, city_name, image, price) VALUES (?, ?, ?, ?)',
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
      
      res.json({ message: 'Domestic exhibition updated successfully' });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error updating domestic exhibition:', error);
      
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

router.delete('/domestic/:id', async (req, res) => {
  console.log(`📥 DELETE /domestic/${req.params.id}`);
  let connection;
  try {
    const { id } = req.params;
    
    connection = await db.getConnection();
    
    const [cities] = await connection.query(
      'SELECT image FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ?',
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
router.get('/international', async (req, res) => {
  console.log('📥 GET /international');
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

router.get('/international/:id', async (req, res) => {
  console.log(`📥 GET /international/${req.params.id}`);
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

router.post('/international', (req, res) => {
  console.log('📥 POST /international');
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

router.put('/international/:id', (req, res) => {
  console.log(`📥 PUT /international/${req.params.id}`);
  uploadMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { id } = req.params;
      const { country_name, cityNames, prices, existingImages } = req.body;
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

router.delete('/international/:id', async (req, res) => {
  console.log(`📥 DELETE /international/${req.params.id}`);
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

router.post('/domestic/:id/details', async (req, res) => {
  const exhibitionId = req.params.id;
  const details = req.body;
  let connection;

  console.log('========================================');
  console.log('📥 POST /domestic/:id/details');
  console.log(`📌 Exhibition ID: ${exhibitionId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Verify exhibition exists
    const [exhibition] = await connection.query(
      'SELECT id, country_name FROM domestic_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      console.log(`❌ Exhibition not found with ID: ${exhibitionId}`);
      await connection.rollback();
      return res.status(404).json({ 
        error: `Exhibition not found with ID: ${exhibitionId}`,
        exhibition_id: exhibitionId
      });
    }

    console.log(`✅ Found exhibition: ${exhibition[0].country_name}`);

    // Check if entry exists in tours table
    const [existingTour] = await connection.query(
      'SELECT * FROM tours WHERE exhibition_id = ?',
      [exhibitionId]
    );

    if (existingTour.length === 0) {
      const tourCode = `EXH${exhibitionId}`;
      console.log(`Creating new tour entry with code: ${tourCode}`);
      await connection.query(
        `INSERT INTO tours 
        (tour_code, title, tour_type, duration_days, overview,
         base_price_adult, emi_price, cost_remarks, hotel_remarks,
         transport_remarks, emi_remarks, booking_poi_remarks, 
         cancellation_remarks, optional_tour_remarks, status, exhibition_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tourCode,
          details.exhibition_name || exhibition[0].country_name,
          'exhibition',
          details.duration_days || 0,
          details.overview || null,
          details.base_price_adult || 0,
          details.emi_price || null,
          details.cost_remarks || null,
          details.hotel_remarks || null,
          details.transport_remarks || null,
          details.emi_remarks || null,
          details.booking_poi_remarks || null,
          details.cancellation_remarks || null,
          details.optional_tour_remarks || null,
          1,
          exhibitionId
        ]
      );
      console.log(`✅ Created tour entry with exhibition_id: ${exhibitionId}`);
    } else {
      console.log(`Updating existing tour entry for exhibition: ${exhibitionId}`);
      await connection.query(
        `UPDATE tours SET 
          title = ?, duration_days = ?, overview = ?,
          base_price_adult = ?, emi_price = ?,
          cost_remarks = ?, hotel_remarks = ?, transport_remarks = ?,
          emi_remarks = ?, booking_poi_remarks = ?, cancellation_remarks = ?,
          optional_tour_remarks = ?, updated_at = NOW()
        WHERE exhibition_id = ?`,
        [
          details.exhibition_name || exhibition[0].country_name,
          details.duration_days || 0,
          details.overview || null,
          details.base_price_adult || 0,
          details.emi_price || null,
          details.cost_remarks || null,
          details.hotel_remarks || null,
          details.transport_remarks || null,
          details.emi_remarks || null,
          details.booking_poi_remarks || null,
          details.cancellation_remarks || null,
          details.optional_tour_remarks || null,
          exhibitionId
        ]
      );
      console.log(`✅ Updated tour entry for exhibition: ${exhibitionId}`);
    }

    // ITINERARIES
    await connection.query('DELETE FROM tour_itineraries WHERE exhibition_id = ?', [exhibitionId]);
    if (details.itineraries?.length) {
      const values = details.itineraries.map(i => [
        exhibitionId,
        i.day,
        i.title,
        i.description || null,
        i.meals || null
      ]);
      await connection.query(
        'INSERT INTO tour_itineraries (exhibition_id, day, title, description, meals) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} itineraries`);
    }

    // DEPARTURES
    await connection.query('DELETE FROM tour_departures WHERE exhibition_id = ?', [exhibitionId]);
    if (details.departures?.length) {
      const values = details.departures.map(d => [
        exhibitionId,
        d.description || null,
        null, null, 0, 0, null, null, null,
        'Available',
        'Exhibition',
        d.description || null
      ]);
      await connection.query(
        `INSERT INTO tour_departures 
        (exhibition_id, description, departure_date, return_date, 
         total_seats, booked_seats, adult_price, child_price, infant_price,
         status, tour_type, departure_text)
         VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} departures`);
    }

    // TOUR COSTS
    await connection.query('DELETE FROM tour_costs WHERE exhibition_id = ?', [exhibitionId]);
    if (details.tour_costs?.length) {
      const values = details.tour_costs.map(c => [
        exhibitionId,
        c.pax,
        c.standard_hotel || null,
        c.deluxe_hotel || null,
        c.executive_hotel || null,
        c.child_with_bed || null,
        c.child_no_bed || null,
        c.remarks || null
      ]);
      await connection.query(
        'INSERT INTO tour_costs (exhibition_id, pax, standard_hotel, deluxe_hotel, executive_hotel, child_with_bed, child_no_bed, remarks) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} cost rows`);
    }

    // OPTIONAL TOURS
    await connection.query('DELETE FROM optional_tours WHERE exhibition_id = ?', [exhibitionId]);
    if (details.optional_tours?.length) {
      const values = details.optional_tours.map(o => [
        exhibitionId,
        o.tour_name,
        o.adult_price || null,
        o.child_price || null
      ]);
      await connection.query(
        'INSERT INTO optional_tours (exhibition_id, tour_name, adult_price, child_price) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} optional tours`);
    }

    // EMI OPTIONS
    await connection.query('DELETE FROM emi_options WHERE exhibition_id = ?', [exhibitionId]);
    if (details.emi_options?.length && details.emi_loan_amount) {
      const values = details.emi_options.map(e => [
        exhibitionId,
        details.emi_loan_amount,
        e.particulars,
        e.months,
        e.emi
      ]);
      await connection.query(
        'INSERT INTO emi_options (exhibition_id, loan_amount, particulars, months, emi) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} EMI options`);
    }

    // INCLUSIONS
    await connection.query('DELETE FROM tour_inclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.inclusions?.length) {
      const values = details.inclusions.map(i => [exhibitionId, i]);
      await connection.query(
        'INSERT INTO tour_inclusions (exhibition_id, item) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} inclusions`);
    }

    // EXCLUSIONS
    await connection.query('DELETE FROM tour_exclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.exclusions?.length) {
      const values = details.exclusions.map(e => [exhibitionId, e]);
      await connection.query(
        'INSERT INTO tour_exclusions (exhibition_id, item) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} exclusions`);
    }

    // TRANSPORTS
    await connection.query('DELETE FROM tour_transports WHERE exhibition_id = ?', [exhibitionId]);
    if (details.transports?.length) {
      const values = details.transports.map((t, idx) => [
        t.description || null,
        idx + 1,
        exhibitionId
      ]);
      await connection.query(
        `INSERT INTO tour_transports 
        (description, sort_order, exhibition_id) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} transports`);
    }

    // HOTELS
    await connection.query('DELETE FROM tour_hotels WHERE exhibition_id = ?', [exhibitionId]);
    if (details.hotels?.length) {
      const values = details.hotels.map(h => [
        exhibitionId,
        h.city || null,
        h.nights || null,
        h.standard_hotel_name || null,
        h.deluxe_hotel_name || null,
        h.executive_hotel_name || null
      ]);
      await connection.query(
        `INSERT INTO tour_hotels 
        (exhibition_id, city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} hotels`);
    }

    // BOOKING POI
    await connection.query('DELETE FROM tour_booking_poi WHERE exhibition_id = ?', [exhibitionId]);
    if (details.booking_pois?.length) {
      const values = details.booking_pois.map((p, idx) => [
        exhibitionId,
        p.item,
        idx + 1,
        p.amount_details || null
      ]);
      await connection.query(
        `INSERT INTO tour_booking_poi 
        (exhibition_id, item, sort_order, amount_details) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} booking POIs`);
    }

    // CANCELLATION POLICIES
    await connection.query('DELETE FROM tour_cancellation_policies WHERE exhibition_id = ?', [exhibitionId]);
    if (details.cancellation_policies?.length) {
      const values = details.cancellation_policies.map((c, idx) => [
        exhibitionId,
        c.cancellation_policy || null,
        idx + 1,
        c.charges || null
      ]);
      await connection.query(
        `INSERT INTO tour_cancellation_policies 
        (exhibition_id, cancellation_policy, sort_order, charges) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} cancellation policies`);
    }

    // INSTRUCTIONS
    await connection.query('DELETE FROM tour_instructions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.instructions?.length) {
      const values = details.instructions.map((i, idx) => [
        exhibitionId,
        i,
        idx + 1
      ]);
      await connection.query(
        'INSERT INTO tour_instructions (exhibition_id, item, sort_order) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} instructions`);
    }

    await connection.commit();

    console.log('========================================');
    console.log('✅ EXHIBITION DETAILS SAVED SUCCESSFULLY!');
    console.log(`📌 Exhibition ID: ${exhibitionId}`);
    console.log('========================================');

    res.json({ 
      success: true, 
      message: 'Exhibition details saved successfully',
      exhibition_id: exhibitionId
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('❌ Error saving exhibition details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.post('/international/:id/details', async (req, res) => {
  const exhibitionId = req.params.id;
  const details = req.body;
  let connection;

  console.log('========================================');
  console.log('📥 POST /international/:id/details');
  console.log(`📌 Exhibition ID: ${exhibitionId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // ✅ Check exhibition
    const [exhibition] = await connection.query(
      'SELECT id, country_name FROM international_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: `Exhibition not found with ID: ${exhibitionId}`
      });
    }

    // ✅ Check or create tour
    const [existingTour] = await connection.query(
      'SELECT * FROM tours WHERE exhibition_id = ?',
      [exhibitionId]
    );

    let tourId;

    if (existingTour.length === 0) {
      const tourCode = `INTEXH${exhibitionId}`;

      const [result] = await connection.query(
        `INSERT INTO tours 
        (tour_code, title, tour_type, duration_days, overview,
         base_price_adult, emi_price, cost_remarks, hotel_remarks,
         transport_remarks, emi_remarks, booking_poi_remarks, 
         cancellation_remarks, optional_tour_remarks, status, exhibition_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tourCode,
          details.exhibition_name || exhibition[0].country_name,
          'exhibition',
          details.duration_days || 0,
          details.overview || null,
          details.base_price_adult || 0,
          details.emi_price || null,
          details.cost_remarks || null,
          details.hotel_remarks || null,
          details.transport_remarks || null,
          details.emi_remarks || null,
          details.booking_poi_remarks || null,
          details.cancellation_remarks || null,
          details.optional_tour_remarks || null,
          1,
          exhibitionId
        ]
      );

      tourId = result.insertId; // ✅ GET tour_id
    } else {
      tourId = existingTour[0].id; // ✅ EXISTING tour_id

      await connection.query(
        `UPDATE tours SET 
          title = ?, duration_days = ?, overview = ?,
          base_price_adult = ?, emi_price = ?,
          cost_remarks = ?, hotel_remarks = ?, transport_remarks = ?,
          emi_remarks = ?, booking_poi_remarks = ?, cancellation_remarks = ?,
          optional_tour_remarks = ?, updated_at = NOW()
        WHERE exhibition_id = ?`,
        [
          details.exhibition_name || exhibition[0].country_name,
          details.duration_days || 0,
          details.overview || null,
          details.base_price_adult || 0,
          details.emi_price || null,
          details.cost_remarks || null,
          details.hotel_remarks || null,
          details.transport_remarks || null,
          details.emi_remarks || null,
          details.booking_poi_remarks || null,
          details.cancellation_remarks || null,
          details.optional_tour_remarks || null,
          exhibitionId
        ]
      );
    }
    
    // Process all sections (same as domestic - remove tour_id from INSERT statements)
    
    // ITINERARIES
    await connection.query('DELETE FROM tour_itineraries WHERE exhibition_id = ?', [exhibitionId]);
    if (details.itineraries && Array.isArray(details.itineraries) && details.itineraries.length > 0) {
      const values = details.itineraries.map(i => [
        exhibitionId,  // exhibition_id
        i.day,
        i.title,
        i.description || null,
        i.meals || null
      ]);
      await connection.query(
        'INSERT INTO tour_itineraries (exhibition_id, day, title, description, meals) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} itineraries`);
    }
    
    // DEPARTURES
    await connection.query('DELETE FROM tour_departures WHERE exhibition_id = ?', [exhibitionId]);
    if (details.departures && Array.isArray(details.departures) && details.departures.length > 0) {
      const values = details.departures.map(d => [
        exhibitionId,
        d.description || null,
        null, null, 0, 0, null, null, null,
        'Available',
        'Exhibition',
        null,
        null,
        d.description || null
      ]);
      await connection.query(
        `INSERT INTO tour_departures 
        (exhibition_id, description, departure_date, return_date, total_seats, booked_seats, adult_price, child_price, infant_price, status, tour_type, start_date, end_date, departure_text)
        VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} departures`);
    }
    
    // TOUR COSTS - FIXED: Remove tour_id from INSERT
    await connection.query('DELETE FROM tour_costs WHERE exhibition_id = ?', [exhibitionId]);
    if (details.tour_costs && Array.isArray(details.tour_costs) && details.tour_costs.length > 0) {
      const values = details.tour_costs.map(c => [
        exhibitionId,  // exhibition_id (not tour_id)
        c.pax,
        c.standard_hotel || null,
        c.deluxe_hotel || null,
        c.executive_hotel || null,
        c.child_with_bed || null,
        c.child_no_bed || null,
        c.remarks || null
      ]);
      await connection.query(
        'INSERT INTO tour_costs (exhibition_id, pax, standard_hotel, deluxe_hotel, executive_hotel, child_with_bed, child_no_bed, remarks) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} cost rows`);
    }
    
    // OPTIONAL TOURS
    await connection.query('DELETE FROM optional_tours WHERE exhibition_id = ?', [exhibitionId]);
    if (details.optional_tours && Array.isArray(details.optional_tours) && details.optional_tours.length > 0) {
      const values = details.optional_tours.map(o => [
        exhibitionId,
        o.tour_name,
        o.adult_price || null,
        o.child_price || null
      ]);
      await connection.query(
        'INSERT INTO optional_tours (exhibition_id, tour_name, adult_price, child_price) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} optional tours`);
    }
    
    // EMI OPTIONS
    await connection.query('DELETE FROM emi_options WHERE exhibition_id = ?', [exhibitionId]);
    if (details.emi_options && Array.isArray(details.emi_options) && details.emi_options.length > 0 && details.emi_loan_amount) {
      const values = details.emi_options.map(e => [
        exhibitionId,
        details.emi_loan_amount,
        e.particulars,
        e.months,
        e.emi
      ]);
      await connection.query(
        'INSERT INTO emi_options (exhibition_id, loan_amount, particulars, months, emi) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} EMI options`);
    }
    
    // INCLUSIONS
    await connection.query('DELETE FROM tour_inclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.inclusions && Array.isArray(details.inclusions) && details.inclusions.length > 0) {
      const values = details.inclusions.map(i => [
        exhibitionId,
        i
      ]);
      await connection.query(
        'INSERT INTO tour_inclusions (exhibition_id, item) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} inclusions`);
    }
    
    // EXCLUSIONS
    await connection.query('DELETE FROM tour_exclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.exclusions && Array.isArray(details.exclusions) && details.exclusions.length > 0) {
      const values = details.exclusions.map(e => [
        exhibitionId,
        e
      ]);
      await connection.query(
        'INSERT INTO tour_exclusions (exhibition_id, item) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} exclusions`);
    }
    
    // TRANSPORTS
    await connection.query('DELETE FROM tour_transports WHERE exhibition_id = ?', [exhibitionId]);
    if (details.transports && Array.isArray(details.transports) && details.transports.length > 0) {
      const values = details.transports.map((t, idx) => [
        t.description || null,
        idx + 1,
        exhibitionId
      ]);
      await connection.query(
        `INSERT INTO tour_transports 
        (description, sort_order, exhibition_id) 
        VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} transports`);
    }
    
    // HOTELS
    await connection.query('DELETE FROM tour_hotels WHERE exhibition_id = ?', [exhibitionId]);
    if (details.hotels && Array.isArray(details.hotels) && details.hotels.length > 0) {
      const values = details.hotels.map(h => [
        exhibitionId,
        h.city || null,
        h.nights || null,
        h.standard_hotel_name || null,
        h.deluxe_hotel_name || null,
        h.executive_hotel_name || null
      ]);
      await connection.query(
        `INSERT INTO tour_hotels (exhibition_id, city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} hotels`);
    }
    
    // BOOKING POI
    await connection.query('DELETE FROM tour_booking_poi WHERE exhibition_id = ?', [exhibitionId]);
    if (details.booking_pois && Array.isArray(details.booking_pois) && details.booking_pois.length > 0) {
      const values = details.booking_pois.map((p, idx) => [
        exhibitionId,
        p.item,
        idx + 1,
        p.amount_details || null
      ]);
      await connection.query(
        `INSERT INTO tour_booking_poi 
        (exhibition_id, item, sort_order, amount_details) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} booking POIs`);
    }
    
    // CANCELLATION POLICIES
    await connection.query('DELETE FROM tour_cancellation_policies WHERE exhibition_id = ?', [exhibitionId]);
    if (details.cancellation_policies && Array.isArray(details.cancellation_policies) && details.cancellation_policies.length > 0) {
      const values = details.cancellation_policies.map((c, idx) => [
        exhibitionId,
        c.cancellation_policy || null,
        idx + 1,
        c.charges || null
      ]);
      await connection.query(
        `INSERT INTO tour_cancellation_policies (exhibition_id, cancellation_policy, sort_order, charges) VALUES ?`,
        [values]
      );
      console.log(`✅ Inserted ${values.length} cancellation policies`);
    }
    
    // INSTRUCTIONS
    await connection.query('DELETE FROM tour_instructions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.instructions && Array.isArray(details.instructions) && details.instructions.length > 0) {
      const values = details.instructions.map((i, idx) => [
        exhibitionId,
        i,
        idx + 1
      ]);
      await connection.query(
        'INSERT INTO tour_instructions (exhibition_id, item, sort_order) VALUES ?',
        [values]
      );
      console.log(`✅ Inserted ${values.length} instructions`);
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'International exhibition details saved successfully'
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});
    
    // ========== GET EXHIBITION DETAILS ==========
    router.get('/domestic/:id/details', async (req, res) => {
      const exhibitionId = req.params.id;
      let connection;
    
      console.log('========================================');
      console.log('📥 GET /domestic/:id/details');
      console.log(`📌 Exhibition ID: ${exhibitionId}`);
      console.log('========================================');
    
      try {
        connection = await db.getConnection();
    
        // Verify exhibition exists
        const [exhibition] = await connection.query(
          'SELECT id, country_name FROM domestic_exhibition WHERE id = ?',
          [exhibitionId]
        );
    
        if (exhibition.length === 0) {
          return res.status(404).json({ 
            error: `Exhibition not found with ID: ${exhibitionId}`,
            exhibition_id: exhibitionId
          });
        }
    
        const result = { exhibition: exhibition[0] };
    
        // Fetch related tables
        const tables = [
          'tours', 'tour_itineraries', 'tour_departures', 'tour_costs',
          'optional_tours', 'emi_options', 'tour_inclusions', 'tour_exclusions',
          'tour_transports', 'tour_hotels', 'tour_booking_poi',
          'tour_cancellation_policies', 'tour_instructions'
        ];
    
        for (const table of tables) {
          let rows;
    
          if (table === 'tours') {
            [rows] = await connection.query(
              `SELECT t.*, GROUP_CONCAT(c.city_name) AS city_name
               FROM tours t
               LEFT JOIN domestic_exhibition_cities c 
               ON t.exhibition_id = c.domestic_exhibition_id 
               WHERE t.exhibition_id = ?
               GROUP BY t.tour_id`,
              [exhibitionId]
            );
          } else {
            [rows] = await connection.query(
              `SELECT * FROM ${table} WHERE exhibition_id = ?`,
              [exhibitionId]
            );
          }
    
          const key = table.replace(/tour_|_/g, (match) => match === '_' ? '' : '');
          result[key] = rows;
        }
    
        res.json({ success: true, data: result });
    
      } catch (err) {
        console.error('❌ Error fetching exhibition details:', err);
        res.status(500).json({ error: err.message });
      } finally {
        if (connection) connection.release();
      }
    });
    
    // ========== TOUR DATA ROUTE ==========
    router.get('/tour-data/:exhibition_id', async (req, res) => {
      const exhibitionId = req.params.exhibition_id;
      const type = req.query.type;
      let connection;
    
      console.log('========================================');
      console.log('📥 GET /tour-data/:exhibition_id');
      console.log(`📌 Exhibition ID: ${exhibitionId}, Type: ${type}`);
      console.log('========================================');
    
      try {
        connection = await db.getConnection();
    
        const result = {};
    
        // Fetch all related data
        const tables = [
          'tours', 'tour_itineraries', 'tour_departures', 'tour_costs',
          'optional_tours', 'emi_options', 'tour_inclusions', 'tour_exclusions',
          'tour_transports', 'tour_hotels', 'tour_booking_poi',
          'tour_cancellation_policies', 'tour_instructions'
        ];
    
        for (const table of tables) {
          let rows;
          
          if (table === 'tours') {
            [rows] = await connection.query(
              'SELECT * FROM tours WHERE exhibition_id = ?',
              [exhibitionId]
            );
          } else {
            [rows] = await connection.query(
              `SELECT * FROM ${table} WHERE exhibition_id = ?`,
              [exhibitionId]
            );
          }
          
          const key = table.replace(/tour_/g, '').replace(/_/g, '');
          result[key] = rows || [];
        }
    
        console.log(`✅ Retrieved tour data for exhibition ${exhibitionId}`);
        res.json(result);
    
      } catch (err) {
        console.error('❌ Error fetching tour data:', err);
        res.status(500).json({ error: err.message });
      } finally {
        if (connection) connection.release();
      }
    });

// ========== BULK ROUTES ==========
router.post('/domestic/bulk', async (req, res) => {
  console.log('📥 POST /domestic/bulk');
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

router.post('/international/bulk', async (req, res) => {
  console.log('📥 POST /international/bulk');
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

// ========== IMAGE ROUTES ==========
router.post('/exhibition-images/upload/:exhibition_id', uploadMultiple, async (req, res) => {
  const exhibitionId = req.params.exhibition_id;
  const files = req.files || [];
  
  console.log(`📥 POST /exhibition-images/upload/${exhibitionId}`);
  
  if (!files.length) {
    return res.status(400).json({ message: "No files uploaded" });
  }
  
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/exhibition/`;
    
    const values = files.map(file => [
      null,
      exhibitionId,
      baseUrl + file.filename,
      null,
      0
    ]);
    
    await connection.query(
      'INSERT INTO tour_images (tour_id, exhibition_id, url, caption, is_cover) VALUES ?',
      [values]
    );
    
    await connection.commit();
    
    res.status(201).json({
      message: `${files.length} image(s) uploaded successfully`,
      uploaded: files.map(f => baseUrl + f.filename)
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error uploading images:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

router.put('/exhibition-images/cover/:image_id', async (req, res) => {
  console.log(`📥 PUT /exhibition-images/cover/${req.params.image_id}`);
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [img] = await connection.query(
      'SELECT exhibition_id FROM tour_images WHERE image_id = ?',
      [req.params.image_id]
    );
    
    if (img.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    
    await connection.query(
      'UPDATE tour_images SET is_cover = 0 WHERE exhibition_id = ?',
      [img[0].exhibition_id]
    );
    
    await connection.query(
      'UPDATE tour_images SET is_cover = 1 WHERE image_id = ?',
      [req.params.image_id]
    );
    
    await connection.commit();
    res.json({ message: "Cover image updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error('Error setting cover image:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

router.delete('/exhibition-images/:image_id', async (req, res) => {
  console.log(`📥 DELETE /exhibition-images/${req.params.image_id}`);
  try {
    const [img] = await db.query(
      'SELECT url FROM tour_images WHERE image_id = ?',
      [req.params.image_id]
    );
    
    if (img.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    
    const urlPath = img[0].url;
    const filename = urlPath.split('/').pop();
    const filePath = path.join('uploads/exhibition/', filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    await db.query('DELETE FROM tour_images WHERE image_id = ?', [req.params.image_id]);
    
    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/exhibition-images/:exhibition_id', async (req, res) => {
  console.log(`📥 GET /exhibition-images/${req.params.exhibition_id}`);
  try {
    const [rows] = await db.query(
      'SELECT * FROM tour_images WHERE exhibition_id = ? ORDER BY is_cover DESC, image_id ASC',
      [req.params.exhibition_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ error: err.message });
  }
});




// GET exhibition details
router.get('/domestic/:id/details', async (req, res) => {
  const exhibitionId = req.params.id;
  let connection;

  console.log('========================================');
  console.log('📥 GET /domestic/:id/details');
  console.log(`📌 Exhibition ID: ${exhibitionId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();

    // Verify exhibition exists
    const [exhibition] = await connection.query(
      'SELECT id, country_name FROM domestic_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      return res.status(404).json({ 
        error: `Exhibition not found with ID: ${exhibitionId}`,
        exhibition_id: exhibitionId
      });
    }

    const result = { exhibition: exhibition[0] };

    // Fetch related tables
    const tables = [
      'tours', 'tour_itineraries', 'tour_departures', 'tour_costs',
      'optional_tours', 'emi_options', 'tour_inclusions', 'tour_exclusions',
      'tour_transports', 'tour_hotels', 'tour_booking_poi',
      'tour_cancellation_policies', 'tour_instructions'
    ];

  for (const table of tables) {
  let rows;

  // ✅ ONLY CHANGE FOR tours
  if (table === 'tours') {
    [rows] = await connection.query(
      `SELECT t.*, GROUP_CONCAT(c.city_name) AS city_name
       FROM tours t
       LEFT JOIN domestic_exhibition_cities c 
       ON t.exhibition_id = c.domestic_exhibition_id 
       WHERE t.exhibition_id = ?
       GROUP BY t.tour_id`,
      [exhibitionId]
    );
  } else {
    // ✅ SAME OLD QUERY
    [rows] = await connection.query(
      `SELECT * FROM ${table} WHERE exhibition_id = ?`,
      [exhibitionId]
    );
  }

  const key = table.replace(/tour_|_/g, (match) => match === '_' ? '' : '');
  result[key] = rows;
}

    res.json({ success: true, data: result });

  } catch (err) {
    console.error('❌ Error fetching exhibition details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});


// ========== TOUR DATA ROUTE ==========
router.get('/tour-data/:exhibition_id', async (req, res) => {
  const exhibitionId = req.params.exhibition_id;
  const type = req.query.type;
  let connection;

  console.log('========================================');
  console.log('📥 GET /tour-data/:exhibition_id');
  console.log(`📌 Exhibition ID: ${exhibitionId}, Type: ${type}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();

    const result = {};

    // Fetch all related data
    const tables = [
      'tours', 'tour_itineraries', 'tour_departures', 'tour_costs',
      'optional_tours', 'emi_options', 'tour_inclusions', 'tour_exclusions',
      'tour_transports', 'tour_hotels', 'tour_booking_poi',
      'tour_cancellation_policies', 'tour_instructions'
    ];

    for (const table of tables) {
      let rows;
      
      if (table === 'tours') {
        [rows] = await connection.query(
          'SELECT * FROM tours WHERE exhibition_id = ?',
          [exhibitionId]
        );
      } else {
        [rows] = await connection.query(
          `SELECT * FROM ${table} WHERE exhibition_id = ?`,
          [exhibitionId]
        );
      }
      
      // Convert table name to camelCase for response
      const key = table.replace(/tour_/g, '').replace(/_/g, '');
      result[key] = rows || [];
    }

    console.log(`✅ Retrieved tour data for exhibition ${exhibitionId}`);
    res.json(result);

  } catch (err) {
    console.error('❌ Error fetching tour data:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// ========== UPDATE COVER IMAGE ==========
router.put('/exhibition-images/cover/:image_id', async (req, res) => {
  console.log(`📥 PUT /exhibition-images/cover/${req.params.image_id}`);
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [img] = await connection.query(
      'SELECT exhibition_id FROM tour_images WHERE image_id = ?',
      [req.params.image_id]
    );
    
    if (img.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    
    await connection.query(
      'UPDATE tour_images SET is_cover = 0 WHERE exhibition_id = ?',
      [img[0].exhibition_id]
    );
    
    await connection.query(
      'UPDATE tour_images SET is_cover = 1 WHERE image_id = ?',
      [req.params.image_id]
    );
    
    await connection.commit();
    res.json({ message: "Cover image updated successfully" });
  } catch (err) {
    await connection.rollback();
    console.error('Error setting cover image:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ========== GET EXHIBITION IMAGES ==========
router.get('/exhibition-images/:exhibition_id', async (req, res) => {
  console.log(`📥 GET /exhibition-images/${req.params.exhibition_id}`);
  try {
    const [rows] = await db.query(
      'SELECT * FROM tour_images WHERE exhibition_id = ? ORDER BY is_cover DESC, image_id ASC',
      [req.params.exhibition_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== UPLOAD EXHIBITION IMAGES ==========
router.post('/exhibition-images/upload/:exhibition_id', uploadMultiple, async (req, res) => {
  const exhibitionId = req.params.exhibition_id;
  const files = req.files || [];
  
  console.log(`📥 POST /exhibition-images/upload/${exhibitionId}`);
  console.log(`Files received: ${files.length}`);
  
  if (!files.length) {
    return res.status(400).json({ message: "No files uploaded" });
  }
  
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/exhibition/`;
    
    const values = files.map(file => [
      null, // tour_id
      exhibitionId,
      baseUrl + file.filename,
      null, // caption
      0    // is_cover
    ]);
    
    await connection.query(
      'INSERT INTO tour_images (tour_id, exhibition_id, url, caption, is_cover) VALUES ?',
      [values]
    );
    
    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: `${files.length} image(s) uploaded successfully`,
      uploaded: files.map(f => baseUrl + f.filename)
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error uploading images:', err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// ========== DELETE EXHIBITION IMAGE ==========
router.delete('/exhibition-images/:image_id', async (req, res) => {
  console.log(`📥 DELETE /exhibition-images/${req.params.image_id}`);
  try {
    const [img] = await db.query(
      'SELECT url FROM tour_images WHERE image_id = ?',
      [req.params.image_id]
    );
    
    if (img.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    
    const urlPath = img[0].url;
    const filename = urlPath.split('/').pop();
    const filePath = path.join('uploads/exhibition/', filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    await db.query('DELETE FROM tour_images WHERE image_id = ?', [req.params.image_id]);
    
    res.json({ message: "Image deleted successfully" });
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).json({ error: err.message });
  }
});


// ========== GET INTERNATIONAL EXHIBITION DETAILS ==========
router.get('/international/:id/details', async (req, res) => {
  const exhibitionId = req.params.id;
  let connection;

  console.log('========================================');
  console.log('📥 GET /international/:id/details');
  console.log(`📌 Exhibition ID: ${exhibitionId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();

    // Verify international exhibition exists
    const [exhibition] = await connection.query(
      'SELECT id, country_name FROM international_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      return res.status(404).json({ 
        error: `International exhibition not found with ID: ${exhibitionId}`,
        exhibition_id: exhibitionId
      });
    }

    const result = { exhibition: exhibition[0] };

    // Fetch related tables
    const tables = [
      'tours', 'tour_itineraries', 'tour_departures', 'tour_costs',
      'optional_tours', 'emi_options', 'tour_inclusions', 'tour_exclusions',
      'tour_transports', 'tour_hotels', 'tour_booking_poi',
      'tour_cancellation_policies', 'tour_instructions'
    ];

    for (const table of tables) {
      let rows;

      if (table === 'tours') {
        [rows] = await connection.query(
          `SELECT t.*, GROUP_CONCAT(c.city_name) AS city_name
           FROM tours t
           LEFT JOIN international_exhibition_cities c 
           ON t.exhibition_id = c.international_exhibition_id 
           WHERE t.exhibition_id = ?
           GROUP BY t.tour_id`,
          [exhibitionId]
        );
      } else {
        [rows] = await connection.query(
          `SELECT * FROM ${table} WHERE exhibition_id = ?`,
          [exhibitionId]
        );
      }

      const key = table.replace(/tour_|_/g, (match) => match === '_' ? '' : '');
      result[key] = rows;
    }

    // Transform the response to match the structure shown in your example
    const transformedResponse = {
      success: true,
      data: {
        exhibition: result.exhibition,
        tours: result.tours || [],
        itineraries: result.itineraries || [],
        departures: result.departures || [],
        costs: result.costs || [],
        optionaltours: result.optionaltours || [],
        emioptions: result.emioptions || [],
        inclusions: result.inclusions || [],
        exclusions: result.exclusions || [],
        transports: result.transports || [],
        hotels: result.hotels || [],
        bookingpoi: result.bookingpoi || [],
        cancellationpolicies: result.cancellationpolicies || [],
        instructions: result.instructions || []
      }
    };

    res.json(transformedResponse);

  } catch (err) {
    console.error('❌ Error fetching international exhibition details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;