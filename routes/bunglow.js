const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/bungalows';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'bungalow-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, JPG, PNG, WEBP) are allowed'));
        }
    }
});

// GET next bungalow code (BUNG0001, BUNG0002, etc.)
router.get('/next-bungalow-code', async (req, res) => {
    try {
        const prefix = 'BUNG';
        
        const [rows] = await pool.query(`
            SELECT bungalow_code 
            FROM bungalows 
            WHERE bungalow_code LIKE ? 
            ORDER BY bungalow_code DESC 
            LIMIT 1
        `, [`${prefix}%`]);
        
        let nextNumber = 1;
        
        if (rows.length > 0 && rows[0].bungalow_code) {
            const lastCode = rows[0].bungalow_code;
            const lastNumber = parseInt(lastCode.replace(prefix, ''));
            nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
        }
        
        const nextCode = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
        
        res.json({ 
            next_bungalow_code: nextCode,
            prefix: prefix
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all bungalows (for listing - 1st image)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT b.*, 
                   (SELECT image_url FROM bungalow_images 
                    WHERE bungalow_id = b.bungalow_id AND is_main = TRUE LIMIT 1) as main_image
            FROM bungalows b
            WHERE b.status = 1
            ORDER BY b.bungalow_id DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single bungalow with full details (for 2nd image view)
router.get('/:id', async (req, res) => {
    try {
        const [bungalow] = await pool.query(
            'SELECT * FROM bungalows WHERE bungalow_id = ?', 
            [req.params.id]
        );
        
        if (!bungalow.length) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        const [images] = await pool.query(
            'SELECT * FROM bungalow_images WHERE bungalow_id = ? ORDER BY is_main DESC, sort_order ASC',
            [req.params.id]
        );

        const [relatedBungalows] = await pool.query(`
            SELECT rb.*, b.name, b.price 
            FROM related_bungalows rb
            LEFT JOIN bungalows b ON rb.related_bungalow_id = b.bungalow_id
            WHERE rb.bungalow_id = ?
            ORDER BY rb.sort_order
        `, [req.params.id]);

        res.json({
            bungalow: bungalow[0],
            images: images,
            related_bungalows: relatedBungalows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE new bungalow
router.post('/', async (req, res) => {
    const { 
        bungalow_code,
        name,
        price,
        overview,
        inclusive,
        exclusive,
        places_nearby,
        booking_policy,
        // Tour Cost fields
        per_pax_twin,
        per_pax_triple,
        child_with_bed,
        child_without_bed,
        infant,
        per_pax_single
    } = req.body;

    try {
        const [result] = await pool.query(
            `INSERT INTO bungalows 
            (bungalow_code, name, price, per_pax_twin, per_pax_triple, child_with_bed, child_without_bed, infant, per_pax_single, overview, inclusive, exclusive, places_nearby, booking_policy, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                bungalow_code,
                name,
                price,
                per_pax_twin || null,
                per_pax_triple || null,
                child_with_bed || null,
                child_without_bed || null,
                infant || null,
                per_pax_single || null,
                overview || '',
                inclusive || '',
                exclusive || '',
                places_nearby || '',
                booking_policy || ''
            ]
        );

        res.status(201).json({ 
            success: true,
            bungalow_id: result.insertId,
            message: 'Bungalow created successfully'
        });
    } catch (err) {
        console.error('Error creating bungalow:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE bungalow
router.put('/:id', async (req, res) => {
    const bungalowId = req.params.id;
    const { 
        name,
        price,
        overview,
        inclusive,
        exclusive,
        places_nearby,
        booking_policy,
        status,
        // Tour Cost fields
        per_pax_twin,
        per_pax_triple,
        child_with_bed,
        child_without_bed,
        infant,
        per_pax_single
    } = req.body;

    try {
        const [result] = await pool.query(
            `UPDATE bungalows 
             SET name = ?, price = ?, per_pax_twin = ?, per_pax_triple = ?, child_with_bed = ?, 
                 child_without_bed = ?, infant = ?, per_pax_single = ?, overview = ?, inclusive = ?, 
                 exclusive = ?, places_nearby = ?, booking_policy = ?, status = ?
             WHERE bungalow_id = ?`,
            [
                name,
                price,
                per_pax_twin || null,
                per_pax_triple || null,
                child_with_bed || null,
                child_without_bed || null,
                infant || null,
                per_pax_single || null,
                overview || '',
                inclusive || '',
                exclusive || '',
                places_nearby || '',
                booking_policy || '',
                status || 1,
                bungalowId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        res.json({ 
            success: true,
            message: 'Bungalow updated successfully'
        });
    } catch (err) {
        console.error('Error updating bungalow:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE bungalow (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const [result] = await pool.query(
            'UPDATE bungalows SET status = 0 WHERE bungalow_id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        res.json({ 
            success: true,
            message: 'Bungalow deleted successfully' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPLOAD images for bungalow
router.post('/upload/:bungalowId', upload.array('images', 10), async (req, res) => {
    const bungalowId = req.params.bungalowId;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
    }

    try {
        // Check if bungalow exists
        const [bungalow] = await pool.query(
            'SELECT bungalow_id FROM bungalows WHERE bungalow_id = ?',
            [bungalowId]
        );

        if (bungalow.length === 0) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        // Check if this is the first image (make it main)
        const [existingImages] = await pool.query(
            'SELECT COUNT(*) as count FROM bungalow_images WHERE bungalow_id = ?',
            [bungalowId]
        );
        const isFirstImage = existingImages[0].count === 0;

        // Insert image records
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageUrl = `/uploads/bungalows/${file.filename}`;
            
            await pool.query(
                `INSERT INTO bungalow_images (bungalow_id, image_url, is_main, sort_order)
                 VALUES (?, ?, ?, ?)`,
                [
                    bungalowId, 
                    imageUrl, 
                    isFirstImage && i === 0 ? 1 : 0, 
                    existingImages[0].count + i
                ]
            );
        }

        res.json({ 
            success: true,
            message: `${files.length} image(s) uploaded successfully`,
            files: files.map(f => ({
                filename: f.filename,
                url: `/uploads/bungalows/${f.filename}`
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SET main image
router.put('/images/main/:imageId', async (req, res) => {
    const imageId = req.params.imageId;

    try {
        // Get the bungalow_id of this image
        const [image] = await pool.query(
            'SELECT bungalow_id FROM bungalow_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        const bungalowId = image[0].bungalow_id;

        // Remove main flag from all images of this bungalow
        await pool.query(
            'UPDATE bungalow_images SET is_main = 0 WHERE bungalow_id = ?',
            [bungalowId]
        );

        // Set this image as main
        await pool.query(
            'UPDATE bungalow_images SET is_main = 1 WHERE image_id = ?',
            [imageId]
        );

        res.json({ 
            success: true,
            message: 'Main image updated successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE image
router.delete('/images/:imageId', async (req, res) => {
    const imageId = req.params.imageId;

    try {
        // Get image info to delete file
        const [image] = await pool.query(
            'SELECT image_url FROM bungalow_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        // Delete from database
        await pool.query('DELETE FROM bungalow_images WHERE image_id = ?', [imageId]);

        // Try to delete physical file (optional)
        const filePath = path.join(__dirname, '..', image[0].image_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ 
            success: true,
            message: 'Image deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RELATED BUNGALOWS ROUTES

// Add related bungalow
router.post('/related/:bungalowId', async (req, res) => {
    const bungalowId = req.params.bungalowId;
    const { related_name, related_price, related_image, sort_order } = req.body;

    try {
        // First, try to find if there's an existing bungalow with this name
        const [existingBungalow] = await pool.query(
            'SELECT bungalow_id FROM bungalows WHERE name = ? AND status = 1',
            [related_name]
        );

        let related_bungalow_id = null;
        
        if (existingBungalow.length > 0) {
            related_bungalow_id = existingBungalow[0].bungalow_id;
        }

        // Only filter out blob URLs, keep actual image paths
        let imageUrl = related_image;
        if (imageUrl && imageUrl.startsWith('blob:')) {
            imageUrl = null;
        }

        const [result] = await pool.query(
            `INSERT INTO related_bungalows 
            (bungalow_id, related_bungalow_id, related_name, related_price, related_image, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                bungalowId, 
                related_bungalow_id, 
                related_name, 
                related_price || null, 
                imageUrl || null, 
                sort_order || 0
            ]
        );

        res.status(201).json({ 
            success: true,
            relation_id: result.insertId,
            message: 'Related bungalow added successfully'
        });
    } catch (err) {
        console.error('Error adding related bungalow:', err);
        res.status(500).json({ error: err.message });
    }
});


// UPLOAD image for related bungalow
router.post('/upload-related/:bungalowId', upload.single('image'), async (req, res) => {
    const bungalowId = req.params.bungalowId;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    try {
        // Check if bungalow exists
        const [bungalow] = await pool.query(
            'SELECT bungalow_id FROM bungalows WHERE bungalow_id = ?',
            [bungalowId]
        );

        if (bungalow.length === 0) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        const imageUrl = `/uploads/bungalows/${file.filename}`;

        res.json({ 
            success: true,
            image_url: imageUrl,
            message: 'Image uploaded successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get related bungalows for a bungalow
router.get('/related/:bungalowId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT rb.*, b.name, b.price 
            FROM related_bungalows rb
            LEFT JOIN bungalows b ON rb.related_bungalow_id = b.bungalow_id
            WHERE rb.bungalow_id = ?
            ORDER BY rb.sort_order
        `, [req.params.bungalowId]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update related bungalow
router.put('/related/:relationId', async (req, res) => {
    const relationId = req.params.relationId;
    const { related_name, related_price, related_image, sort_order } = req.body;

    try {
        // First, try to find if there's an existing bungalow with this name
        const [existingBungalow] = await pool.query(
            'SELECT bungalow_id FROM bungalows WHERE name = ? AND status = 1',
            [related_name]
        );

        let related_bungalow_id = null;
        
        if (existingBungalow.length > 0) {
            related_bungalow_id = existingBungalow[0].bungalow_id;
        }

        // Only filter out blob URLs, keep actual image paths
        let imageUrl = related_image;
        if (imageUrl && imageUrl.startsWith('blob:')) {
            imageUrl = null;
        }

        await pool.query(
            `UPDATE related_bungalows 
             SET related_bungalow_id = ?, related_name = ?, related_price = ?, related_image = ?, sort_order = ?
             WHERE relation_id = ?`,
            [
                related_bungalow_id, 
                related_name, 
                related_price || null, 
                imageUrl || null, 
                sort_order, 
                relationId
            ]
        );

        res.json({ 
            success: true,
            message: 'Related bungalow updated successfully'
        });
    } catch (err) {
        console.error('Error updating related bungalow:', err);
        res.status(500).json({ error: err.message });
    }
});


// Delete related bungalow
router.delete('/related/:relationId', async (req, res) => {
    try {
        await pool.query('DELETE FROM related_bungalows WHERE relation_id = ?', [req.params.relationId]);

        res.json({ 
            success: true,
            message: 'Related bungalow deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;