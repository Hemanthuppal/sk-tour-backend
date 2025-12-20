const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { upload, deleteFile } = require('../middlewares/uploadMiddleware');
const path = require('path');

// Test route
router.get('/test', (req, res) => {
  res.json({ 
    message: '✅ Video routes are working!',
    timestamp: new Date().toISOString()
  });
});

// @route   GET /api/videos
// @desc    Get all active videos for frontend
// @access  Public
router.get('/', (req, res) => {
  console.log('📥 Fetching active videos...');
  
  const sql = 'SELECT * FROM video_carousel WHERE is_active = TRUE ORDER BY display_order ASC, created_at DESC';
  
  pool.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Database error fetching videos:', err.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message
      });
    }
    
    console.log(`✅ Found ${results.length} active videos`);
    
    // Add full URL for video files
    const videosWithFullUrl = results.map(video => {
      const fullUrl = video.video_url.startsWith('http') 
        ? video.video_url 
        : `${req.protocol}://${req.get('host')}${video.video_url}`;
      
      return {
        ...video,
        video_url: fullUrl,
        is_active: Boolean(video.is_active)
      };
    });
    
    res.json(videosWithFullUrl);
  });
});

// @route   GET /api/videos/admin
// @desc    Get all videos for admin panel
// @access  Public
router.get('/admin', (req, res) => {
  console.log('📥 Fetching all videos for admin...');
  
  const sql = 'SELECT * FROM video_carousel ORDER BY display_order ASC, created_at DESC';
  
  pool.query(sql, (err, results) => {
    if (err) {
      console.error('❌ Database error fetching admin videos:', err.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message
      });
    }
    
    console.log(`✅ Found ${results.length} videos`);
    
    // Add full URL for video files
    const videosWithFullUrl = results.map(video => {
      const fullUrl = video.video_url.startsWith('http') 
        ? video.video_url 
        : `${req.protocol}://${req.get('host')}${video.video_url}`;
      
      return {
        ...video,
        video_url: fullUrl,
        is_active: Boolean(video.is_active)
      };
    });
    
    res.json(videosWithFullUrl);
  });
});

// @route   POST /api/videos
// @desc    Add new video with file upload
// @access  Public
router.post('/', upload.single('videoFile'), (req, res) => {
  console.log('⬆️  Uploading new video...');
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: '❌ No video file uploaded' });
    }

    const { 
      title, 
      description = '', 
      gradient_classes = 'from-emerald-500/20 to-cyan-500/20',
      display_order = 0,
      is_active = true
    } = req.body;

    if (!title || title.trim() === '') {
      deleteFile(req.file.path);
      return res.status(400).json({ error: '❌ Title is required' });
    }

    const video_url = `/video-uploads/videos/${req.file.filename}`;
    console.log('📹 Video URL to save:', video_url);
    
    const sql = `
      INSERT INTO video_carousel 
      (title, description, video_url, gradient_classes, display_order, is_active) 
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      title.trim(), 
      description.trim(), 
      video_url, 
      gradient_classes, 
      parseInt(display_order) || 0, 
      is_active === 'true' || is_active === true ? 1 : 0
    ];
    
    console.log('📊 SQL values:', values);
    
    pool.query(sql, values, (err, result) => {
      if (err) {
        deleteFile(req.file.path);
        console.error('❌ Error inserting video:', err.message);
        return res.status(500).json({ 
          error: 'Database error', 
          message: err.message
        });
      }
      
      console.log('✅ Video inserted with ID:', result.insertId);
      
      // Get the newly inserted video
      pool.query('SELECT * FROM video_carousel WHERE id = ?', [result.insertId], (err, results) => {
        if (err) {
          console.error('❌ Error fetching new video:', err.message);
          return res.status(500).json({ 
            error: 'Database error',
            message: err.message
          });
        }
        
        const newVideo = results[0];
        const fullUrl = `${req.protocol}://${req.get('host')}${newVideo.video_url}`;
        
        res.status(201).json({
          message: '✅ Video added successfully!',
          id: result.insertId,
          video: {
            ...newVideo,
            video_url: fullUrl,
            is_active: Boolean(newVideo.is_active)
          }
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Error in video upload:', error.message);
    
    if (req.file && req.file.path) {
      deleteFile(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Upload failed', 
      message: error.message 
    });
  }
});

