const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');

// Helper function to ensure directory exists
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

// Configure multer storage for MICE with proper directory creation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/mice/';
    
    // Determine subfolder based on route
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
    
    // Create directory if it doesn't exist
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'));
    }
  }
});

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

// ==================== MICE MAIN PAGE ====================

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
  upload.single('bannerImage')(req, res, async (err) => {
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
          // Filter out empty questions/answers
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
            // Delete old banner image
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

// ==================== FREE FLOW ENTRY ====================

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
  upload.single('image')(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    try {
      const { meetingText, incentivesText, conferenceText, eventsText, id } = req.body;
      const image = req.file ? req.file.filename : null;
      
      // Validate required fields
      if (!meetingText || !incentivesText || !conferenceText || !eventsText) {
        return res.status(400).json({ error: 'All text fields are required' });
      }
      
      if (id) {
        if (image) {
          // Get old image to delete
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

// ==================== SAMPLE PACKAGES ====================

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
  upload.array('images', 10)(req, res, async (err) => {
    if (err) {
      return handleMulterError(err, req, res, () => {});
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const { days, price, id } = req.body;
      const files = req.files || [];
      
      // Validate required fields
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
    
    // Get images to delete files
    const [images] = await connection.query(
      'SELECT image_path FROM mice_package_images WHERE package_id = ?',
      [req.params.id]
    );
    
    // Delete image files
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

// ==================== OUR CLIENTS ====================

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
  upload.array('images', 20)(req, res, async (err) => {
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
    // Get image path before deleting
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

// ==================== VENUES ====================

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
  upload.array('images', 20)(req, res, async (err) => {
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

// ==================== MICE GALLERY ====================

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
  upload.array('images', 50)(req, res, async (err) => {
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

// ==================== UPCOMING EVENTS ====================

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
  upload.array('images', 20)(req, res, async (err) => {
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

module.exports = router;