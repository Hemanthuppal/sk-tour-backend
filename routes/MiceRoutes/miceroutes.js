// routes/miceRoutes.js - Combined MICE Routes
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../../config/db');

// Helper function to ensure directory exists
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

// ========== MULTER CONFIGURATION ==========

// Configure multer for domestic mice city images
const domesticCityStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/mice/domestic/';
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'mice-domestic-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for international mice city images
const internationalCityStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/mice/international/';
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'mice-international-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer for other MICE content (main, freeflow, packages, etc.)
const contentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/mice/';
    
    if (req.originalUrl.includes('main')) {
      uploadPath += 'main/';
    } else if (req.originalUrl.includes('freeflow')) {
      uploadPath += 'freeflow/';
    } else if (req.originalUrl.includes('packages')) {
      uploadPath += 'packages/';
    } else if (req.originalUrl.includes('clients')) {
      uploadPath += 'clients/';
    } else if (req.originalUrl.includes('venues')) {
      uploadPath += 'venues/';
    } else if (req.originalUrl.includes('gallery')) {
      uploadPath += 'gallery/';
    } else if (req.originalUrl.includes('events')) {
      uploadPath += 'events/';
    }
    
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Multer instances
const domesticCityUpload = multer({
  storage: domesticCityStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed!'));
  }
});

const internationalCityUpload = multer({
  storage: internationalCityStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed!'));
  }
});

const contentUpload = multer({
  storage: contentStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'));
  }
});

const uploadDomesticMultiple = domesticCityUpload.array('images', 10);
const uploadInternationalMultiple = internationalCityUpload.array('images', 10);

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum 10MB allowed.' });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
};


// Configure multer for visa file uploads
const visaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/mice/visa/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'mice-visa-' + uniqueSuffix + path.extname(file.originalname));
  }
});

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

// ========== DOMESTIC MICE CITY ROUTES ==========

// Get all domestic mice cities
router.get('/domestic', async (req, res) => {
  console.log('📥 GET /api/mice/domestic');
  try {
    const [cities] = await db.query(`
      SELECT * FROM mice_domestic_cities 
      ORDER BY created_at DESC
    `);
    res.json(cities);
  } catch (error) {
    console.error('Error fetching domestic mice cities:', error);
    res.status(500).json({ error: 'Error fetching domestic mice cities' });
  }
});

// Get domestic mice city by ID
router.get('/domestic/:id', async (req, res) => {
  console.log(`📥 GET /api/mice/domestic/${req.params.id}`);
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM mice_domestic_cities WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching domestic mice city:', error);
    res.status(500).json({ error: 'Error fetching domestic mice city' });
  }
});

// Get domestic mice city by city name
router.get('/domestic/city/:cityName', async (req, res) => {
  console.log(`📥 GET /api/mice/domestic/city/${req.params.cityName}`);
  try {
    const { cityName } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM mice_domestic_cities WHERE city_name = ?',
      [cityName]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching domestic mice city by name:', error);
    res.status(500).json({ error: 'Error fetching domestic mice city' });
  }
});

