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
router.get('/', async (req, res) => {
  console.log('📥 Fetching active videos...');
  
  try {
    const sql = 'SELECT * FROM video_carousel WHERE is_active = TRUE ORDER BY display_order ASC, created_at DESC';
    const [results] = await pool.execute(sql);
    
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
  } catch (err) {
    console.error('❌ Database error fetching videos:', err.message);
    return res.status(500).json({ 
      error: 'Database error',
      message: err.message
    });
  }
});

// @route   GET /api/videos/admin
// @desc    Get all videos for admin panel
// @access  Public
router.get('/admin', async (req, res) => {
  console.log('📥 Fetching all videos for admin...');
  
  try {
    const sql = 'SELECT * FROM video_carousel ORDER BY display_order ASC, created_at DESC';
    const [results] = await pool.execute(sql);
    
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
  } catch (err) {
    console.error('❌ Database error fetching admin videos:', err.message);
    return res.status(500).json({ 
      error: 'Database error',
      message: err.message
    });
  }
});

// @route   POST /api/videos
// @desc    Add new video with file upload
// @access  Public
router.post('/', upload.single('videoFile'), async (req, res) => {
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
    
    const [result] = await pool.execute(sql, values);
    console.log('✅ Video inserted with ID:', result.insertId);
    
    // Get the newly inserted video
    const [newVideoResults] = await pool.execute('SELECT * FROM video_carousel WHERE id = ?', [result.insertId]);
    
    if (newVideoResults.length === 0) {
      return res.status(500).json({ error: '❌ Failed to retrieve created video' });
    }
    
    const newVideo = newVideoResults[0];
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
router.put('/:id', upload.single('videoFile'), async (req, res) => {
  const videoId = req.params.id;
  console.log(`✏️  Updating video ID: ${videoId}`);
  
  try {
    // Check if video exists
    const [videoResults] = await pool.execute('SELECT video_url FROM video_carousel WHERE id = ?', [videoId]);
    
    if (videoResults.length === 0) {
      if (req.file && req.file.path) {
        deleteFile(req.file.path);
      }
      return res.status(404).json({ error: '❌ Video not found' });
    }
    
    const oldVideo = videoResults[0];
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
    
    const [result] = await pool.execute(sql, values);
    
    if (oldFilePath) {
      deleteFile(oldFilePath);
    }
    
    console.log('✅ Video updated, affected rows:', result.affectedRows);
    
    res.json({ 
      message: '✅ Video updated successfully!',
      updated: result.affectedRows 
    });
    
  } catch (err) {
    if (req.file && req.file.path) {
      deleteFile(req.file.path);
    }
    console.error('❌ Error updating video:', err.message);
    return res.status(500).json({ 
      error: 'Database error', 
      message: err.message
    });
  }
});

// @route   DELETE /api/videos/:id
// @desc    Delete video
// @access  Public
router.delete('/:id', async (req, res) => {
  const videoId = req.params.id;
  console.log(`🗑️  Deleting video ID: ${videoId}`);
  
  try {
    const [videoResults] = await pool.execute('SELECT video_url FROM video_carousel WHERE id = ?', [videoId]);
    
    if (videoResults.length === 0) {
      return res.status(404).json({ error: '❌ Video not found' });
    }
    
    const videoUrl = videoResults[0].video_url;
    
    if (videoUrl && !videoUrl.startsWith('http')) {
      const fileName = path.basename(videoUrl);
      const filePath = path.join(__dirname, '../uploads/videos', fileName);
      deleteFile(filePath);
    }
    
    const [result] = await pool.execute('DELETE FROM video_carousel WHERE id = ?', [videoId]);
    
    console.log('✅ Video deleted, affected rows:', result.affectedRows);
    
    res.json({ 
      message: '✅ Video deleted successfully!',
      deleted: result.affectedRows 
    });
    
  } catch (err) {
    console.error('❌ Error deleting video:', err.message);
    return res.status(500).json({ 
      error: 'Database error',
      message: err.message
    });
  }
});

// @route   PATCH /api/videos/:id/toggle
// @desc    Toggle video active status
// @access  Public
router.patch('/:id/toggle', async (req, res) => {
  const videoId = req.params.id;
  console.log(`🔄 Toggling video status ID: ${videoId}`);
  
  try {
    const [result] = await pool.execute('UPDATE video_carousel SET is_active = NOT is_active WHERE id = ?', [videoId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '❌ Video not found' });
    }
    
    res.json({ 
      message: '✅ Video status updated!',
      updated: result.affectedRows 
    });
    
  } catch (err) {
    console.error('❌ Error toggling video status:', err.message);
    return res.status(500).json({ 
      error: 'Database error',
      message: err.message
    });
  }
});

// @route   PATCH /api/videos/reorder
// @desc    Reorder videos
// @access  Public
router.patch('/reorder', async (req, res) => {
  const { videos } = req.body;
  
  if (!Array.isArray(videos)) {
    return res.status(400).json({ error: '❌ Invalid data format' });
  }
  
  console.log(`🔄 Reordering ${videos.length} videos...`);
  
  try {
    // Use transaction for better reliability
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      for (const video of videos) {
        await connection.execute(
          'UPDATE video_carousel SET display_order = ? WHERE id = ?',
          [video.display_order, video.id]
        );
      }
      
      await connection.commit();
      res.json({ message: '✅ Videos reordered successfully!' });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error reordering videos:', error);
    res.status(500).json({ error: 'Failed to reorder videos' });
  }
});

// Health check endpoint
router.get('/health/check', async (req, res) => {
  try {
    await pool.execute('SELECT 1 as test');
    
    res.json({ 
      status: 'OK', 
      service: 'Video Carousel API',
      database: 'Connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ 
      status: 'ERROR', 
      service: 'Video Carousel API',
      database: 'Disconnected',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Create table endpoint (for debugging)
router.get('/create-table', async (req, res) => {
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
  
  try {
    const [result] = await pool.execute(createTableSQL);
    res.json({ 
      message: 'Table created successfully!',
      result: result
    });
  } catch (err) {
    return res.status(500).json({ 
      error: 'Failed to create table',
      message: err.message
    });
  }
});

module.exports = router;