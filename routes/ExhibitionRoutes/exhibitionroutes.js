const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');

// Configure multer for exhibition image uploads
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

// Configure multer for visa file uploads
const visaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/exhibition/visa/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'visa-' + uniqueSuffix + path.extname(file.originalname));
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
const uploadVisaFile = multer({ 
  storage: visaStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image, PDF and Word documents are allowed!'));
  }
}).single('file');

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
        'SELECT id, state_name, city_name, image, price FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ? ORDER BY created_at',
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
      'SELECT id, state_name, city_name, image, price FROM domestic_exhibition_cities WHERE domestic_exhibition_id = ? ORDER BY created_at',
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
      const { domestic_category_name, stateNames, cityNames, prices } = req.body;
      const files = req.files || [];
      
      if (!domestic_category_name || domestic_category_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      let stateNamesArray = [];
      let cityNamesArray = [];
      let pricesArray = [];
      
      if (stateNames) {
        try {
          stateNamesArray = JSON.parse(stateNames);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid state names format' });
        }
      }
      
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
        if (cityNamesArray.length !== pricesArray.length || cityNamesArray.length !== stateNamesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities, states, and prices' });
        }
        
        if (cityNamesArray.length !== files.length) {
          return res.status(400).json({ error: 'Please upload an image for each city' });
        }
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const [result] = await connection.query(
        'INSERT INTO domestic_exhibition (domestic_category_name) VALUES (?)',
        [domestic_category_name.trim()]
      );
      
      const exhibitionId = result.insertId;
      
      if (cityNamesArray.length > 0) {
        for (let i = 0; i < cityNamesArray.length; i++) {
          const stateName = stateNamesArray[i]?.trim();
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
            'INSERT INTO domestic_exhibition_cities (domestic_exhibition_id, state_name, city_name, image, price) VALUES (?, ?, ?, ?, ?)',
            [exhibitionId, stateName, cityName, imageFile.filename, price]
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
      const { domestic_category_name, stateNames, cityNames, prices, existingImages, existingCityIds } = req.body;
      const files = req.files || [];
      
      if (!domestic_category_name || domestic_category_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      let stateNamesArray = [];
      let cityNamesArray = [];
      let pricesArray = [];
      let existingImagesArray = [];
      let existingCityIdsArray = [];
      
      if (stateNames) stateNamesArray = JSON.parse(stateNames || '[]');
      if (cityNames) cityNamesArray = JSON.parse(cityNames || '[]');
      if (prices) pricesArray = JSON.parse(prices || '[]');
      if (existingImages) existingImagesArray = JSON.parse(existingImages || '[]');
      if (existingCityIds) existingCityIdsArray = JSON.parse(existingCityIds || '[]');
      
      if (cityNamesArray.length > 0) {
        if (cityNamesArray.length !== pricesArray.length || cityNamesArray.length !== stateNamesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities, states, and prices' });
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
        'UPDATE domestic_exhibition SET domestic_category_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [domestic_category_name.trim(), id]
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
          const stateName = stateNamesArray[i]?.trim();
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
            'INSERT INTO domestic_exhibition_cities (domestic_exhibition_id, state_name, city_name, image, price) VALUES (?, ?, ?, ?, ?)',
            [id, stateName, cityName, imageFilename, price]
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
        'SELECT id, country_name, city_name, image, price FROM international_exhibition_cities WHERE international_exhibition_id = ? ORDER BY created_at',
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
      'SELECT id, country_name, city_name, image, price FROM international_exhibition_cities WHERE international_exhibition_id = ? ORDER BY created_at',
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
      const { international_category_name, countryNames, cityNames, prices } = req.body;
      const files = req.files || [];
      
      if (!international_category_name || international_category_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      let countryNamesArray = [];
      let cityNamesArray = [];
      let pricesArray = [];
      
      if (countryNames) {
        try {
          countryNamesArray = JSON.parse(countryNames);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid country names format' });
        }
      }
      
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
        if (cityNamesArray.length !== pricesArray.length || cityNamesArray.length !== countryNamesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities, countries, and prices' });
        }
        
        if (cityNamesArray.length !== files.length) {
          return res.status(400).json({ error: 'Please upload an image for each city' });
        }
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const [result] = await connection.query(
        'INSERT INTO international_exhibition (international_category_name) VALUES (?)',
        [international_category_name.trim()]
      );
      
      const exhibitionId = result.insertId;
      
      if (cityNamesArray.length > 0) {
        for (let i = 0; i < cityNamesArray.length; i++) {
          const countryName = countryNamesArray[i]?.trim();
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
            'INSERT INTO international_exhibition_cities (international_exhibition_id, country_name, city_name, image, price) VALUES (?, ?, ?, ?, ?)',
            [exhibitionId, countryName, cityName, imageFile.filename, price]
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
      const { international_category_name, countryNames, cityNames, prices, existingImages, existingCityIds } = req.body;
      const files = req.files || [];
      
      if (!international_category_name || international_category_name.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
      }
      
      let countryNamesArray = [];
      let cityNamesArray = [];
      let pricesArray = [];
      let existingImagesArray = [];
      let existingCityIdsArray = [];
      
      if (countryNames) countryNamesArray = JSON.parse(countryNames || '[]');
      if (cityNames) cityNamesArray = JSON.parse(cityNames || '[]');
      if (prices) pricesArray = JSON.parse(prices || '[]');
      if (existingImages) existingImagesArray = JSON.parse(existingImages || '[]');
      if (existingCityIds) existingCityIdsArray = JSON.parse(existingCityIds || '[]');
      
      if (cityNamesArray.length > 0) {
        if (cityNamesArray.length !== pricesArray.length || cityNamesArray.length !== countryNamesArray.length) {
          return res.status(400).json({ error: 'Mismatch between cities, countries, and prices' });
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
        'UPDATE international_exhibition SET international_category_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [international_category_name.trim(), id]
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
          const countryName = countryNamesArray[i]?.trim();
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
            'INSERT INTO international_exhibition_cities (international_exhibition_id, country_name, city_name, image, price) VALUES (?, ?, ?, ?, ?)',
            [id, countryName, cityName, imageFilename, price]
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

// ========== BULK ROUTES ==========
router.post('/domestic/bulk', async (req, res) => {
  console.log('📥 POST /domestic/bulk');
  try {
    const { categories } = req.body;
    
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'Categories array is required' });
    }
    
    const validCategories = categories
      .filter(cat => cat && cat.trim() !== '')
      .map(cat => cat.trim());
    
    if (validCategories.length === 0) {
      return res.status(400).json({ error: 'No valid category names provided' });
    }
    
    const values = validCategories.map(cat => [cat]);
    const [result] = await db.query(
      'INSERT IGNORE INTO domestic_exhibition (domestic_category_name) VALUES ?',
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
    const { categories } = req.body;
    
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'Categories array is required' });
    }
    
    const validCategories = categories
      .filter(cat => cat && cat.trim() !== '')
      .map(cat => cat.trim());
    
    if (validCategories.length === 0) {
      return res.status(400).json({ error: 'No valid category names provided' });
    }
    
    const values = validCategories.map(cat => [cat]);
    const [result] = await db.query(
      'INSERT IGNORE INTO international_exhibition (international_category_name) VALUES ?',
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

// ========== VISA FILE UPLOAD ROUTE ==========
router.post('/upload-visa-file', uploadVisaFile, async (req, res) => {
  try {
    console.log('📤 Visa file upload request:', {
      file: req.file ? req.file.originalname : 'No file'
    });

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded or invalid file type' 
      });
    }

    const fileName = req.file.filename;
    const fileUrl = `/uploads/exhibition/visa/${fileName}`;

    res.json({
      success: true,
      fileName: fileName,
      fileUrl: fileUrl,
      originalName: req.file.originalname,
      message: 'File uploaded successfully'
    });

  } catch (err) {
    console.error('❌ Visa file upload error:', err);
    
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      success: false, 
      error: err.message,
      details: 'Failed to upload visa file'
    });
  }
});

// ========== EXHIBITION DETAILS ROUTES ==========
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

    const [exhibition] = await connection.query(
      'SELECT id, domestic_category_name FROM domestic_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      await connection.rollback();
      return res.status(404).json({ 
        error: `Exhibition not found with ID: ${exhibitionId}`
      });
    }

    const [existingTour] = await connection.query(
      'SELECT * FROM tours WHERE exhibition_id = ?',
      [exhibitionId]
    );

    if (existingTour.length === 0) {
      const tourCode = `EXH${exhibitionId}`;
      await connection.query(
        `INSERT INTO tours 
        (tour_code, title, tour_type, duration_days, overview,
         base_price_adult, emi_price, cost_remarks, hotel_remarks,
         transport_remarks, emi_remarks, booking_poi_remarks, 
         cancellation_remarks, optional_tour_remarks, status, exhibition_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tourCode,
          details.exhibition_name || exhibition[0].domestic_category_name,
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
    } else {
      await connection.query(
        `UPDATE tours SET 
          title = ?, duration_days = ?, overview = ?,
          base_price_adult = ?, emi_price = ?,
          cost_remarks = ?, hotel_remarks = ?, transport_remarks = ?,
          emi_remarks = ?, booking_poi_remarks = ?, cancellation_remarks = ?,
          optional_tour_remarks = ?, updated_at = NOW()
        WHERE exhibition_id = ?`,
        [
          details.exhibition_name || exhibition[0].domestic_category_name,
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
    }

    // INCLUSIONS
    await connection.query('DELETE FROM tour_inclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.inclusions?.length) {
      const values = details.inclusions.map(i => [exhibitionId, i]);
      await connection.query(
        'INSERT INTO tour_inclusions (exhibition_id, item) VALUES ?',
        [values]
      );
    }

    // EXCLUSIONS
    await connection.query('DELETE FROM tour_exclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.exclusions?.length) {
      const values = details.exclusions.map(e => [exhibitionId, e]);
      await connection.query(
        'INSERT INTO tour_exclusions (exhibition_id, item) VALUES ?',
        [values]
      );
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
    }

    await connection.commit();

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

    const [exhibition] = await connection.query(
      'SELECT id, international_category_name FROM international_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: `Exhibition not found with ID: ${exhibitionId}`
      });
    }

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
          details.exhibition_name || exhibition[0].international_category_name,
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
      tourId = result.insertId;
    } else {
      tourId = existingTour[0].tour_id;
      await connection.query(
        `UPDATE tours SET 
          title = ?, duration_days = ?, overview = ?,
          base_price_adult = ?, emi_price = ?,
          cost_remarks = ?, hotel_remarks = ?, transport_remarks = ?,
          emi_remarks = ?, booking_poi_remarks = ?, cancellation_remarks = ?,
          optional_tour_remarks = ?, updated_at = NOW()
        WHERE exhibition_id = ?`,
        [
          details.exhibition_name || exhibition[0].international_category_name,
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
    
    // Process all sections (same as domestic)
    await connection.query('DELETE FROM tour_itineraries WHERE exhibition_id = ?', [exhibitionId]);
    if (details.itineraries && details.itineraries.length > 0) {
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
    }
    
    await connection.query('DELETE FROM tour_departures WHERE exhibition_id = ?', [exhibitionId]);
    if (details.departures && details.departures.length > 0) {
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
    }
    
    await connection.query('DELETE FROM tour_costs WHERE exhibition_id = ?', [exhibitionId]);
    if (details.tour_costs && details.tour_costs.length > 0) {
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
    }
    
    await connection.query('DELETE FROM optional_tours WHERE exhibition_id = ?', [exhibitionId]);
    if (details.optional_tours && details.optional_tours.length > 0) {
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
    }
    
    await connection.query('DELETE FROM emi_options WHERE exhibition_id = ?', [exhibitionId]);
    if (details.emi_options && details.emi_options.length > 0 && details.emi_loan_amount) {
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
    }
    
    await connection.query('DELETE FROM tour_inclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.inclusions && details.inclusions.length > 0) {
      const values = details.inclusions.map(i => [exhibitionId, i]);
      await connection.query(
        'INSERT INTO tour_inclusions (exhibition_id, item) VALUES ?',
        [values]
      );
    }
    
    await connection.query('DELETE FROM tour_exclusions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.exclusions && details.exclusions.length > 0) {
      const values = details.exclusions.map(e => [exhibitionId, e]);
      await connection.query(
        'INSERT INTO tour_exclusions (exhibition_id, item) VALUES ?',
        [values]
      );
    }
    
    await connection.query('DELETE FROM tour_transports WHERE exhibition_id = ?', [exhibitionId]);
    if (details.transports && details.transports.length > 0) {
      const values = details.transports.map((t, idx) => [
        t.description || null,
        idx + 1,
        exhibitionId
      ]);
      await connection.query(
        `INSERT INTO tour_transports (description, sort_order, exhibition_id) VALUES ?`,
        [values]
      );
    }
    
    await connection.query('DELETE FROM tour_hotels WHERE exhibition_id = ?', [exhibitionId]);
    if (details.hotels && details.hotels.length > 0) {
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
    }
    
    await connection.query('DELETE FROM tour_booking_poi WHERE exhibition_id = ?', [exhibitionId]);
    if (details.booking_pois && details.booking_pois.length > 0) {
      const values = details.booking_pois.map((p, idx) => [
        exhibitionId,
        p.item,
        idx + 1,
        p.amount_details || null
      ]);
      await connection.query(
        `INSERT INTO tour_booking_poi (exhibition_id, item, sort_order, amount_details) VALUES ?`,
        [values]
      );
    }
    
    await connection.query('DELETE FROM tour_cancellation_policies WHERE exhibition_id = ?', [exhibitionId]);
    if (details.cancellation_policies && details.cancellation_policies.length > 0) {
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
    }
    
    await connection.query('DELETE FROM tour_instructions WHERE exhibition_id = ?', [exhibitionId]);
    if (details.instructions && details.instructions.length > 0) {
      const values = details.instructions.map((i, idx) => [
        exhibitionId,
        i,
        idx + 1
      ]);
      await connection.query(
        'INSERT INTO tour_instructions (exhibition_id, item, sort_order) VALUES ?',
        [values]
      );
    }

    // ========== VISA DATA FOR INTERNATIONAL ==========
    if (details.visa_data) {
      const visaData = details.visa_data;
      
      await connection.query('DELETE FROM tour_visa_details WHERE exhibition_id = ?', [exhibitionId]);
      await connection.query('DELETE FROM tour_visa_fees WHERE exhibition_id = ?', [exhibitionId]);
      await connection.query('DELETE FROM tour_visa_forms WHERE exhibition_id = ?', [exhibitionId]);
      await connection.query('DELETE FROM tour_visa_submission WHERE exhibition_id = ?', [exhibitionId]);
      
      // Insert visa details
      const visaTypes = ['tourist', 'transit', 'business', 'photo'];
      for (const type of visaTypes) {
        let items = [];
        if (type === 'tourist') items = visaData.tourist_visa || [];
        else if (type === 'transit') items = visaData.transit_visa || [];
        else if (type === 'business') items = visaData.business_visa || [];
        else if (type === 'photo') items = visaData.photo || [];
        
        if (items.length > 0) {
          const values = items.map(item => [
            tourId,
            exhibitionId,
            type,
            item.description || null
          ]);
          await connection.query(
            'INSERT INTO tour_visa_details (tour_id, exhibition_id, type, description) VALUES ?',
            [values]
          );
        }
      }
      
      // Insert visa forms - FIXED: Properly handle NULL values
      if (visaData.visa_forms && visaData.visa_forms.length > 0) {
        for (let i = 0; i < visaData.visa_forms.length; i++) {
          const form = visaData.visa_forms[i];
          
          // Extract filename from file object or use the string directly
          let action1File = form.action1_file;
          let action2File = form.action2_file;
          
          // If it's a File object, we can't store it directly - it should have been uploaded separately
          // The frontend should upload files first and then send the filename
          if (action1File && typeof action1File === 'object' && action1File.name) {
            action1File = action1File.name;
          }
          if (action2File && typeof action2File === 'object' && action2File.name) {
            action2File = action2File.name;
          }
          
          // Skip if both files are null/undefined/empty
          if (!action1File && !action2File) {
            console.log(`⚠️ Skipping visa form at index ${i} - no files provided`);
            continue;
          }
          
          // Prepare values for insertion
          const insertValues = [
            tourId,
            exhibitionId,
            form.type || 'Other',
            form.download_action || 'Download',
            form.fill_action || 'Fill Manually',
            action1File || null,
            action2File || null,
            visaData.tourist_visa_remarks || null,
            i
          ];
          
          console.log('📝 Inserting visa form:', {
            tourId,
            exhibitionId,
            visa_type: form.type || 'Other',
            action1File: action1File || 'NULL',
            action2File: action2File || 'NULL',
            remarks: (visaData.tourist_visa_remarks || '').substring(0, 50) + '...'
          });
          
          await connection.query(
            `INSERT INTO tour_visa_forms 
            (tour_id, exhibition_id, visa_type, download_action, fill_action, action1_file, action2_file, remarks, row_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            insertValues
          );
        }
      }
      
      // Insert visa fees
      if (visaData.visa_fees && visaData.visa_fees.length > 0) {
        for (let i = 0; i < visaData.visa_fees.length; i++) {
          const fee = visaData.visa_fees[i];
          await connection.query(
            `INSERT INTO tour_visa_fees 
            (tour_id, exhibition_id, row_type, tourist, transit, business, 
             tourist_charges, transit_charges, business_charges, row_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              tourId,
              exhibitionId,
              fee.type || 'Free Flow Entry',
              fee.tourist || null,
              fee.transit || null,
              fee.business || null,
              fee.tourist_charges || null,
              fee.transit_charges || null,
              fee.business_charges || null,
              i
            ]
          );
        }
      }
      
      // Insert visa submission
      if (visaData.submission && visaData.submission.length > 0) {
        for (let i = 0; i < visaData.submission.length; i++) {
          const sub = visaData.submission[i];
          await connection.query(
            `INSERT INTO tour_visa_submission 
            (tour_id, exhibition_id, label, tourist, transit, business, row_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              tourId,
              exhibitionId,
              sub.label || 'Free Flow Entry',
              sub.tourist || null,
              sub.transit || null,
              sub.business || null,
              i
            ]
          );
        }
      }
      
      console.log(`✅ Visa data saved for exhibition ${exhibitionId}`);
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'International exhibition details saved successfully'
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error saving international exhibition details:', err);
    console.error('SQL Error:', err.sql);
    console.error('SQL Message:', err.sqlMessage);
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

    const [exhibition] = await connection.query(
      'SELECT id, domestic_category_name FROM domestic_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      return res.status(404).json({ 
        error: `Exhibition not found with ID: ${exhibitionId}`
      });
    }

    const result = { exhibition: exhibition[0] };

  const [tours] = await connection.query(
  `SELECT 
      t.*,
      c.state_name,
      c.city_name
   FROM tours t
   LEFT JOIN domestic_exhibition_cities c 
     ON t.exhibition_id = c.domestic_exhibition_id
   WHERE t.exhibition_id = ?`,
  [exhibitionId]
);

result.tours = tours || [];

    // Fetch itineraries
    const [itineraries] = await connection.query(
      `SELECT * FROM tour_itineraries WHERE exhibition_id = ? ORDER BY day`,
      [exhibitionId]
    );
    result.itineraries = itineraries || [];

    // Fetch departures
    const [departures] = await connection.query(
      `SELECT * FROM tour_departures WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.departures = departures || [];

    // Fetch tour costs
    const [costs] = await connection.query(
      `SELECT * FROM tour_costs WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.costs = costs || [];

    // Fetch optional tours
    const [optionalTours] = await connection.query(
      `SELECT tour_name, adult_price, child_price FROM optional_tours WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.optionaltours = optionalTours || [];

    // Fetch EMI options
    const [emiOptions] = await connection.query(
      `SELECT loan_amount, particulars, months, emi FROM emi_options WHERE exhibition_id = ? ORDER BY months`,
      [exhibitionId]
    );
    result.emioptions = emiOptions || [];

    // Fetch inclusions
    const [inclusions] = await connection.query(
      `SELECT item FROM tour_inclusions WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.inclusions = inclusions || [];

    // Fetch exclusions
    const [exclusions] = await connection.query(
      `SELECT item FROM tour_exclusions WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.exclusions = exclusions || [];

    // Fetch transports
    const [transports] = await connection.query(
      `SELECT description FROM tour_transports WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.transports = transports || [];

    // Fetch hotels
    const [hotels] = await connection.query(
      `SELECT city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name FROM tour_hotels WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.hotels = hotels || [];

    // Fetch booking POIs
    const [bookingPoi] = await connection.query(
      `SELECT item, amount_details FROM tour_booking_poi WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.bookingpoi = bookingPoi || [];

    // Fetch cancellation policies
    const [cancellationPolicies] = await connection.query(
      `SELECT cancellation_policy, charges FROM tour_cancellation_policies WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.cancellationpolicies = cancellationPolicies || [];

    // Fetch instructions
    const [instructions] = await connection.query(
      `SELECT item FROM tour_instructions WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.instructions = instructions || [];

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
    console.error('❌ Error fetching exhibition details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

router.get('/international/:id/details', async (req, res) => {
  const exhibitionId = req.params.id;
  let connection;

  console.log('========================================');
  console.log('📥 GET /international/:id/details');
  console.log(`📌 Exhibition ID: ${exhibitionId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();

    const [exhibition] = await connection.query(
      'SELECT id, international_category_name FROM international_exhibition WHERE id = ?',
      [exhibitionId]
    );

    if (exhibition.length === 0) {
      return res.status(404).json({ 
        error: `International exhibition not found with ID: ${exhibitionId}`
      });
    }

    const result = { exhibition: exhibition[0] };

    // Fetch tours data
 const [tours] = await connection.query(
  `SELECT 
      t.*,
      c.city_name,
      c.country_name
   FROM tours t
   LEFT JOIN international_exhibition_cities c 
     ON t.exhibition_id = c.international_exhibition_id
   WHERE t.exhibition_id = ?`,
  [exhibitionId]
);

result.tours = tours || [];

    // Fetch itineraries
    const [itineraries] = await connection.query(
      `SELECT * FROM tour_itineraries WHERE exhibition_id = ? ORDER BY day`,
      [exhibitionId]
    );
    result.itineraries = itineraries || [];

    // Fetch departures
    const [departures] = await connection.query(
      `SELECT * FROM tour_departures WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.departures = departures || [];

    // Fetch tour costs
    const [costs] = await connection.query(
      `SELECT * FROM tour_costs WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.costs = costs || [];

    // Fetch optional tours
    const [optionalTours] = await connection.query(
      `SELECT tour_name, adult_price, child_price FROM optional_tours WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.optionaltours = optionalTours || [];

    // Fetch EMI options
    const [emiOptions] = await connection.query(
      `SELECT loan_amount, particulars, months, emi FROM emi_options WHERE exhibition_id = ? ORDER BY months`,
      [exhibitionId]
    );
    result.emioptions = emiOptions || [];

    // Fetch inclusions
    const [inclusions] = await connection.query(
      `SELECT item FROM tour_inclusions WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.inclusions = inclusions || [];

    // Fetch exclusions
    const [exclusions] = await connection.query(
      `SELECT item FROM tour_exclusions WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.exclusions = exclusions || [];

    // Fetch transports
    const [transports] = await connection.query(
      `SELECT description FROM tour_transports WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.transports = transports || [];

    // Fetch hotels
    const [hotels] = await connection.query(
      `SELECT city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name FROM tour_hotels WHERE exhibition_id = ?`,
      [exhibitionId]
    );
    result.hotels = hotels || [];

    // Fetch booking POIs
    const [bookingPoi] = await connection.query(
      `SELECT item, amount_details FROM tour_booking_poi WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.bookingpoi = bookingPoi || [];

    // Fetch cancellation policies
    const [cancellationPolicies] = await connection.query(
      `SELECT cancellation_policy, charges FROM tour_cancellation_policies WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.cancellationpolicies = cancellationPolicies || [];

    // Fetch instructions
    const [instructions] = await connection.query(
      `SELECT item FROM tour_instructions WHERE exhibition_id = ? ORDER BY sort_order`,
      [exhibitionId]
    );
    result.instructions = instructions || [];

    // Fetch visa data
    const [visaDetails] = await connection.query(
      'SELECT * FROM tour_visa_details WHERE exhibition_id = ? ORDER BY type, created_at',
      [exhibitionId]
    );
    
 const [visaForms] = await connection.query(
  `SELECT 
      form_id,
      tour_id,
      exhibition_id,
      visa_type,
      download_action,
      fill_action,
      action1_file,
      action2_file,
      remarks,
      row_order
   FROM tour_visa_forms 
   WHERE exhibition_id = ?
   ORDER BY row_order, created_at`,
  [exhibitionId]
);
    const [visaFees] = await connection.query(
      'SELECT * FROM tour_visa_fees WHERE exhibition_id = ? ORDER BY row_order, created_at',
      [exhibitionId]
    );
    
    const [visaSubmission] = await connection.query(
      'SELECT * FROM tour_visa_submission WHERE exhibition_id = ? ORDER BY row_order, created_at',
      [exhibitionId]
    );

    // Group visa details by type
    const touristVisa = visaDetails.filter(v => v.type === 'tourist').map(v => ({ description: v.description }));
    const transitVisa = visaDetails.filter(v => v.type === 'transit').map(v => ({ description: v.description }));
    const businessVisa = visaDetails.filter(v => v.type === 'business').map(v => ({ description: v.description }));
    const photoVisa = visaDetails.filter(v => v.type === 'photo').map(v => ({ description: v.description }));
    
    const touristVisaRemarks = visaForms.length > 0 ? visaForms[0].remarks : '';

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
        instructions: result.instructions || [],
        visa_details: visaDetails || [],
        visa_forms: visaForms || [],
        visa_fees: visaFees || [],
        visa_submission: visaSubmission || [],
        tourist_visa: touristVisa,
        transit_visa: transitVisa,
        business_visa: businessVisa,
        photo_visa: photoVisa,
        tourist_visa_remarks: touristVisaRemarks
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

// ========== TOUR DATA ROUTE ==========
router.get('/tour-data/:exhibition_id', async (req, res) => {
  const exhibitionId = req.params.exhibition_id;
  let connection;

  console.log('========================================');
  console.log('📥 GET /tour-data/:exhibition_id');
  console.log(`📌 Exhibition ID: ${exhibitionId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();

    const result = {};

    const tables = [
      'tours', 'tour_itineraries', 'tour_departures', 'tour_costs',
      'optional_tours', 'emi_options', 'tour_inclusions', 'tour_exclusions',
      'tour_transports', 'tour_hotels', 'tour_booking_poi',
      'tour_cancellation_policies', 'tour_instructions',
      'tour_visa_details', 'tour_visa_forms', 'tour_visa_fees', 'tour_visa_submission'
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

module.exports = router;