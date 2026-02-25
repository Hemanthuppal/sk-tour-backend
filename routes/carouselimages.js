const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

// Configure multer for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/carousel');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'carousel-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// Upload new carousel image (removed title, description fields)
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required'
      });
    }
    
    const image_url = `/uploads/carousel/${req.file.filename}`;
    
    // Get current max display_order to add new image at the end
    const [maxOrderResult] = await pool.query(
      'SELECT MAX(display_order) as max_order FROM carousel_images'
    );
    const nextOrder = (maxOrderResult[0].max_order || 0) + 1;
    
    const [result] = await pool.query(
      `INSERT INTO carousel_images (image_url, display_order, is_active)
       VALUES (?, ?, ?)`,
      [image_url, nextOrder, true] // Default to active
    );
    
    const [newImage] = await pool.query(
      'SELECT * FROM carousel_images WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: newImage[0]
    });
    
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading image',
      error: error.message
    });
  }
});

// Get all carousel images (for admin)
router.get('/admin', async (req, res) => {
  try {
    const [images] = await pool.query(
      'SELECT id, image_url, display_order, is_active, created_at, updated_at FROM carousel_images ORDER BY display_order ASC'
    );
    
    res.json({
      success: true,
      data: images
    });
    
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching images',
      error: error.message
    });
  }
});

// Get active carousel images (for frontend)
router.get('/active', async (req, res) => {
  try {
    const [images] = await pool.query(
      'SELECT id, image_url, display_order FROM carousel_images WHERE is_active = TRUE ORDER BY display_order ASC'
    );
    
    res.json({
      success: true,
      data: images
    });
    
  } catch (error) {
    console.error('Error fetching active images:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching images',
      error: error.message
    });
  }
});

// Update carousel image - only is_active
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    if (is_active === undefined) {
      return res.status(400).json({
        success: false,
        message: 'is_active field is required'
      });
    }
    
    const [result] = await pool.query(
      'UPDATE carousel_images SET is_active = ? WHERE id = ?',
      [is_active, id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    const [updatedImage] = await pool.query(
      'SELECT * FROM carousel_images WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Image status updated successfully',
      data: updatedImage[0]
    });
    
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating image',
      error: error.message
    });
  }
});

// Delete carousel image
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get image details first to delete file
    const [images] = await pool.query(
      'SELECT image_url FROM carousel_images WHERE id = ?',
      [id]
    );
    
    if (images.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    // Delete the file from server
    const imagePath = path.join(__dirname, '..', images[0].image_url);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // Delete from database
    const [result] = await pool.query(
      'DELETE FROM carousel_images WHERE id = ?',
      [id]
    );
    
    // Reorder remaining images
    const [remainingImages] = await pool.query(
      'SELECT id FROM carousel_images ORDER BY display_order ASC'
    );
    
    // Update display_order for remaining images
    for (let i = 0; i < remainingImages.length; i++) {
      await pool.query(
        'UPDATE carousel_images SET display_order = ? WHERE id = ?',
        [i, remainingImages[i].id]
      );
    }
    
    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting image',
      error: error.message
    });
  }
});

// Update image order (bulk update)
router.put('/update-order', async (req, res) => {
  try {
    const { images } = req.body;
    
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Images array is required'
      });
    }
    
    await pool.query('START TRANSACTION');
    
    try {
      for (const img of images) {
        await pool.query(
          'UPDATE carousel_images SET display_order = ? WHERE id = ?',
          [img.display_order, img.id]
        );
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Order updated successfully'
      });
      
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating order',
      error: error.message
    });
  }
});



// Update carousel image with file replacement
router.put('/:id/update-with-image', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, link } = req.body;
    
    // Get existing image details
    const [existingImages] = await pool.query(
      'SELECT image_url FROM carousel_images WHERE id = ?',
      [id]
    );
    
    if (existingImages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    let image_url = existingImages[0].image_url;
    
    // If new image is uploaded, delete old one and use new
    if (req.file) {
      // Delete old file
      const oldImagePath = path.join(__dirname, '..', existingImages[0].image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
      
      // Set new image URL
      image_url = `/uploads/carousel/${req.file.filename}`;
    }
    
    // Check which columns exist
    const [columns] = await pool.query('SHOW COLUMNS FROM carousel_images');
    const columnNames = columns.map(col => col.Field);
    
    // Build query dynamically based on existing columns
    let setClauses = ['image_url = ?'];
    let values = [image_url];
    
    if (columnNames.includes('title')) {
      setClauses.push('title = ?');
      values.push(title || null);
    }
    
    if (columnNames.includes('description')) {
      setClauses.push('description = ?');
      values.push(description || null);
    }
    
    if (columnNames.includes('link')) {
      setClauses.push('link = ?');
      values.push(link || null);
    }
    
    values.push(id);
    
    const query = `UPDATE carousel_images SET ${setClauses.join(', ')} WHERE id = ?`;
    
    const [result] = await pool.query(query, values);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }
    
    // Fetch updated image
    const [updatedImage] = await pool.query(
      'SELECT * FROM carousel_images WHERE id = ?',
      [id]
    );
    
    res.json({
      success: true,
      message: 'Image updated successfully',
      data: updatedImage[0]
    });
    
  } catch (error) {
    console.error('Error updating image:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating image',
      error: error.message
    });
  }
});

module.exports = router;