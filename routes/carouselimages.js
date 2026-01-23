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
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Create unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'carousel-' + uniqueSuffix + ext);
  }
});

// File filter for images only
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
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload new carousel image
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { title, description, display_order = 0, is_active = true } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image file is required'
      });
    }
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }
    
    const image_url = `/uploads/carousel/${req.file.filename}`;
    
    const [result] = await pool.query(
      `INSERT INTO carousel_images (image_url, title, description, display_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [image_url, title, description, display_order, is_active]
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
      'SELECT * FROM carousel_images ORDER BY display_order, created_at DESC'
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
      'SELECT * FROM carousel_images WHERE is_active = TRUE ORDER BY display_order, created_at DESC'
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

// Update carousel image
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, display_order, is_active } = req.body;
    
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data to update'
      });
    }
    
    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    
    Object.keys(updateData).forEach(key => {
      updateFields.push(`${key} = ?`);
      updateValues.push(updateData[key]);
    });
    
    updateValues.push(id);
    
    const query = `UPDATE carousel_images SET ${updateFields.join(', ')} WHERE id = ?`;
    
    const [result] = await pool.query(query, updateValues);
    
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
    const { images } = req.body; // Array of {id, display_order}
    
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Images array is required'
      });
    }
    
    // Start transaction
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

module.exports = router;