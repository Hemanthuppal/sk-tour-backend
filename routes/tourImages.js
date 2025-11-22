// routes/tourImages.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');

// Multer configuration - save files in /public/uploads/tours
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/tours/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'tour-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, jpg, png, webp) are allowed'));
    }
  }
});

// GET all images of a tour
router.get('/tour/:tour_id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT image_id, url, caption, is_cover 
      FROM tour_images 
      WHERE tour_id = ? 
      ORDER BY is_cover DESC, image_id ASC
    `, [req.params.tour_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPLOAD single or multiple images
router.post('/upload/:tour_id', upload.array('images', 10), async (req, res) => {
  const tour_id = req.params.tour_id;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ message: "No files uploaded" });
  }

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/uploads/tours/`;
    const values = files.map(file => [
      tour_id,
      baseUrl + file.filename,
      req.body.caption || null,
      0 // is_cover default false
    ]);

    await conn.query(
      `INSERT INTO tour_images (tour_id, url, caption, is_cover) VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({
      message: `${files.length} image(s) uploaded successfully`,
      uploaded: files.map(f => baseUrl + f.filename)
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// SET as cover image
router.put('/cover/:image_id', async (req, res) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const [img] = await conn.query('SELECT tour_id FROM tour_images WHERE image_id = ?', [req.params.image_id]);
    if (img.length === 0) return res.status(404).json({ message: "Image not found" });

    // Remove previous cover
    await conn.query('UPDATE tour_images SET is_cover = 0 WHERE tour_id = ?', [img[0].tour_id]);
    // Set new cover
    await conn.query('UPDATE tour_images SET is_cover = 1 WHERE image_id = ?', [req.params.image_id]);

    await conn.commit();
    res.json({ message: "Cover image updated" });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// DELETE image
router.delete('/:id', async (req, res) => {
  try {
    const [img] = await pool.query('SELECT url FROM tour_images WHERE image_id = ?', [req.params.id]);
    if (img.length === 0) return res.status(404).json({ message: "Image not found" });

    // Optional: Delete file from server
    const fs = require('fs');
    const filePath = 'public' + new URL(img[0].url).pathname;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM tour_images WHERE image_id = ?', [req.params.id]);
    res.json({ message: "Image deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;