// Create domestic mice cities
router.post('/domestic', (req, res) => {
  console.log('📥 POST /api/mice/domestic');
  uploadDomesticMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { stateNames, cityNames, prices } = req.body;
      const files = req.files || [];
      
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
      
      if (cityNamesArray.length === 0) {
        return res.status(400).json({ error: 'At least one city is required' });
      }
      
      if (cityNamesArray.length !== pricesArray.length) {
        return res.status(400).json({ error: 'Mismatch between cities and prices' });
      }
      
      if (cityNamesArray.length !== files.length) {
        return res.status(400).json({ error: 'Please upload an image for each city' });
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const insertedIds = [];
      
      for (let i = 0; i < cityNamesArray.length; i++) {
        const stateName = stateNamesArray[i]?.trim() || null;
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
        
        const [result] = await connection.query(
          'INSERT INTO mice_domestic_cities (state_name, city_name, image, price) VALUES (?, ?, ?, ?)',
          [stateName, cityName, imageFile.filename, price]
        );
        insertedIds.push(result.insertId);
      }
      
      await connection.commit();
      
      res.json({ 
        message: 'Domestic mice cities added successfully',
        ids: insertedIds,
        id: insertedIds[0]
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error adding domestic mice cities:', error);
      
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/mice/domestic/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error adding domestic mice cities' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Update domestic mice city
router.put('/domestic/:id', (req, res) => {
  console.log(`📥 PUT /api/mice/domestic/${req.params.id}`);
  uploadDomesticMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { id } = req.params;
      const { stateNames, cityNames, prices, existingImages, existingCityIds } = req.body;
      const files = req.files || [];
      
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
      
      if (cityNamesArray.length === 0) {
        return res.status(400).json({ error: 'At least one city is required' });
      }
      
      if (cityNamesArray.length !== pricesArray.length) {
        return res.status(400).json({ error: 'Mismatch between cities and prices' });
      }
      
      const totalCities = cityNamesArray.length;
      const totalImages = existingImagesArray.length + files.length;
      
      if (totalCities !== totalImages) {
        return res.status(400).json({ error: 'Please ensure each city has an image' });
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const [oldCities] = await connection.query(
        'SELECT id, image FROM mice_domestic_cities WHERE id IN (?)',
        [existingCityIdsArray.length ? existingCityIdsArray : [0]]
      );
      
      await connection.query('DELETE FROM mice_domestic_cities WHERE id = ?', [id]);
      
      let fileIndex = 0;
      let existingImageIndex = 0;
      
      for (let i = 0; i < cityNamesArray.length; i++) {
        const stateName = stateNamesArray[i]?.trim() || null;
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
          'INSERT INTO mice_domestic_cities (id, state_name, city_name, image, price) VALUES (?, ?, ?, ?, ?)',
          [id, stateName, cityName, imageFilename, price]
        );
      }
      
      const newImageFilenames = existingImagesArray.concat(files.map(f => f.filename));
      for (let oldCity of oldCities) {
        if (!newImageFilenames.includes(oldCity.image)) {
          const oldFilePath = path.join('uploads/mice/domestic/', oldCity.image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
      }
      
      await connection.commit();
      
      res.json({ message: 'Domestic mice city updated successfully' });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error updating domestic mice city:', error);
      
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/mice/domestic/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error updating domestic mice city' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Delete domestic mice city
router.delete('/domestic/:id', async (req, res) => {
  console.log(`📥 DELETE /api/mice/domestic/${req.params.id}`);
  let connection;
  try {
    const { id } = req.params;
    
    connection = await db.getConnection();
    
    const [city] = await connection.query(
      'SELECT image FROM mice_domestic_cities WHERE id = ?',
      [id]
    );
    
    if (city.length > 0 && city[0].image) {
      const filePath = path.join('uploads/mice/domestic/', city[0].image);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await connection.query('DELETE FROM mice_domestic_cities WHERE id = ?', [id]);
    
    res.json({ message: 'Domestic mice city deleted successfully' });
  } catch (error) {
    console.error('Error deleting domestic mice city:', error);
    res.status(500).json({ error: 'Error deleting domestic mice city' });
  } finally {
    if (connection) connection.release();
  }
});

// ========== INTERNATIONAL MICE CITY ROUTES ==========

// Get all international mice cities
router.get('/international', async (req, res) => {
  console.log('📥 GET /api/mice/international');
  try {
    const [cities] = await db.query(`
      SELECT * FROM mice_international_cities 
      ORDER BY created_at DESC
    `);
    res.json(cities);
  } catch (error) {
    console.error('Error fetching international mice cities:', error);
    res.status(500).json({ error: 'Error fetching international mice cities' });
  }
});

// Get international mice city by ID
router.get('/international/:id', async (req, res) => {
  console.log(`📥 GET /api/mice/international/${req.params.id}`);
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM mice_international_cities WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching international mice city:', error);
    res.status(500).json({ error: 'Error fetching international mice city' });
  }
});

// Get international mice city by city name
router.get('/international/city/:cityName', async (req, res) => {
  console.log(`📥 GET /api/mice/international/city/${req.params.cityName}`);
  try {
    const { cityName } = req.params;
    const [rows] = await db.query(
      'SELECT * FROM mice_international_cities WHERE city_name = ?',
      [cityName]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'City not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching international mice city by name:', error);
    res.status(500).json({ error: 'Error fetching international mice city' });
  }
});

// Create international mice cities
router.post('/international', (req, res) => {
  console.log('📥 POST /api/mice/international');
  uploadInternationalMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { countryNames, cityNames, prices } = req.body;
      const files = req.files || [];
      
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
      
      if (cityNamesArray.length === 0) {
        return res.status(400).json({ error: 'At least one city is required' });
      }
      
      if (cityNamesArray.length !== pricesArray.length) {
        return res.status(400).json({ error: 'Mismatch between cities and prices' });
      }
      
      if (cityNamesArray.length !== files.length) {
        return res.status(400).json({ error: 'Please upload an image for each city' });
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const insertedIds = [];
      
      for (let i = 0; i < cityNamesArray.length; i++) {
        const countryName = countryNamesArray[i]?.trim() || null;
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
        
        const [result] = await connection.query(
          'INSERT INTO mice_international_cities (country_name, city_name, image, price) VALUES (?, ?, ?, ?)',
          [countryName, cityName, imageFile.filename, price]
        );
        insertedIds.push(result.insertId);
      }
      
      await connection.commit();
      
      res.json({ 
        message: 'International mice cities added successfully',
        ids: insertedIds,
        id: insertedIds[0]
      });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error adding international mice cities:', error);
      
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/mice/international/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error adding international mice cities' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Update international mice city
router.put('/international/:id', (req, res) => {
  console.log(`📥 PUT /api/mice/international/${req.params.id}`);
  uploadInternationalMultiple(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    let connection;
    try {
      const { id } = req.params;
      const { countryNames, cityNames, prices, existingImages, existingCityIds } = req.body;
      const files = req.files || [];
      
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
      
      if (cityNamesArray.length === 0) {
        return res.status(400).json({ error: 'At least one city is required' });
      }
      
      if (cityNamesArray.length !== pricesArray.length) {
        return res.status(400).json({ error: 'Mismatch between cities and prices' });
      }
      
      const totalCities = cityNamesArray.length;
      const totalImages = existingImagesArray.length + files.length;
      
      if (totalCities !== totalImages) {
        return res.status(400).json({ error: 'Please ensure each city has an image' });
      }
      
      connection = await db.getConnection();
      await connection.beginTransaction();
      
      const [oldCities] = await connection.query(
        'SELECT id, image FROM mice_international_cities WHERE id IN (?)',
        [existingCityIdsArray.length ? existingCityIdsArray : [0]]
      );
      
      await connection.query('DELETE FROM mice_international_cities WHERE id = ?', [id]);
      
      let fileIndex = 0;
      let existingImageIndex = 0;
      
      for (let i = 0; i < cityNamesArray.length; i++) {
        const countryName = countryNamesArray[i]?.trim() || null;
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
          'INSERT INTO mice_international_cities (id, country_name, city_name, image, price) VALUES (?, ?, ?, ?, ?)',
          [id, countryName, cityName, imageFilename, price]
        );
      }
      
      const newImageFilenames = existingImagesArray.concat(files.map(f => f.filename));
      for (let oldCity of oldCities) {
        if (!newImageFilenames.includes(oldCity.image)) {
          const oldFilePath = path.join('uploads/mice/international/', oldCity.image);
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
          }
        }
      }
      
      await connection.commit();
      
      res.json({ message: 'International mice city updated successfully' });
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('Error updating international mice city:', error);
      
      if (req.files) {
        req.files.forEach(file => {
          const filePath = path.join('uploads/mice/international/', file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      res.status(500).json({ error: 'Error updating international mice city' });
    } finally {
      if (connection) connection.release();
    }
  });
});

// Delete international mice city
router.delete('/international/:id', async (req, res) => {
  console.log(`📥 DELETE /api/mice/international/${req.params.id}`);
  let connection;
  try {
    const { id } = req.params;
    
    connection = await db.getConnection();
    
    const [city] = await connection.query(
      'SELECT image FROM mice_international_cities WHERE id = ?',
      [id]
    );
    
    if (city.length > 0 && city[0].image) {
      const filePath = path.join('uploads/mice/international/', city[0].image);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await connection.query('DELETE FROM mice_international_cities WHERE id = ?', [id]);
    
    res.json({ message: 'International mice city deleted successfully' });
  } catch (error) {
    console.error('Error deleting international mice city:', error);
    res.status(500).json({ error: 'Error deleting international mice city' });
  } finally {
    if (connection) connection.release();
  }
});

// ========== MICE MAIN PAGE ==========

// Get MICE Main data
router.get('/main', async (req, res) => {
  try {
    const [mainRows] = await db.query(
      'SELECT * FROM mice_main ORDER BY id DESC LIMIT 1'
    );
    
    if (mainRows.length === 0) {
      return res.json(null);
    }
    
    const mainData = mainRows[0];
    
    const [questionRows] = await db.query(
      'SELECT * FROM mice_questions WHERE mice_main_id = ? ORDER BY id',
      [mainData.id]
    );
    
    mainData.questions = questionRows;
    res.json(mainData);
  } catch (error) {
    console.error('Error fetching MICE main:', error);
    res.status(500).json({ error: 'Failed to fetch MICE main data: ' + error.message });
  }
});

// Create/Update MICE Main
router.post('/main', (req, res) => {
  contentUpload.single('bannerImage')(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const { isEdit, questions } = req.body;
      const bannerImage = req.file ? req.file.filename : null;
      
      if (!isEdit && !bannerImage) {
        await connection.rollback();
        return res.status(400).json({ error: 'Banner image is required for new records' });
      }

      let parsedQuestions = [];
      if (questions) {
        try {
          parsedQuestions = JSON.parse(questions);
          parsedQuestions = parsedQuestions.filter(q => 
            q.question && q.question.trim() !== '' && 
            q.answer && q.answer.trim() !== ''
          );
        } catch (e) {
          await connection.rollback();
          return res.status(400).json({ error: 'Invalid questions format' });
        }
      }
      
      let miceMainId;
      
      if (isEdit === 'true') {
        const [existing] = await connection.query(
          'SELECT id, banner_image FROM mice_main ORDER BY id DESC LIMIT 1'
        );
        
        if (existing.length > 0) {
          miceMainId = existing[0].id;
          
          if (bannerImage) {
            const oldFilePath = path.join('uploads/mice/main/', existing[0].banner_image);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
            
            await connection.query(
              'UPDATE mice_main SET banner_image = ?, updated_at = NOW() WHERE id = ?',
              [bannerImage, miceMainId]
            );
          } else {
            await connection.query(
              'UPDATE mice_main SET updated_at = NOW() WHERE id = ?',
              [miceMainId]
            );
          }
          
          await connection.query('DELETE FROM mice_questions WHERE mice_main_id = ?', [miceMainId]);
        } else {
          await connection.rollback();
          return res.status(404).json({ error: 'Record not found for update' });
        }
      } else {
        if (!bannerImage) {
          await connection.rollback();
          return res.status(400).json({ error: 'Banner image is required' });
        }
        
        const [result] = await connection.query(
          'INSERT INTO mice_main (banner_image, created_at, updated_at) VALUES (?, NOW(), NOW())',
          [bannerImage]
        );
        
        miceMainId = result.insertId;
      }
      
      if (parsedQuestions.length > 0) {
        const questionValues = parsedQuestions.map(q => [
          miceMainId, 
          q.question.trim(), 
          q.answer.trim()
        ]);
        
        await connection.query(
          'INSERT INTO mice_questions (mice_main_id, question, answer, created_at) VALUES ?',
          [questionValues.map(v => [...v, 'NOW()'])]
        );
      }
      
      await connection.commit();
      
      res.json({ 
        success: true, 
        message: isEdit === 'true' ? 'MICE Main updated successfully' : 'MICE Main created successfully',
        id: miceMainId 
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error saving MICE main:', error);
      res.status(500).json({ error: 'Failed to save MICE main: ' + error.message });
    } finally {
      connection.release();
    }
  });
});

// ========== FREE FLOW ENTRY ==========

router.get('/freeflow', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM mice_freeflow ORDER BY id DESC LIMIT 1'
    );
    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error fetching freeflow:', error);
    res.status(500).json({ error: 'Failed to fetch freeflow data: ' + error.message });
  }
});

router.post('/freeflow', (req, res) => {
  contentUpload.single('image')(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    try {
      const { meetingText, incentivesText, conferenceText, eventsText, id } = req.body;
      const image = req.file ? req.file.filename : null;
      
      if (!meetingText || !incentivesText || !conferenceText || !eventsText) {
        return res.status(400).json({ error: 'All text fields are required' });
      }
      
      if (id) {
        if (image) {
          const [existing] = await db.query('SELECT image FROM mice_freeflow WHERE id = ?', [id]);
          if (existing.length > 0 && existing[0].image) {
            const oldFilePath = path.join('uploads/mice/freeflow/', existing[0].image);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
            }
          }
          
          await db.query(
            `UPDATE mice_freeflow 
             SET meeting_text = ?, incentives_text = ?, conference_text = ?, events_text = ?, 
                 image = ?, updated_at = NOW() 
             WHERE id = ?`,
            [meetingText, incentivesText, conferenceText, eventsText, image, id]
          );
        } else {
          await db.query(
            `UPDATE mice_freeflow 
             SET meeting_text = ?, incentives_text = ?, conference_text = ?, events_text = ?, 
                 updated_at = NOW() 
             WHERE id = ?`,
            [meetingText, incentivesText, conferenceText, eventsText, id]
          );
        }
        
        res.json({ success: true, message: 'Free Flow updated successfully' });
      } else {
        if (!image) {
          return res.status(400).json({ error: 'Image is required for new records' });
        }
        
        const [result] = await db.query(
          `INSERT INTO mice_freeflow 
           (meeting_text, incentives_text, conference_text, events_text, image, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [meetingText, incentivesText, conferenceText, eventsText, image]
        );
        
        res.json({ success: true, message: 'Free Flow created successfully', id: result.insertId });
      }
    } catch (error) {
      console.error('Error saving freeflow:', error);
      res.status(500).json({ error: 'Failed to save freeflow: ' + error.message });
    }
  });
});

// ========== SAMPLE PACKAGES ==========

router.get('/packages', async (req, res) => {
  try {
    const [packages] = await db.query(
      'SELECT * FROM mice_packages ORDER BY created_at DESC'
    );
    
    for (const pkg of packages) {
      const [images] = await db.query(
        'SELECT * FROM mice_package_images WHERE package_id = ?',
        [pkg.id]
      );
      pkg.images = images;
    }
    
    res.json(packages);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Failed to fetch packages: ' + error.message });
  }
});

router.get('/packages/:id', async (req, res) => {
  try {
    const [packageRows] = await db.query(
      'SELECT * FROM mice_packages WHERE id = ?',
      [req.params.id]
    );
    
    if (packageRows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const [images] = await db.query(
      'SELECT * FROM mice_package_images WHERE package_id = ?',
      [req.params.id]
    );
    
    packageRows[0].images = images;
    res.json(packageRows[0]);
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({ error: 'Failed to fetch package: ' + error.message });
  }
});

router.post('/packages', (req, res) => {
  contentUpload.array('images', 10)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const { days, price, id } = req.body;
      const files = req.files || [];
      
      if (!days || !price) {
        await connection.rollback();
        return res.status(400).json({ error: 'Days and price are required' });
      }

      if (!id && files.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'At least one image is required for new packages' });
      }
      
      let packageId;
      
      if (id) {
        packageId = id;
        await connection.query(
          'UPDATE mice_packages SET days = ?, price = ?, updated_at = NOW() WHERE id = ?',
          [days, price, packageId]
        );
      } else {
        const [result] = await connection.query(
          'INSERT INTO mice_packages (days, price, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
          [days, price]
        );
        packageId = result.insertId;
      }
      
      for (const file of files) {
        await connection.query(
          'INSERT INTO mice_package_images (package_id, image_path, created_at) VALUES (?, ?, NOW())',
          [packageId, file.filename]
        );
      }
      
      await connection.commit();
      
      res.json({ 
        success: true, 
        message: id ? 'Package updated successfully' : 'Package created successfully',
        id: packageId 
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error saving package:', error);
      res.status(500).json({ error: 'Failed to save package: ' + error.message });
    } finally {
      connection.release();
    }
  });
});

router.delete('/packages/:id', async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [images] = await connection.query(
      'SELECT image_path FROM mice_package_images WHERE package_id = ?',
      [req.params.id]
    );
    
    for (const img of images) {
      const filePath = path.join('uploads/mice/packages/', img.image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await connection.query('DELETE FROM mice_package_images WHERE package_id = ?', [req.params.id]);
    await connection.query('DELETE FROM mice_packages WHERE id = ?', [req.params.id]);
    
    await connection.commit();
    res.json({ success: true, message: 'Package deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting package:', error);
    res.status(500).json({ error: 'Failed to delete package: ' + error.message });
  } finally {
    connection.release();
  }
});

// ========== OUR CLIENTS ==========

router.get('/clients', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM mice_clients ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ error: 'Failed to fetch clients: ' + error.message });
  }
});

router.post('/clients', (req, res) => {
  contentUpload.array('images', 20)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const files = req.files || [];
      
      if (files.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'No images uploaded' });
      }
      
      for (const file of files) {
        await connection.query(
          'INSERT INTO mice_clients (image_path, created_at) VALUES (?, NOW())',
          [file.filename]
        );
      }
      
      await connection.commit();
      res.json({ success: true, message: `${files.length} client image(s) uploaded successfully` });
    } catch (error) {
      await connection.rollback();
      console.error('Error uploading client images:', error);
      res.status(500).json({ error: 'Failed to upload client images: ' + error.message });
    } finally {
      connection.release();
    }
  });
});

router.delete('/clients/:id', async (req, res) => {
  try {
    const [image] = await db.query('SELECT image_path FROM mice_clients WHERE id = ?', [req.params.id]);
    
    if (image.length > 0) {
      const filePath = path.join('uploads/mice/clients/', image[0].image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await db.query('DELETE FROM mice_clients WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Client image deleted successfully' });
  } catch (error) {
    console.error('Error deleting client image:', error);
    res.status(500).json({ error: 'Failed to delete client image: ' + error.message });
  }
});

// ========== VENUES ==========

router.get('/venues', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM mice_venues ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching venues:', error);
    res.status(500).json({ error: 'Failed to fetch venues: ' + error.message });
  }
});

router.post('/venues', (req, res) => {
  contentUpload.array('images', 20)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const files = req.files || [];
      
      if (files.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'No images uploaded' });
      }
      
      for (const file of files) {
        await connection.query(
          'INSERT INTO mice_venues (image_path, created_at) VALUES (?, NOW())',
          [file.filename]
        );
      }
      
      await connection.commit();
      res.json({ success: true, message: `${files.length} venue image(s) uploaded successfully` });
    } catch (error) {
      await connection.rollback();
      console.error('Error uploading venue images:', error);
      res.status(500).json({ error: 'Failed to upload venue images: ' + error.message });
    } finally {
      connection.release();
    }
  });
});

router.delete('/venues/:id', async (req, res) => {
  try {
    const [image] = await db.query('SELECT image_path FROM mice_venues WHERE id = ?', [req.params.id]);
    
    if (image.length > 0) {
      const filePath = path.join('uploads/mice/venues/', image[0].image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await db.query('DELETE FROM mice_venues WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Venue image deleted successfully' });
  } catch (error) {
    console.error('Error deleting venue image:', error);
    res.status(500).json({ error: 'Failed to delete venue image: ' + error.message });
  }
});

// ========== MICE GALLERY ==========

router.get('/gallery', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM mice_gallery ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching gallery:', error);
    res.status(500).json({ error: 'Failed to fetch gallery: ' + error.message });
  }
});

router.post('/gallery', (req, res) => {
  contentUpload.array('images', 50)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const files = req.files || [];
      
      if (files.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'No images uploaded' });
      }
      
      for (const file of files) {
        await connection.query(
          'INSERT INTO mice_gallery (image_path, created_at) VALUES (?, NOW())',
          [file.filename]
        );
      }
      
      await connection.commit();
      res.json({ success: true, message: `${files.length} gallery image(s) uploaded successfully` });
    } catch (error) {
      await connection.rollback();
      console.error('Error uploading gallery images:', error);
      res.status(500).json({ error: 'Failed to upload gallery images: ' + error.message });
    } finally {
      connection.release();
    }
  });
});

router.delete('/gallery/:id', async (req, res) => {
  try {
    const [image] = await db.query('SELECT image_path FROM mice_gallery WHERE id = ?', [req.params.id]);
    
    if (image.length > 0) {
      const filePath = path.join('uploads/mice/gallery/', image[0].image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await db.query('DELETE FROM mice_gallery WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Gallery image deleted successfully' });
  } catch (error) {
    console.error('Error deleting gallery image:', error);
    res.status(500).json({ error: 'Failed to delete gallery image: ' + error.message });
  }
});

// ========== UPCOMING EVENTS ==========

router.get('/events', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM mice_upcoming_events ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events: ' + error.message });
  }
});

router.post('/events', (req, res) => {
  contentUpload.array('images', 20)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const files = req.files || [];
      
      if (files.length === 0) {
        await connection.rollback();
        return res.status(400).json({ error: 'No images uploaded' });
      }
      
      for (const file of files) {
        await connection.query(
          'INSERT INTO mice_upcoming_events (image_path, created_at) VALUES (?, NOW())',
          [file.filename]
        );
      }
      
      await connection.commit();
      res.json({ success: true, message: `${files.length} event image(s) uploaded successfully` });
    } catch (error) {
      await connection.rollback();
      console.error('Error uploading event images:', error);
      res.status(500).json({ error: 'Failed to upload event images: ' + error.message });
    } finally {
      connection.release();
    }
  });
});

router.delete('/events/:id', async (req, res) => {
  try {
    const [image] = await db.query('SELECT image_path FROM mice_upcoming_events WHERE id = ?', [req.params.id]);
    
    if (image.length > 0) {
      const filePath = path.join('uploads/mice/events/', image[0].image_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await db.query('DELETE FROM mice_upcoming_events WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Event image deleted successfully' });
  } catch (error) {
    console.error('Error deleting event image:', error);
    res.status(500).json({ error: 'Failed to delete event image: ' + error.message });
  }
});

// ========== ENQUIRY FORM ==========

router.post("/enquiry-form", async (req, res) => {
  try {
    const {
      company_name,
      reference_no,
      contact_person,
      cell_no,
      email,
      city,
      pin_code,
      state,
      country,
      num_people,
      num_rooms,
      single_room,
      double_room,
      triple_room,
      suite_room,
      city_type,
      city_name,
      domestic_destination,
      international_destination,
      hotel_category,
      budget,
      common_inclusion
    } = req.body;

    const sql = `
      INSERT INTO mice_enquiries
      (company_name, reference_no, contact_person, cell_no, email,
       city, pin_code, state, country, num_people, num_rooms,
       single_room, double_room, triple_room, suite_room,
       city_type, city_name, domestic_destination,
       international_destination, hotel_category,
       budget, common_inclusion)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.query(sql, [
      company_name,
      reference_no,
      contact_person,
      cell_no,
      email,
      city,
      pin_code,
      state,
      country,
      num_people,
      num_rooms,
      single_room,
      double_room,
      triple_room,
      suite_room,
      city_type,
      city_name,
      domestic_destination,
      international_destination,
      hotel_category,
      budget,
      common_inclusion
    ]);

    res.status(201).json({ message: "Enquiry Created Successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET all enquiries
router.get("/enquiry-form", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM mice_enquiries ORDER BY id DESC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// GET single enquiry
router.get("/enquiry/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM mice_enquiries WHERE id = ?",
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// UPDATE enquiry
router.put("/enquiry/:id", async (req, res) => {
  try {
    const { company_name, contact_person } = req.body;

    await db.query(
      "UPDATE mice_enquiries SET company_name=?, contact_person=? WHERE id=?",
      [company_name, contact_person, req.params.id]
    );

    res.json({ message: "Updated Successfully" });

  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});

// DELETE enquiry
router.delete("/enquiry/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM mice_enquiries WHERE id=?", [
      req.params.id
    ]);

    res.json({ message: "Deleted Successfully" });

  } catch (error) {
    res.status(500).json({ error: "Server Error" });
  }
});


// ========== MICE DETAILS ROUTES (Similar to Exhibition but using mice_id) ==========

// Get domestic mice details by ID (for the details page) - ADD IMAGES
router.get('/domestic-details/:id', async (req, res) => {
  const miceId = req.params.id;
  let connection;

  console.log('📥 GET /api/mice/domestic-details/:id');
  console.log(`📌 Mice ID: ${miceId}`);

  try {
    connection = await db.getConnection();

    // Get the mice city data
    const [miceCity] = await connection.query(
      'SELECT * FROM mice_domestic_cities WHERE id = ?',
      [miceId]
    );

    if (miceCity.length === 0) {
      return res.status(404).json({ error: `Mice city not found with ID: ${miceId}` });
    }

    const result = { mice_city: miceCity[0] };

    // Fetch tours data for this mice
    const [tours] = await connection.query(
      `SELECT * FROM tours WHERE mice_id = ?`,
      [miceId]
    );

    result.tours = tours || [];

    // Fetch itineraries
    const [itineraries] = await connection.query(
      `SELECT * FROM tour_itineraries WHERE mice_id = ? ORDER BY day`,
      [miceId]
    );
    result.itineraries = itineraries || [];

    // Fetch departures
    const [departures] = await connection.query(
      `SELECT 
          start_date, end_date, status, description,
          three_star_twin as standard_twin,
          three_star_triple as standard_triple,
          three_star_single as standard_single,
          four_star_twin as deluxe_twin,
          four_star_triple as deluxe_triple,
          four_star_single as deluxe_single,
          five_star_twin as luxury_twin,
          five_star_triple as luxury_triple,
          five_star_single as luxury_single
       FROM tour_departures 
       WHERE mice_id = ?`,
      [miceId]
    );
    result.departures = departures || [];

    // Fetch optional tours
    const [optionalTours] = await connection.query(
      `SELECT tour_name, adult_price, child_price FROM optional_tours WHERE mice_id = ?`,
      [miceId]
    );
    result.optionaltours = optionalTours || [];

    // Fetch EMI options
    const [emiOptions] = await connection.query(
      `SELECT loan_amount, particulars, months, emi FROM emi_options WHERE mice_id = ? ORDER BY months`,
      [miceId]
    );
    result.emioptions = emiOptions || [];

    // Fetch inclusions
    const [inclusions] = await connection.query(
      `SELECT item FROM tour_inclusions WHERE mice_id = ?`,
      [miceId]
    );
    result.inclusions = inclusions || [];

    // Fetch exclusions
    const [exclusions] = await connection.query(
      `SELECT item FROM tour_exclusions WHERE mice_id = ?`,
      [miceId]
    );
    result.exclusions = exclusions || [];

    // Fetch transports
    const [transports] = await connection.query(
      `SELECT description FROM tour_transports WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.transports = transports || [];

    // Fetch hotels
    const [hotels] = await connection.query(
      `SELECT city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name FROM tour_hotels WHERE mice_id = ?`,
      [miceId]
    );
    result.hotels = hotels || [];

    // Fetch booking POIs
    const [bookingPoi] = await connection.query(
      `SELECT item, amount_details FROM tour_booking_poi WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.bookingpoi = bookingPoi || [];

    // Fetch cancellation policies
    const [cancellationPolicies] = await connection.query(
      `SELECT cancellation_policy, charges FROM tour_cancellation_policies WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.cancellationpolicies = cancellationPolicies || [];

    // Fetch instructions
    const [instructions] = await connection.query(
      `SELECT item FROM tour_instructions WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.instructions = instructions || [];

    // ========== FETCH IMAGES ==========
    const [images] = await connection.query(
      'SELECT * FROM tour_images WHERE mice_id = ? ORDER BY is_cover DESC, image_id ASC',
      [miceId]
    );

    // Process images to add full URLs using baseurl
    const processedImages = images.map(img => ({
      ...img,
      url: img.url.startsWith('http') ? img.url : `http://localhost:5000${img.url}`
    }));
    
    result.images = processedImages;
    // ========== END OF IMAGES FETCH ==========

    const transformedResponse = {
      success: true,
      data: {
        mice_city: result.mice_city,
        tours: result.tours || [],
        itineraries: result.itineraries || [],
        departures: result.departures || [],
        optionaltours: result.optionaltours || [],
        emioptions: result.emioptions || [],
        inclusions: result.inclusions || [],
        exclusions: result.exclusions || [],
        transports: result.transports || [],
        hotels: result.hotels || [],
        bookingpoi: result.bookingpoi || [],
        cancellationpolicies: result.cancellationpolicies || [],
        instructions: result.instructions || [],
        images: result.images || []
      }
    };

    res.json(transformedResponse);

  } catch (err) {
    console.error('❌ Error fetching mice details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Get international mice details by ID - SINGLE VERSION (remove duplicate)
router.get('/international-details/:id', async (req, res) => {
  const miceId = req.params.id;
  let connection;

  console.log('📥 GET /api/mice/international-details/:id');
  console.log(`📌 Mice ID: ${miceId}`);

  try {
    connection = await db.getConnection();

    // Get the mice city data
    const [miceCity] = await connection.query(
      'SELECT * FROM mice_international_cities WHERE id = ?',
      [miceId]
    );

    if (miceCity.length === 0) {
      return res.status(404).json({ error: `Mice city not found with ID: ${miceId}` });
    }

    const result = { mice_city: miceCity[0] };

    // Fetch tours data for this mice
    const [tours] = await connection.query(
      `SELECT * FROM tours WHERE mice_id = ?`,
      [miceId]
    );

    result.tours = tours || [];

    // Fetch itineraries
    const [itineraries] = await connection.query(
      `SELECT * FROM tour_itineraries WHERE mice_id = ? ORDER BY day`,
      [miceId]
    );
    result.itineraries = itineraries || [];

    // Fetch departures
    const [departures] = await connection.query(
      `SELECT 
          start_date, end_date, status, description,
          three_star_twin as standard_twin,
          three_star_triple as standard_triple,
          three_star_single as standard_single,
          four_star_twin as deluxe_twin,
          four_star_triple as deluxe_triple,
          four_star_single as deluxe_single,
          five_star_twin as luxury_twin,
          five_star_triple as luxury_triple,
          five_star_single as luxury_single
       FROM tour_departures 
       WHERE mice_id = ?`,
      [miceId]
    );
    result.departures = departures || [];

    // Fetch optional tours
    const [optionalTours] = await connection.query(
      `SELECT tour_name, adult_price, child_price FROM optional_tours WHERE mice_id = ?`,
      [miceId]
    );
    result.optionaltours = optionalTours || [];

    // Fetch EMI options
    const [emiOptions] = await connection.query(
      `SELECT loan_amount, particulars, months, emi FROM emi_options WHERE mice_id = ? ORDER BY months`,
      [miceId]
    );
    result.emioptions = emiOptions || [];

    // Fetch inclusions
    const [inclusions] = await connection.query(
      `SELECT item FROM tour_inclusions WHERE mice_id = ?`,
      [miceId]
    );
    result.inclusions = inclusions || [];

    // Fetch exclusions
    const [exclusions] = await connection.query(
      `SELECT item FROM tour_exclusions WHERE mice_id = ?`,
      [miceId]
    );
    result.exclusions = exclusions || [];

    // Fetch transports
    const [transports] = await connection.query(
      `SELECT description FROM tour_transports WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.transports = transports || [];

    // Fetch hotels
    const [hotels] = await connection.query(
      `SELECT city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name FROM tour_hotels WHERE mice_id = ?`,
      [miceId]
    );
    result.hotels = hotels || [];

    // Fetch booking POIs
    const [bookingPoi] = await connection.query(
      `SELECT item, amount_details FROM tour_booking_poi WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.bookingpoi = bookingPoi || [];

    // Fetch cancellation policies
    const [cancellationPolicies] = await connection.query(
      `SELECT cancellation_policy, charges FROM tour_cancellation_policies WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.cancellationpolicies = cancellationPolicies || [];

    // Fetch instructions
    const [instructions] = await connection.query(
      `SELECT item FROM tour_instructions WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.instructions = instructions || [];

    // Fetch visa data for international
    const [visaDetails] = await connection.query(
      'SELECT * FROM tour_visa_details WHERE mice_id = ? ORDER BY type, created_at',
      [miceId]
    );
    
    const [visaCurrency] = await connection.query(
      `SELECT * FROM tour_visa_currency WHERE mice_id = ? ORDER BY row_order, created_at`,
      [miceId]
    );
    
    const [visaForms] = await connection.query(
      `SELECT * FROM tour_visa_forms WHERE mice_id = ? ORDER BY row_order, created_at`,
      [miceId]
    );
    
    const [visaFees] = await connection.query(
      'SELECT * FROM tour_visa_fees WHERE mice_id = ? ORDER BY row_order, created_at',
      [miceId]
    );
    
    const [visaSubmission] = await connection.query(
      'SELECT * FROM tour_visa_submission WHERE mice_id = ? ORDER BY row_order, created_at',
      [miceId]
    );

    // Group visa details by type
    const touristVisa = visaDetails.filter(v => v.type === 'tourist').map(v => ({ description: v.description }));
    const transitVisa = visaDetails.filter(v => v.type === 'transit').map(v => ({ description: v.description }));
    const businessVisa = visaDetails.filter(v => v.type === 'business').map(v => ({ description: v.description }));
    
    const structuredCurrency = visaCurrency.filter(c => c.type === 'currency' && !c.description).map(c => ({
      local_currency: c.local_currency,
      currency_conversion_1: c.currency_conversion_1,
      currency_conversion_2: c.currency_conversion_2,
      city_name: c.city_name,
      local_time: c.local_time,
      india_time: c.india_time
    }));
    
    const freeFlowCurrency = visaCurrency.filter(c => c.type === 'free_flow').map(c => ({
      description: c.description
    }));
    
    const touristVisaRemarks = visaForms.length > 0 ? visaForms[0].remarks : '';

    result.visa_details = visaDetails || [];
    result.visa_currency = visaCurrency || [];
    result.structured_currency = structuredCurrency;
    result.free_flow_currency = freeFlowCurrency;
    result.visa_forms = visaForms || [];
    result.visa_fees = visaFees || [];
    result.visa_submission = visaSubmission || [];
    result.tourist_visa = touristVisa;
    result.transit_visa = transitVisa;
    result.business_visa = businessVisa;
    result.tourist_visa_remarks = touristVisaRemarks;

    // ========== FETCH IMAGES ==========
    const [images] = await connection.query(
      'SELECT * FROM tour_images WHERE mice_id = ? ORDER BY is_cover DESC, image_id ASC',
      [miceId]
    );

    // Process images to add full URLs
    const processedImages = images.map(img => ({
      ...img,
      url: img.url.startsWith('http') ? img.url : `http://localhost:5000${img.url}`
    }));
    
    result.images = processedImages;
    // ========== END OF IMAGES FETCH ==========

    const transformedResponse = {
      success: true,
      data: {
        mice_city: result.mice_city,
        tours: result.tours || [],
        itineraries: result.itineraries || [],
        departures: result.departures || [],
        optionaltours: result.optionaltours || [],
        emioptions: result.emioptions || [],
        inclusions: result.inclusions || [],
        exclusions: result.exclusions || [],
        transports: result.transports || [],
        hotels: result.hotels || [],
        bookingpoi: result.bookingpoi || [],
        cancellationpolicies: result.cancellationpolicies || [],
        instructions: result.instructions || [],
        visa_details: result.visa_details || [],
        structured_currency: structuredCurrency,
        free_flow_currency: freeFlowCurrency,
        visa_forms: result.visa_forms || [],
        visa_fees: result.visa_fees || [],
        visa_submission: result.visa_submission || [],
        tourist_visa: touristVisa,
        transit_visa: transitVisa,
        business_visa: businessVisa,
        tourist_visa_remarks: touristVisaRemarks,
        images: result.images || []
      }
    };

    res.json(transformedResponse);

  } catch (err) {
    console.error('❌ Error fetching international mice details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});



// Get international mice details by ID
// Get international mice details by ID
router.get('/international-details/:id', async (req, res) => {
  const miceId = req.params.id;
  let connection;

  console.log('📥 GET /api/mice/international-details/:id');
  console.log(`📌 Mice ID: ${miceId}`);

  try {
    connection = await db.getConnection();

    // Get the mice city data
    const [miceCity] = await connection.query(
      'SELECT * FROM mice_international_cities WHERE id = ?',
      [miceId]
    );

    if (miceCity.length === 0) {
      return res.status(404).json({ error: `Mice city not found with ID: ${miceId}` });
    }

    const result = { mice_city: miceCity[0] };

    // Fetch tours data for this mice
    const [tours] = await connection.query(
      `SELECT * FROM tours WHERE mice_id = ?`,
      [miceId]
    );

    result.tours = tours || [];

    // Fetch itineraries
    const [itineraries] = await connection.query(
      `SELECT * FROM tour_itineraries WHERE mice_id = ? ORDER BY day`,
      [miceId]
    );
    result.itineraries = itineraries || [];

    // Fetch departures
    const [departures] = await connection.query(
      `SELECT 
          start_date, end_date, status, description,
          three_star_twin as standard_twin,
          three_star_triple as standard_triple,
          three_star_single as standard_single,
          four_star_twin as deluxe_twin,
          four_star_triple as deluxe_triple,
          four_star_single as deluxe_single,
          five_star_twin as luxury_twin,
          five_star_triple as luxury_triple,
          five_star_single as luxury_single
       FROM tour_departures 
       WHERE mice_id = ?`,
      [miceId]
    );
    result.departures = departures || [];

    // Fetch optional tours
    const [optionalTours] = await connection.query(
      `SELECT tour_name, adult_price, child_price FROM optional_tours WHERE mice_id = ?`,
      [miceId]
    );
    result.optionaltours = optionalTours || [];

    // Fetch EMI options
    const [emiOptions] = await connection.query(
      `SELECT loan_amount, particulars, months, emi FROM emi_options WHERE mice_id = ? ORDER BY months`,
      [miceId]
    );
    result.emioptions = emiOptions || [];

    // Fetch inclusions
    const [inclusions] = await connection.query(
      `SELECT item FROM tour_inclusions WHERE mice_id = ?`,
      [miceId]
    );
    result.inclusions = inclusions || [];

    // Fetch exclusions
    const [exclusions] = await connection.query(
      `SELECT item FROM tour_exclusions WHERE mice_id = ?`,
      [miceId]
    );
    result.exclusions = exclusions || [];

    // Fetch transports
    const [transports] = await connection.query(
      `SELECT description FROM tour_transports WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.transports = transports || [];

    // Fetch hotels
    const [hotels] = await connection.query(
      `SELECT city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name FROM tour_hotels WHERE mice_id = ?`,
      [miceId]
    );
    result.hotels = hotels || [];

    // Fetch booking POIs
    const [bookingPoi] = await connection.query(
      `SELECT item, amount_details FROM tour_booking_poi WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.bookingpoi = bookingPoi || [];

    // Fetch cancellation policies
    const [cancellationPolicies] = await connection.query(
      `SELECT cancellation_policy, charges FROM tour_cancellation_policies WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.cancellationpolicies = cancellationPolicies || [];

    // Fetch instructions
    const [instructions] = await connection.query(
      `SELECT item FROM tour_instructions WHERE mice_id = ? ORDER BY sort_order`,
      [miceId]
    );
    result.instructions = instructions || [];

    // Fetch visa data for international
    const [visaDetails] = await connection.query(
      'SELECT * FROM tour_visa_details WHERE mice_id = ? ORDER BY type, created_at',
      [miceId]
    );
    
    const [visaCurrency] = await connection.query(
      `SELECT * FROM tour_visa_currency WHERE mice_id = ? ORDER BY row_order, created_at`,
      [miceId]
    );
    
    const [visaForms] = await connection.query(
      `SELECT * FROM tour_visa_forms WHERE mice_id = ? ORDER BY row_order, created_at`,
      [miceId]
    );
    
    const [visaFees] = await connection.query(
      'SELECT * FROM tour_visa_fees WHERE mice_id = ? ORDER BY row_order, created_at',
      [miceId]
    );
    
    const [visaSubmission] = await connection.query(
      'SELECT * FROM tour_visa_submission WHERE mice_id = ? ORDER BY row_order, created_at',
      [miceId]
    );

    // Group visa details by type
    const touristVisa = visaDetails.filter(v => v.type === 'tourist').map(v => ({ description: v.description }));
    const transitVisa = visaDetails.filter(v => v.type === 'transit').map(v => ({ description: v.description }));
    const businessVisa = visaDetails.filter(v => v.type === 'business').map(v => ({ description: v.description }));
    
    const structuredCurrency = visaCurrency.filter(c => c.type === 'currency' && !c.description).map(c => ({
      local_currency: c.local_currency,
      currency_conversion_1: c.currency_conversion_1,
      currency_conversion_2: c.currency_conversion_2,
      city_name: c.city_name,
      local_time: c.local_time,
      india_time: c.india_time
    }));
    
    const freeFlowCurrency = visaCurrency.filter(c => c.type === 'free_flow').map(c => ({
      description: c.description
    }));
    
    const touristVisaRemarks = visaForms.length > 0 ? visaForms[0].remarks : '';

    result.visa_details = visaDetails || [];
    result.visa_currency = visaCurrency || [];
    result.structured_currency = structuredCurrency;
    result.free_flow_currency = freeFlowCurrency;
    result.visa_forms = visaForms || [];
    result.visa_fees = visaFees || [];
    result.visa_submission = visaSubmission || [];
    result.tourist_visa = touristVisa;
    result.transit_visa = transitVisa;
    result.business_visa = businessVisa;
    result.tourist_visa_remarks = touristVisaRemarks;

    // ========== FETCH IMAGES ==========
    const [images] = await connection.query(
      'SELECT * FROM tour_images WHERE mice_id = ? ORDER BY is_cover DESC, image_id ASC',
      [miceId]
    );

    // Process images to add full URLs
    const processedImages = images.map(img => ({
      ...img,
      url: img.url.startsWith('http') ? img.url : `http://localhost:5000${img.url}`
    }));
    
    result.images = processedImages;
    // ========== END OF IMAGES FETCH ==========

    const transformedResponse = {
      success: true,
      data: {
        mice_city: result.mice_city,
        tours: result.tours || [],
        itineraries: result.itineraries || [],
        departures: result.departures || [],
        optionaltours: result.optionaltours || [],
        emioptions: result.emioptions || [],
        inclusions: result.inclusions || [],
        exclusions: result.exclusions || [],
        transports: result.transports || [],
        hotels: result.hotels || [],
        bookingpoi: result.bookingpoi || [],
        cancellationpolicies: result.cancellationpolicies || [],
        instructions: result.instructions || [],
        visa_details: result.visa_details || [],
        structured_currency: structuredCurrency,
        free_flow_currency: freeFlowCurrency,
        visa_forms: result.visa_forms || [],
        visa_fees: result.visa_fees || [],
        visa_submission: result.visa_submission || [],
        tourist_visa: touristVisa,
        transit_visa: transitVisa,
        business_visa: businessVisa,
        tourist_visa_remarks: touristVisaRemarks,
        images: result.images || []  // Added images to response
      }
    };

    res.json(transformedResponse);

  } catch (err) {
    console.error('❌ Error fetching international mice details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Save domestic mice details (POST)
router.post('/domestic-details/:id', async (req, res) => {
  const miceId = req.params.id;
  const details = req.body;
  let connection;

  console.log('========================================');
  console.log('📥 POST /api/mice/domestic-details/:id');
  console.log(`📌 Mice ID: ${miceId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Verify mice city exists
    const [miceCity] = await connection.query(
      'SELECT id, city_name FROM mice_domestic_cities WHERE id = ?',
      [miceId]
    );

    if (miceCity.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Mice city not found with ID: ${miceId}` });
    }

    const cityName = miceCity[0].city_name;

    // Check if tour exists for this mice
    const [existingTour] = await connection.query(
      'SELECT * FROM tours WHERE mice_id = ?',
      [miceId]
    );

    if (existingTour.length === 0) {
      // Create new tour
      const tourCode = `MICE${miceId}`;
      await connection.query(
        `INSERT INTO tours 
        (tour_code, title, tour_type, duration_days, overview,
         base_price_adult, emi_price, cost_remarks, hotel_remarks,
         transport_remarks, emi_remarks, booking_poi_remarks, 
         cancellation_remarks, optional_tour_remarks, status, mice_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tourCode,
          details.exhibition_name || cityName,
          'mice',
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
          miceId
        ]
      );
    } else {
      // Update existing tour
      await connection.query(
        `UPDATE tours SET 
          title = ?, duration_days = ?, overview = ?,
          base_price_adult = ?, emi_price = ?,
          cost_remarks = ?, hotel_remarks = ?, transport_remarks = ?,
          emi_remarks = ?, booking_poi_remarks = ?, cancellation_remarks = ?,
          optional_tour_remarks = ?, updated_at = NOW()
        WHERE mice_id = ?`,
        [
          details.exhibition_name || cityName,
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
          miceId
        ]
      );
    }

    // ITINERARIES
    await connection.query('DELETE FROM tour_itineraries WHERE mice_id = ?', [miceId]);
    if (details.itineraries?.length) {
      const values = details.itineraries.map(i => [
        miceId,
        i.day,
        i.title,
        i.description || null,
        i.meals || null
      ]);
      await connection.query(
        'INSERT INTO tour_itineraries (mice_id, day, title, description, meals) VALUES ?',
        [values]
      );
    }

    // DEPARTURES
    await connection.query('DELETE FROM tour_departures WHERE mice_id = ?', [miceId]);
    if (details.departures?.length) {
      for (const dep of details.departures) {
        await connection.query(
          `INSERT INTO tour_departures 
          (mice_id, start_date, end_date, status, description,
           three_star_twin, three_star_triple, three_star_single,
           four_star_twin, four_star_triple, four_star_single,
           five_star_twin, five_star_triple, five_star_single,
           tour_type, departure_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            miceId,
            dep.start_date || null,
            dep.end_date || null,
            dep.status || 'Available',
            dep.description || null,
            dep.standard_twin || null,
            dep.standard_triple || null,
            dep.standard_single || null,
            dep.deluxe_twin || null,
            dep.deluxe_triple || null,
            dep.deluxe_single || null,
            dep.luxury_twin || null,
            dep.luxury_triple || null,
            dep.luxury_single || null,
            'mice',
            dep.description || null
          ]
        );
      }
    }

    // OPTIONAL TOURS
    await connection.query('DELETE FROM optional_tours WHERE mice_id = ?', [miceId]);
    if (details.optional_tours?.length) {
      const values = details.optional_tours.map(o => [
        miceId,
        o.tour_name,
        o.adult_price || null,
        o.child_price || null
      ]);
      await connection.query(
        'INSERT INTO optional_tours (mice_id, tour_name, adult_price, child_price) VALUES ?',
        [values]
      );
    }

    // EMI OPTIONS
    await connection.query('DELETE FROM emi_options WHERE mice_id = ?', [miceId]);
    if (details.emi_options?.length && details.emi_loan_amount) {
      const values = details.emi_options.map(e => [
        miceId,
        details.emi_loan_amount,
        e.particulars,
        e.months,
        e.emi
      ]);
      await connection.query(
        'INSERT INTO emi_options (mice_id, loan_amount, particulars, months, emi) VALUES ?',
        [values]
      );
    }

    // INCLUSIONS
    await connection.query('DELETE FROM tour_inclusions WHERE mice_id = ?', [miceId]);
    if (details.inclusions?.length) {
      const values = details.inclusions.map(i => [miceId, i]);
      await connection.query(
        'INSERT INTO tour_inclusions (mice_id, item) VALUES ?',
        [values]
      );
    }

    // EXCLUSIONS
    await connection.query('DELETE FROM tour_exclusions WHERE mice_id = ?', [miceId]);
    if (details.exclusions?.length) {
      const values = details.exclusions.map(e => [miceId, e]);
      await connection.query(
        'INSERT INTO tour_exclusions (mice_id, item) VALUES ?',
        [values]
      );
    }

    // TRANSPORTS
    await connection.query('DELETE FROM tour_transports WHERE mice_id = ?', [miceId]);
    if (details.transports?.length) {
      const values = details.transports.map((t, idx) => [
        t.description || null,
        idx + 1,
        miceId
      ]);
      await connection.query(
        `INSERT INTO tour_transports 
        (description, sort_order, mice_id) VALUES ?`,
        [values]
      );
    }

    // HOTELS
    await connection.query('DELETE FROM tour_hotels WHERE mice_id = ?', [miceId]);
    if (details.hotels?.length) {
      const values = details.hotels.map(h => [
        miceId,
        h.city || null,
        h.nights || null,
        h.standard_hotel_name || null,
        h.deluxe_hotel_name || null,
        h.executive_hotel_name || null
      ]);
      await connection.query(
        `INSERT INTO tour_hotels 
        (mice_id, city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name) VALUES ?`,
        [values]
      );
    }

    // BOOKING POI
    await connection.query('DELETE FROM tour_booking_poi WHERE mice_id = ?', [miceId]);
    if (details.booking_pois?.length) {
      const values = details.booking_pois.map((p, idx) => [
        miceId,
        p.item,
        idx + 1,
        p.amount_details || null
      ]);
      await connection.query(
        `INSERT INTO tour_booking_poi 
        (mice_id, item, sort_order, amount_details) VALUES ?`,
        [values]
      );
    }

    // CANCELLATION POLICIES
    await connection.query('DELETE FROM tour_cancellation_policies WHERE mice_id = ?', [miceId]);
    if (details.cancellation_policies?.length) {
      const values = details.cancellation_policies.map((c, idx) => [
        miceId,
        c.cancellation_policy || null,
        idx + 1,
        c.charges || null
      ]);
      await connection.query(
        `INSERT INTO tour_cancellation_policies 
        (mice_id, cancellation_policy, sort_order, charges) VALUES ?`,
        [values]
      );
    }

    // INSTRUCTIONS
    await connection.query('DELETE FROM tour_instructions WHERE mice_id = ?', [miceId]);
    if (details.instructions?.length) {
      const values = details.instructions.map((i, idx) => [
        miceId,
        i,
        idx + 1
      ]);
      await connection.query(
        'INSERT INTO tour_instructions (mice_id, item, sort_order) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    res.json({ 
      success: true, 
      message: 'Mice details saved successfully',
      mice_id: miceId
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('❌ Error saving mice details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Save international mice details (POST)
router.post('/international-details/:id', async (req, res) => {
  const miceId = req.params.id;
  const details = req.body;
  let connection;

  console.log('========================================');
  console.log('📥 POST /api/mice/international-details/:id');
  console.log(`📌 Mice ID: ${miceId}`);
  console.log('========================================');

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Verify mice city exists
    const [miceCity] = await connection.query(
      'SELECT id, city_name FROM mice_international_cities WHERE id = ?',
      [miceId]
    );

    if (miceCity.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: `Mice city not found with ID: ${miceId}` });
    }

    const cityName = miceCity[0].city_name;

    // Check if tour exists for this mice
    const [existingTour] = await connection.query(
      'SELECT * FROM tours WHERE mice_id = ?',
      [miceId]
    );

    if (existingTour.length === 0) {
      const tourCode = `INTMICE${miceId}`;
      await connection.query(
        `INSERT INTO tours 
        (tour_code, title, tour_type, duration_days, overview,
         base_price_adult, emi_price, cost_remarks, hotel_remarks,
         transport_remarks, emi_remarks, booking_poi_remarks, 
         cancellation_remarks, optional_tour_remarks, status, mice_id, is_international)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          tourCode,
          details.exhibition_name || cityName,
          'mice',
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
          miceId
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
        WHERE mice_id = ?`,
        [
          details.exhibition_name || cityName,
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
          miceId
        ]
      );
    }

    // Get tour_id for visa data
    const [tour] = await connection.query(
      'SELECT tour_id FROM tours WHERE mice_id = ?',
      [miceId]
    );
    const tourId = tour.length > 0 ? tour[0].tour_id : null;

    // ITINERARIES
    await connection.query('DELETE FROM tour_itineraries WHERE mice_id = ?', [miceId]);
    if (details.itineraries?.length) {
      const values = details.itineraries.map(i => [
        miceId,
        i.day,
        i.title,
        i.description || null,
        i.meals || null
      ]);
      await connection.query(
        'INSERT INTO tour_itineraries (mice_id, day, title, description, meals) VALUES ?',
        [values]
      );
    }

    // DEPARTURES
    await connection.query('DELETE FROM tour_departures WHERE mice_id = ?', [miceId]);
    if (details.departures?.length) {
      for (const dep of details.departures) {
        await connection.query(
          `INSERT INTO tour_departures 
          (mice_id, start_date, end_date, status, description,
           three_star_twin, three_star_triple, three_star_single,
           four_star_twin, four_star_triple, four_star_single,
           five_star_twin, five_star_triple, five_star_single,
           tour_type, departure_text)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            miceId,
            dep.start_date || null,
            dep.end_date || null,
            dep.status || 'Available',
            dep.description || null,
            dep.standard_twin || null,
            dep.standard_triple || null,
            dep.standard_single || null,
            dep.deluxe_twin || null,
            dep.deluxe_triple || null,
            dep.deluxe_single || null,
            dep.luxury_twin || null,
            dep.luxury_triple || null,
            dep.luxury_single || null,
            'mice',
            dep.description || null
          ]
        );
      }
    }

    // OPTIONAL TOURS
    await connection.query('DELETE FROM optional_tours WHERE mice_id = ?', [miceId]);
    if (details.optional_tours?.length) {
      const values = details.optional_tours.map(o => [
        miceId,
        o.tour_name,
        o.adult_price || null,
        o.child_price || null
      ]);
      await connection.query(
        'INSERT INTO optional_tours (mice_id, tour_name, adult_price, child_price) VALUES ?',
        [values]
      );
    }

    // EMI OPTIONS
    await connection.query('DELETE FROM emi_options WHERE mice_id = ?', [miceId]);
    if (details.emi_options?.length && details.emi_loan_amount) {
      const values = details.emi_options.map(e => [
        miceId,
        details.emi_loan_amount,
        e.particulars,
        e.months,
        e.emi
      ]);
      await connection.query(
        'INSERT INTO emi_options (mice_id, loan_amount, particulars, months, emi) VALUES ?',
        [values]
      );
    }

    // INCLUSIONS
    await connection.query('DELETE FROM tour_inclusions WHERE mice_id = ?', [miceId]);
    if (details.inclusions?.length) {
      const values = details.inclusions.map(i => [miceId, i]);
      await connection.query(
        'INSERT INTO tour_inclusions (mice_id, item) VALUES ?',
        [values]
      );
    }

    // EXCLUSIONS
    await connection.query('DELETE FROM tour_exclusions WHERE mice_id = ?', [miceId]);
    if (details.exclusions?.length) {
      const values = details.exclusions.map(e => [miceId, e]);
      await connection.query(
        'INSERT INTO tour_exclusions (mice_id, item) VALUES ?',
        [values]
      );
    }

    // TRANSPORTS
    await connection.query('DELETE FROM tour_transports WHERE mice_id = ?', [miceId]);
    if (details.transports?.length) {
      const values = details.transports.map((t, idx) => [
        t.description || null,
        idx + 1,
        miceId
      ]);
      await connection.query(
        `INSERT INTO tour_transports 
        (description, sort_order, mice_id) VALUES ?`,
        [values]
      );
    }

    // HOTELS
    await connection.query('DELETE FROM tour_hotels WHERE mice_id = ?', [miceId]);
    if (details.hotels?.length) {
      const values = details.hotels.map(h => [
        miceId,
        h.city || null,
        h.nights || null,
        h.standard_hotel_name || null,
        h.deluxe_hotel_name || null,
        h.executive_hotel_name || null
      ]);
      await connection.query(
        `INSERT INTO tour_hotels 
        (mice_id, city, nights, standard_hotel_name, deluxe_hotel_name, executive_hotel_name) VALUES ?`,
        [values]
      );
    }

    // BOOKING POI
    await connection.query('DELETE FROM tour_booking_poi WHERE mice_id = ?', [miceId]);
    if (details.booking_pois?.length) {
      const values = details.booking_pois.map((p, idx) => [
        miceId,
        p.item,
        idx + 1,
        p.amount_details || null
      ]);
      await connection.query(
        `INSERT INTO tour_booking_poi 
        (mice_id, item, sort_order, amount_details) VALUES ?`,
        [values]
      );
    }

    // CANCELLATION POLICIES
    await connection.query('DELETE FROM tour_cancellation_policies WHERE mice_id = ?', [miceId]);
    if (details.cancellation_policies?.length) {
      const values = details.cancellation_policies.map((c, idx) => [
        miceId,
        c.cancellation_policy || null,
        idx + 1,
        c.charges || null
      ]);
      await connection.query(
        `INSERT INTO tour_cancellation_policies 
        (mice_id, cancellation_policy, sort_order, charges) VALUES ?`,
        [values]
      );
    }

    // INSTRUCTIONS
    await connection.query('DELETE FROM tour_instructions WHERE mice_id = ?', [miceId]);
    if (details.instructions?.length) {
      const values = details.instructions.map((i, idx) => [
        miceId,
        i,
        idx + 1
      ]);
      await connection.query(
        'INSERT INTO tour_instructions (mice_id, item, sort_order) VALUES ?',
        [values]
      );
    }

    // ========== VISA DATA FOR INTERNATIONAL ==========
    if (details.visa_data && tourId) {
      const visaData = details.visa_data;
      
      await connection.query('DELETE FROM tour_visa_details WHERE mice_id = ?', [miceId]);
      await connection.query('DELETE FROM tour_visa_fees WHERE mice_id = ?', [miceId]);
      await connection.query('DELETE FROM tour_visa_forms WHERE mice_id = ?', [miceId]);
      await connection.query('DELETE FROM tour_visa_submission WHERE mice_id = ?', [miceId]);
      await connection.query('DELETE FROM tour_visa_currency WHERE mice_id = ?', [miceId]);
      
      // Insert visa details
      const visaTypes = ['tourist', 'transit', 'business'];
      for (const type of visaTypes) {
        let items = [];
        if (type === 'tourist') items = visaData.tourist_visa || [];
        else if (type === 'transit') items = visaData.transit_visa || [];
        else if (type === 'business') items = visaData.business_visa || [];
        
        if (items.length > 0) {
          const values = items.map(item => [
            tourId,
            miceId,
            type,
            item.description || null
          ]);
          await connection.query(
            'INSERT INTO tour_visa_details (tour_id, mice_id, type, description) VALUES ?',
            [values]
          );
        }
      }
      
      // Insert visa currency data
      if (visaData.currency && visaData.currency.length > 0) {
        for (let i = 0; i < visaData.currency.length; i++) {
          const currency = visaData.currency[i];
          
          if (currency.local_currency || currency.city_name) {
            await connection.query(
              `INSERT INTO tour_visa_currency 
              (tour_id, mice_id, local_currency, currency_conversion_1, currency_conversion_2, 
               city_name, local_time, india_time, type, row_order)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                tourId,
                miceId,
                currency.local_currency || null,
                currency.currency_conversion_1 || null,
                currency.currency_conversion_2 || null,
                currency.city_name || null,
                currency.local_time || null,
                currency.india_time || null,
                'currency',
                i
              ]
            );
          } else if (currency.description) {
            await connection.query(
              `INSERT INTO tour_visa_currency 
              (tour_id, mice_id, description, type, row_order)
              VALUES (?, ?, ?, ?, ?)`,
              [
                tourId,
                miceId,
                currency.description || null,
                'free_flow',
                i
              ]
            );
          }
        }
      }
      
     // Insert visa forms
if (visaData.visa_forms && visaData.visa_forms.length > 0) {
  for (let i = 0; i < visaData.visa_forms.length; i++) {
    const form = visaData.visa_forms[i];
    
    let action1File = form.action1_file;
    let action2File = form.action2_file;
    
    // Handle file objects
    if (action1File && typeof action1File === 'object' && action1File.name) {
      action1File = action1File.name;
    } else if (action1File && typeof action1File === 'string' && action1File.length > 0) {
      action1File = action1File;
    } else {
      action1File = null;
    }
    
    if (action2File && typeof action2File === 'object' && action2File.name) {
      action2File = action2File.name;
    } else if (action2File && typeof action2File === 'string' && action2File.length > 0) {
      action2File = action2File;
    } else {
      action2File = null;
    }
    
    // Ensure we're not sending empty strings to the database
    const remarks = visaData.tourist_visa_remarks && typeof visaData.tourist_visa_remarks === 'string' 
      ? visaData.tourist_visa_remarks 
      : null;
    
    await connection.query(
      `INSERT INTO tour_visa_forms 
      (tour_id, mice_id, visa_type, download_action, fill_action, action1_file, action2_file, remarks, row_order) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tourId,
        miceId,
        form.type || 'Other',
        form.download_action || 'Download',
        form.fill_action || 'Fill Manually',
        action1File,
        action2File,
        remarks,
        i
      ]
    );
  }
}
      
      // Insert visa fees
      if (visaData.visa_fees && visaData.visa_fees.length > 0) {
        for (let i = 0; i < visaData.visa_fees.length; i++) {
          const fee = visaData.visa_fees[i];
          await connection.query(
            `INSERT INTO tour_visa_fees 
            (tour_id, mice_id, row_type, tourist, transit, business, 
             tourist_charges, transit_charges, business_charges, row_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              tourId,
              miceId,
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
            (tour_id, mice_id, label, tourist, transit, business, row_order) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              tourId,
              miceId,
              sub.label || 'Free Flow Entry',
              sub.tourist || null,
              sub.transit || null,
              sub.business || null,
              i
            ]
          );
        }
      }
      
      console.log(`✅ Visa data saved for mice ${miceId}`);
    }

    await connection.commit();

    res.json({
      success: true,
      message: 'International mice details saved successfully',
      mice_id: miceId
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('Error saving international mice details:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// ========== MICE IMAGES ROUTES ==========

// Upload images for mice
router.post('/mice-images/upload/:mice_id', (req, res) => {
  contentUpload.array('images', 10)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const miceId = req.params.mice_id;
    const files = req.files || [];
    
    if (!files.length) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const values = files.map(file => [
        null,
        null,
        miceId,
        `/uploads/mice/gallery/${file.filename}`,
        null,
        0
      ]);
      
      await connection.query(
        'INSERT INTO tour_images (tour_id, exhibition_id, mice_id, url, caption, is_cover) VALUES ?',
        [values]
      );
      
      await connection.commit();
      
      res.status(201).json({
        message: `${files.length} image(s) uploaded successfully`,
        uploaded: files.map(f => `/uploads/mice/gallery/${f.filename}`)
      });
    } catch (err) {
      await connection.rollback();
      console.error('Error uploading images:', err);
      res.status(500).json({ error: err.message });
    } finally {
      connection.release();
    }
  });
});

// Get images for mice
router.get('/mice-images/:mice_id', async (req, res) => {
  console.log(`📥 GET /api/mice/mice-images/${req.params.mice_id}`);
  try {
    const [rows] = await db.query(
      'SELECT * FROM tour_images WHERE mice_id = ? ORDER BY is_cover DESC, image_id ASC',
      [req.params.mice_id]
    );
    
    // Add full URL for images
    const imagesWithUrl = rows.map(img => ({
      ...img,
      url: img.url.startsWith('http') ? img.url : `${req.protocol}://${req.get('host')}${img.url}`
    }));
    
    res.json(imagesWithUrl);
  } catch (err) {
    console.error('Error fetching images:', err);
    res.status(500).json({ error: err.message });
  }
});

// Set cover image for mice
router.put('/mice-images/cover/:image_id', async (req, res) => {
  console.log(`📥 PUT /api/mice/mice-images/cover/${req.params.image_id}`);
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const [img] = await connection.query(
      'SELECT mice_id FROM tour_images WHERE image_id = ?',
      [req.params.image_id]
    );
    
    if (img.length === 0) {
      return res.status(404).json({ message: "Image not found" });
    }
    
    await connection.query(
      'UPDATE tour_images SET is_cover = 0 WHERE mice_id = ?',
      [img[0].mice_id]
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

// Delete image for mice
router.delete('/mice-images/:image_id', async (req, res) => {
  console.log(`📥 DELETE /api/mice/mice-images/${req.params.image_id}`);
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
    const filePath = path.join('uploads/mice/gallery/', filename);
    
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


// Add this route after your other routes
// ========== VISA FILE UPLOAD ROUTE ==========
router.post('/upload-visa-file', uploadVisaFile, async (req, res) => {
  try {
    console.log('📤 MICE Visa file upload request:', {
      file: req.file ? req.file.originalname : 'No file'
    });

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded or invalid file type' 
      });
    }

    const fileName = req.file.filename;
    const fileUrl = `/uploads/mice/visa/${fileName}`;

    res.json({
      success: true,
      fileName: fileName,
      fileUrl: fileUrl,
      originalName: req.file.originalname,
      message: 'File uploaded successfully'
    });

  } catch (err) {
    console.error('❌ MICE Visa file upload error:', err);
    
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

module.exports = router;