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
    limits: { fileSize: 5 * 1024 * 1024 },
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

// GET next bungalow code
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

// GET all bungalows
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

// GET single bungalow with full details
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

        // Format rate descriptions for frontend
        const rateDescriptions = {
            week_day_rate_desc: bungalow[0].week_day_rate_desc || '',
            weekend_rate_desc: bungalow[0].weekend_rate_desc || '',
            long_holidays_desc: bungalow[0].long_holidays_desc || '',
            festival_holidays_desc: bungalow[0].festival_holidays_desc || ''
        };

        res.json({
            bungalow: bungalow[0],
            images: images,
            rate_descriptions: rateDescriptions
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
        cancellation_policy,
        week_day_rate_desc,
        weekend_rate_desc,
        long_holidays_desc,
        festival_holidays_desc
    } = req.body;

    try {
        const [result] = await pool.query(
            `INSERT INTO bungalows 
            (bungalow_code, name, price, overview, inclusive, exclusive, places_nearby, 
             booking_policy, cancellation_policy, week_day_rate_desc, weekend_rate_desc, 
             long_holidays_desc, festival_holidays_desc, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                bungalow_code,
                name,
                price,
                overview || '',
                inclusive || '',
                exclusive || '',
                places_nearby || '',
                booking_policy || '',
                cancellation_policy || '',
                week_day_rate_desc || '',
                weekend_rate_desc || '',
                long_holidays_desc || '',
                festival_holidays_desc || ''
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
        cancellation_policy,
        status,
        week_day_rate_desc,
        weekend_rate_desc,
        long_holidays_desc,
        festival_holidays_desc
    } = req.body;

    try {
        const [result] = await pool.query(
            `UPDATE bungalows 
             SET name = ?, price = ?, overview = ?, inclusive = ?, exclusive = ?, 
                 places_nearby = ?, booking_policy = ?, cancellation_policy = ?, 
                 week_day_rate_desc = ?, weekend_rate_desc = ?, long_holidays_desc = ?, 
                 festival_holidays_desc = ?, status = ?
             WHERE bungalow_id = ?`,
            [
                name,
                price,
                overview || '',
                inclusive || '',
                exclusive || '',
                places_nearby || '',
                booking_policy || '',
                cancellation_policy || '',
                week_day_rate_desc || '',
                weekend_rate_desc || '',
                long_holidays_desc || '',
                festival_holidays_desc || '',
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

// SAVE RATE DETAILS (Descriptions only - free flow)
router.post('/:id/rate-details', async (req, res) => {
    const bungalowId = req.params.id;
    const { descriptions } = req.body;

    try {
        // Check if bungalow exists
        const [bungalow] = await pool.query(
            'SELECT bungalow_id FROM bungalows WHERE bungalow_id = ?',
            [bungalowId]
        );

        if (bungalow.length === 0) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        // Update only the description fields
        const [result] = await pool.query(
            `UPDATE bungalows 
             SET week_day_rate_desc = ?, 
                 weekend_rate_desc = ?, 
                 long_holidays_desc = ?, 
                 festival_holidays_desc = ?
             WHERE bungalow_id = ?`,
            [
                descriptions?.week_day_rate_desc || '',
                descriptions?.weekend_rate_desc || '',
                descriptions?.long_holidays_desc || '',
                descriptions?.festival_holidays_desc || '',
                bungalowId
            ]
        );

        res.json({ 
            success: true,
            message: 'Rate details saved successfully'
        });
    } catch (err) {
        console.error('Error saving rate details:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE bungalow
router.delete('/:id', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const bungalowId = req.params.id;

        const [bungalow] = await connection.query(
            'SELECT bungalow_id FROM bungalows WHERE bungalow_id = ?',
            [bungalowId]
        );

        if (bungalow.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: "Bungalow not found" });
        }

        // Delete booking guests
        await connection.query(
            'DELETE bg FROM booking_guests bg INNER JOIN bungalow_bookings bb ON bg.booking_id = bb.booking_id WHERE bb.bungalow_code IN (SELECT bungalow_code FROM bungalows WHERE bungalow_id = ?)',
            [bungalowId]
        );

        // Delete bookings
        await connection.query(
            'DELETE FROM bungalow_bookings WHERE bungalow_code IN (SELECT bungalow_code FROM bungalows WHERE bungalow_id = ?)',
            [bungalowId]
        );

        // Delete related bungalows
        await connection.query(
            'DELETE FROM related_bungalows WHERE bungalow_id = ? OR related_bungalow_id = ?',
            [bungalowId, bungalowId]
        );

        // Delete images
        const [images] = await connection.query(
            'SELECT image_url FROM bungalow_images WHERE bungalow_id = ?',
            [bungalowId]
        );

        for (const image of images) {
            const filePath = path.join(__dirname, '..', image.image_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        await connection.query(
            'DELETE FROM bungalow_images WHERE bungalow_id = ?',
            [bungalowId]
        );

        // Delete bungalow
        await connection.query(
            'DELETE FROM bungalows WHERE bungalow_id = ?',
            [bungalowId]
        );

        await connection.commit();
        
        res.json({ 
            success: true,
            message: 'Bungalow and all related records deleted successfully' 
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error deleting bungalow:', err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
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
        const [bungalow] = await pool.query(
            'SELECT bungalow_id FROM bungalows WHERE bungalow_id = ?',
            [bungalowId]
        );

        if (bungalow.length === 0) {
            return res.status(404).json({ message: "Bungalow not found" });
        }

        const [existingImages] = await pool.query(
            'SELECT COUNT(*) as count FROM bungalow_images WHERE bungalow_id = ?',
            [bungalowId]
        );
        const isFirstImage = existingImages[0].count === 0;

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
        const [image] = await pool.query(
            'SELECT bungalow_id FROM bungalow_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        const bungalowId = image[0].bungalow_id;

        await pool.query(
            'UPDATE bungalow_images SET is_main = 0 WHERE bungalow_id = ?',
            [bungalowId]
        );

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
        const [image] = await pool.query(
            'SELECT image_url FROM bungalow_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        await pool.query('DELETE FROM bungalow_images WHERE image_id = ?', [imageId]);

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

// ==================== BOOKING FORM ROUTES ====================

router.post('/bookings', async (req, res) => {
    const {
        bungalow_code,
        city,
        contact_person,
        cell_no,
        email_id,
        address,
        pin_code,
        state,
        country,
        no_of_people,
        guests,
        type
    } = req.body;

    if (!bungalow_code || !city || !contact_person || !cell_no) {
        return res.status(400).json({ 
            error: 'Missing required fields: bungalow_code, city, contact_person, and cell_no are required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        const [bookingResult] = await connection.query(
            `INSERT INTO bungalow_bookings 
            (bungalow_code, city, contact_person, cell_no, email_id, address, pin_code, state, country, no_of_people, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                bungalow_code,
                city,
                contact_person,
                cell_no,
                email_id || null,
                address || null,
                pin_code || null,
                state || null,
                country || 'India',
                no_of_people || 1,
                type || null
            ]
        );

        const bookingId = bookingResult.insertId;

        if (guests && guests.length > 0) {
            for (const guest of guests) {
                await connection.query(
                    `INSERT INTO booking_guests (booking_id, name, age, cell_no, email_id)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        bookingId,
                        guest.name,
                        guest.age || null,
                        guest.cell_no || null,
                        guest.email_id || null
                    ]
                );
            }
        }

        await connection.commit();
        connection.release();

        res.status(201).json({
            success: true,
            booking_id: bookingId,
            message: 'Booking saved successfully'
        });
    } catch (err) {
        console.error('Error saving booking:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;