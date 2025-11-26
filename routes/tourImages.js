// routes/tourImages.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================
// 1️⃣  DEFINE UPLOAD DIRECTORY
// ============================
const uploadDir = path.join(__dirname, "../public/uploads/tours");

// AUTO-CREATE DIRECTORY IF MISSING
if (!fs.existsSync(uploadDir)) {
  console.log("📁 Creating upload directory:", uploadDir);
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ============================
// 2️⃣ MULTER STORAGE CONFIG
// ============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("📥 Upload Destination:", uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = 'tour-' + uniqueSuffix + path.extname(file.originalname);
    console.log("📄 Saving file as:", fileName);
    cb(null, fileName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, jpg, png, webp) are allowed'));
    }
  }
});

// ============================
// 3️⃣ GET IMAGES FOR A TOUR
// ============================
router.get('/tour/:tour_id', async (req, res) => {
  try {
    console.log("📤 GET images for tour:", req.params.tour_id);

    const [rows] = await pool.query(`
      SELECT image_id, url, caption, is_cover 
      FROM tour_images 
      WHERE tour_id = ? 
      ORDER BY is_cover DESC, image_id ASC
    `, [req.params.tour_id]);

    res.json(rows);
  } catch (err) {
    console.error("❌ GET /tour/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================
// 4️⃣ UPLOAD IMAGES FOR TOUR
// ============================
router.post('/upload/:tour_id', upload.array('images', 10), async (req, res) => {
  const tour_id = req.params.tour_id;
  const files = req.files;

  console.log("📤 Upload request → /upload/" + tour_id);
  console.log("📸 Files received:", files?.length);
  console.log("📝 Caption:", req.body.caption);

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
      0 // is_cover
    ]);

    console.log("🛢 Inserting image records:", values);

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
    console.error("❌ Upload error:", err);
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ============================
// 5️⃣ SET COVER IMAGE
// ============================
router.put('/cover/:image_id', async (req, res) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    console.log("⭐ Setting cover image:", req.params.image_id);

    const [img] = await conn.query(
      'SELECT tour_id FROM tour_images WHERE image_id = ?',
      [req.params.image_id]
    );

    if (img.length === 0)
      return res.status(404).json({ message: "Image not found" });

    await conn.query('UPDATE tour_images SET is_cover = 0 WHERE tour_id = ?', [img[0].tour_id]);

    await conn.query('UPDATE tour_images SET is_cover = 1 WHERE image_id = ?', [req.params.image_id]);

    await conn.commit();

    res.json({ message: "Cover image updated" });
  } catch (err) {
    console.error("❌ Cover update error:", err);
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ============================
// 6️⃣ DELETE IMAGE
// ============================
router.delete('/:id', async (req, res) => {
  try {
    console.log("🗑 Delete image:", req.params.id);

    const [img] = await pool.query('SELECT url FROM tour_images WHERE image_id = ?', [req.params.id]);

    if (img.length === 0)
      return res.status(404).json({ message: "Image not found" });

    const urlPath = new URL(img[0].url).pathname;
    const filePath = path.join(__dirname, "../public", urlPath);

    console.log("🗂 File to delete:", filePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("File deleted.");
    }

    await pool.query('DELETE FROM tour_images WHERE image_id = ?', [req.params.id]);

    res.json({ message: "Image deleted" });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