// @route   PUT /api/videos/:id
// @desc    Update video details
// @access  Public
router.put('/:id', upload.single('videoFile'), (req, res) => {
  const videoId = req.params.id;
  console.log(`✏️  Updating video ID: ${videoId}`);
  
  // Check if video exists
  pool.query('SELECT video_url FROM video_carousel WHERE id = ?', [videoId], (err, results) => {
    if (err) {
      console.error('❌ Error finding video:', err.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message
      });
    }
    
    if (results.length === 0) {
      if (req.file && req.file.path) {
        deleteFile(req.file.path);
      }
      return res.status(404).json({ error: '❌ Video not found' });
    }
    
    const oldVideo = results[0];
    let video_url = oldVideo.video_url;
    let oldFilePath = null;
    
    if (req.file) {
      if (oldVideo.video_url && !oldVideo.video_url.startsWith('http')) {
        const oldFileName = path.basename(oldVideo.video_url);
        oldFilePath = path.join(__dirname, '../uploads/videos', oldFileName);
      }
      
      video_url = `/video-uploads/videos/${req.file.filename}`;
    }
    
    const { 
      title, 
      description = '', 
      gradient_classes,
      display_order,
      is_active = true
    } = req.body;
    
    if (!title || title.trim() === '') {
      if (req.file && req.file.path) {
        deleteFile(req.file.path);
      }
      return res.status(400).json({ error: '❌ Title is required' });
    }
    
    const sql = `
      UPDATE video_carousel 
      SET title = ?, 
          description = ?, 
          video_url = ?,
          gradient_classes = ?, 
          display_order = ?, 
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const values = [
      title.trim(), 
      description.trim(), 
      video_url, 
      gradient_classes || 'from-emerald-500/20 to-cyan-500/20',
      parseInt(display_order) || 0, 
      is_active === 'true' || is_active === true ? 1 : 0, 
      videoId
    ];
    
    pool.query(sql, values, (err, result) => {
      if (err) {
        if (req.file && req.file.path) {
          deleteFile(req.file.path);
        }
        console.error('❌ Error updating video:', err.message);
        return res.status(500).json({ 
          error: 'Database error', 
          message: err.message
        });
      }
      
      if (oldFilePath) {
        deleteFile(oldFilePath);
      }
      
      console.log('✅ Video updated, affected rows:', result.affectedRows);
      
      res.json({ 
        message: '✅ Video updated successfully!',
        updated: result.affectedRows 
      });
    });
  });
});

// @route   DELETE /api/videos/:id
// @desc    Delete video
// @access  Public
router.delete('/:id', (req, res) => {
  const videoId = req.params.id;
  console.log(`🗑️  Deleting video ID: ${videoId}`);
  
  const getSql = 'SELECT video_url FROM video_carousel WHERE id = ?';
  
  pool.query(getSql, [videoId], (err, results) => {
    if (err) {
      console.error('❌ Error finding video:', err.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message
      });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: '❌ Video not found' });
    }
    
    const videoUrl = results[0].video_url;
    
    if (videoUrl && !videoUrl.startsWith('http')) {
      const fileName = path.basename(videoUrl);
      const filePath = path.join(__dirname, '../uploads/videos', fileName);
      deleteFile(filePath);
    }
    
    const deleteSql = 'DELETE FROM video_carousel WHERE id = ?';
    
    pool.query(deleteSql, [videoId], (err, result) => {
      if (err) {
        console.error('❌ Error deleting video:', err.message);
        return res.status(500).json({ 
          error: 'Database error',
          message: err.message
        });
      }
      
      console.log('✅ Video deleted, affected rows:', result.affectedRows);
      
      res.json({ 
        message: '✅ Video deleted successfully!',
        deleted: result.affectedRows 
      });
    });
  });
});

// @route   PATCH /api/videos/:id/toggle
// @desc    Toggle video active status
// @access  Public
router.patch('/:id/toggle', (req, res) => {
  const videoId = req.params.id;
  console.log(`🔄 Toggling video status ID: ${videoId}`);
  
  const sql = 'UPDATE video_carousel SET is_active = NOT is_active WHERE id = ?';
  
  pool.query(sql, [videoId], (err, result) => {
    if (err) {
      console.error('❌ Error toggling video status:', err.message);
      return res.status(500).json({ 
        error: 'Database error',
        message: err.message
      });
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '❌ Video not found' });
    }
    
    res.json({ 
      message: '✅ Video status updated!',
      updated: result.affectedRows 
    });
  });
});

// @route   PATCH /api/videos/reorder
// @desc    Reorder videos
// @access  Public
router.patch('/reorder', (req, res) => {
  const { videos } = req.body;
  
  if (!Array.isArray(videos)) {
    return res.status(400).json({ error: '❌ Invalid data format' });
  }
  
  console.log(`🔄 Reordering ${videos.length} videos...`);
  
  // Use a loop instead of Promise.all for callback style
  let completed = 0;
  let hasError = false;
  
  videos.forEach((video, index) => {
    pool.query(
      'UPDATE video_carousel SET display_order = ? WHERE id = ?',
      [video.display_order, video.id],
      (err) => {
        if (err && !hasError) {
          hasError = true;
          console.error('❌ Error reordering videos:', err);
          return res.status(500).json({ error: 'Failed to reorder videos' });
        }
        
        completed++;
        if (completed === videos.length && !hasError) {
          res.json({ message: '✅ Videos reordered successfully!' });
        }
      }
    );
  });
});

// Health check endpoint
router.get('/health/check', (req, res) => {
  pool.query('SELECT 1 as test', (err) => {
    if (err) {
      return res.status(500).json({ 
        status: 'ERROR', 
        service: 'Video Carousel API',
        database: 'Disconnected',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ 
      status: 'OK', 
      service: 'Video Carousel API',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  });
});

// Create table endpoint (for debugging)
router.get('/create-table', (req, res) => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS video_carousel (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      video_url VARCHAR(500) NOT NULL,
      gradient_classes VARCHAR(100) DEFAULT 'from-emerald-500/20 to-cyan-500/20',
      display_order INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active_order (is_active, display_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  
  pool.query(createTableSQL, (err, result) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Failed to create table',
        message: err.message
      });
    }
    
    res.json({ 
      message: 'Table created successfully!',
      result: result
    });
  });
});

module.exports = router;