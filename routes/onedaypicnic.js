const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/one-day-picnic';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'picnic-' + uniqueSuffix + path.extname(file.originalname));
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

// GET next picnic code (PICNIC0001, PICNIC0002, etc.)
router.get('/next-picnic-code', async (req, res) => {
    try {
        const prefix = 'PICNIC';
        
        const [rows] = await pool.query(`
            SELECT picnic_code 
            FROM one_day_picnic 
            WHERE picnic_code LIKE ? 
            ORDER BY picnic_code DESC 
            LIMIT 1
        `, [`${prefix}%`]);
        
        let nextNumber = 1;
        
        if (rows.length > 0 && rows[0].picnic_code) {
            const lastCode = rows[0].picnic_code;
            const lastNumber = parseInt(lastCode.replace(prefix, ''));
            nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
        }
        
        const nextCode = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
        
        res.json({ 
            next_picnic_code: nextCode,
            prefix: prefix
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all one day picnics (for listing - 1st image)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT p.*, 
                   (SELECT image_url FROM one_day_picnic_images 
                    WHERE picnic_id = p.picnic_id AND is_main = TRUE LIMIT 1) as main_image
            FROM one_day_picnic p
            WHERE p.status = 1
            ORDER BY p.picnic_id DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single one day picnic with full details
router.get('/:id', async (req, res) => {
    try {
        const [picnic] = await pool.query(
            'SELECT * FROM one_day_picnic WHERE picnic_id = ?', 
            [req.params.id]
        );
        
        if (!picnic.length) {
            return res.status(404).json({ message: "One Day Picnic not found" });
        }

        const [images] = await pool.query(
            'SELECT * FROM one_day_picnic_images WHERE picnic_id = ? ORDER BY is_main DESC, sort_order ASC',
            [req.params.id]
        );

        const [relatedPicnics] = await pool.query(`
            SELECT rp.*, p.name, p.price 
            FROM related_one_day_picnic rp
            LEFT JOIN one_day_picnic p ON rp.related_picnic_id = p.picnic_id
            WHERE rp.picnic_id = ?
            ORDER BY rp.sort_order
        `, [req.params.id]);

        res.json({
            picnic: picnic[0],
            images: images,
            related_picnics: relatedPicnics
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE new one day picnic
router.post('/', async (req, res) => {
    const { 
        picnic_code,
        name,
        price,
        overview,
        inclusive,
        exclusive,
        places_nearby,
        booking_policy,
        per_pax_twin,
        per_pax_triple,
        child_with_bed,
        child_without_bed,
        infant,
        per_pax_single
    } = req.body;

    try {
        const [result] = await pool.query(
            `INSERT INTO one_day_picnic 
            (picnic_code, name, price, per_pax_twin, per_pax_triple, child_with_bed, child_without_bed, infant, per_pax_single, overview, inclusive, exclusive, places_nearby, booking_policy, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                picnic_code,
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
            picnic_id: result.insertId,
            message: 'One Day Picnic created successfully'
        });
    } catch (err) {
        console.error('Error creating one day picnic:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE one day picnic
router.put('/:id', async (req, res) => {
    const picnicId = req.params.id;
    const { 
        name,
        price,
        overview,
        inclusive,
        exclusive,
        places_nearby,
        booking_policy,
        status,
        per_pax_twin,
        per_pax_triple,
        child_with_bed,
        child_without_bed,
        infant,
        per_pax_single
    } = req.body;

    try {
        const [result] = await pool.query(
            `UPDATE one_day_picnic 
             SET name = ?, price = ?, per_pax_twin = ?, per_pax_triple = ?, child_with_bed = ?, 
                 child_without_bed = ?, infant = ?, per_pax_single = ?, overview = ?, inclusive = ?, 
                 exclusive = ?, places_nearby = ?, booking_policy = ?, status = ?
             WHERE picnic_id = ?`,
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
                picnicId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "One Day Picnic not found" });
        }

        res.json({ 
            success: true,
            message: 'One Day Picnic updated successfully'
        });
    } catch (err) {
        console.error('Error updating one day picnic:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE one day picnic (hard delete)
router.delete('/:id', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const picnicId = req.params.id;

        // First check if picnic exists
        const [picnic] = await connection.query(
            'SELECT picnic_id FROM one_day_picnic WHERE picnic_id = ?',
            [picnicId]
        );

        if (picnic.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ message: "One Day Picnic not found" });
        }

        // Delete related records in correct order

        // 1. Delete booking guests
        await connection.query(
            'DELETE bg FROM one_day_picnic_booking_guests bg INNER JOIN one_day_picnic_bookings pb ON bg.booking_id = pb.booking_id WHERE pb.picnic_code IN (SELECT picnic_code FROM one_day_picnic WHERE picnic_id = ?)',
            [picnicId]
        );

        // 2. Delete bookings
        await connection.query(
            'DELETE FROM one_day_picnic_bookings WHERE picnic_code IN (SELECT picnic_code FROM one_day_picnic WHERE picnic_id = ?)',
            [picnicId]
        );

        // 3. Delete related picnics
        await connection.query(
            'DELETE FROM related_one_day_picnic WHERE picnic_id = ? OR related_picnic_id = ?',
            [picnicId, picnicId]
        );

        // 4. Delete images and physical files
        const [images] = await connection.query(
            'SELECT image_url FROM one_day_picnic_images WHERE picnic_id = ?',
            [picnicId]
        );

        // Delete physical image files
        for (const image of images) {
            const filePath = path.join(__dirname, '..', image.image_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Delete image records
        await connection.query(
            'DELETE FROM one_day_picnic_images WHERE picnic_id = ?',
            [picnicId]
        );

        // 5. Finally delete the picnic
        const [result] = await connection.query(
            'DELETE FROM one_day_picnic WHERE picnic_id = ?',
            [picnicId]
        );

        await connection.commit();
        
        res.json({ 
            success: true,
            message: 'One Day Picnic and all related records deleted successfully' 
        });

    } catch (err) {
        await connection.rollback();
        console.error('Error deleting one day picnic:', err);
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

// UPLOAD images for one day picnic
router.post('/upload/:picnicId', upload.array('images', 10), async (req, res) => {
    const picnicId = req.params.picnicId;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
    }

    try {
        // Check if picnic exists
        const [picnic] = await pool.query(
            'SELECT picnic_id FROM one_day_picnic WHERE picnic_id = ?',
            [picnicId]
        );

        if (picnic.length === 0) {
            return res.status(404).json({ message: "One Day Picnic not found" });
        }

        // Check if this is the first image (make it main)
        const [existingImages] = await pool.query(
            'SELECT COUNT(*) as count FROM one_day_picnic_images WHERE picnic_id = ?',
            [picnicId]
        );
        const isFirstImage = existingImages[0].count === 0;

        // Insert image records
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageUrl = `/uploads/one-day-picnic/${file.filename}`;
            
            await pool.query(
                `INSERT INTO one_day_picnic_images (picnic_id, image_url, is_main, sort_order)
                 VALUES (?, ?, ?, ?)`,
                [
                    picnicId, 
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
                url: `/uploads/one-day-picnic/${f.filename}`
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
        // Get the picnic_id of this image
        const [image] = await pool.query(
            'SELECT picnic_id FROM one_day_picnic_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        const picnicId = image[0].picnic_id;

        // Remove main flag from all images of this picnic
        await pool.query(
            'UPDATE one_day_picnic_images SET is_main = 0 WHERE picnic_id = ?',
            [picnicId]
        );

        // Set this image as main
        await pool.query(
            'UPDATE one_day_picnic_images SET is_main = 1 WHERE image_id = ?',
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
            'SELECT image_url FROM one_day_picnic_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        // Delete from database
        await pool.query('DELETE FROM one_day_picnic_images WHERE image_id = ?', [imageId]);

        // Try to delete physical file
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

// RELATED ONE DAY PICNIC ROUTES

// Add related one day picnic
router.post('/related/:picnicId', async (req, res) => {
    const picnicId = req.params.picnicId;
    const { related_name, related_price, related_image, sort_order } = req.body;

    try {
        // Try to find if there's an existing picnic with this name
        const [existingPicnic] = await pool.query(
            'SELECT picnic_id FROM one_day_picnic WHERE name = ? AND status = 1',
            [related_name]
        );

        let related_picnic_id = null;
        
        if (existingPicnic.length > 0) {
            related_picnic_id = existingPicnic[0].picnic_id;
        }

        // Only filter out blob URLs, keep actual image paths
        let imageUrl = related_image;
        if (imageUrl && imageUrl.startsWith('blob:')) {
            imageUrl = null;
        }

        const [result] = await pool.query(
            `INSERT INTO related_one_day_picnic 
            (picnic_id, related_picnic_id, related_name, related_price, related_image, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                picnicId, 
                related_picnic_id, 
                related_name, 
                related_price || null, 
                imageUrl || null, 
                sort_order || 0
            ]
        );

        res.status(201).json({ 
            success: true,
            relation_id: result.insertId,
            message: 'Related one day picnic added successfully'
        });
    } catch (err) {
        console.error('Error adding related one day picnic:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPLOAD image for related one day picnic
router.post('/upload-related/:picnicId', upload.single('image'), async (req, res) => {
    const picnicId = req.params.picnicId;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    try {
        // Check if picnic exists
        const [picnic] = await pool.query(
            'SELECT picnic_id FROM one_day_picnic WHERE picnic_id = ?',
            [picnicId]
        );

        if (picnic.length === 0) {
            return res.status(404).json({ message: "One Day Picnic not found" });
        }

        const imageUrl = `/uploads/one-day-picnic/${file.filename}`;

        res.json({ 
            success: true,
            image_url: imageUrl,
            message: 'Image uploaded successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get related one day picnics
router.get('/related/:picnicId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT rp.*, p.name, p.price 
            FROM related_one_day_picnic rp
            LEFT JOIN one_day_picnic p ON rp.related_picnic_id = p.picnic_id
            WHERE rp.picnic_id = ?
            ORDER BY rp.sort_order
        `, [req.params.picnicId]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update related one day picnic
router.put('/related/:relationId', async (req, res) => {
    const relationId = req.params.relationId;
    const { related_name, related_price, related_image, sort_order } = req.body;

    try {
        // Try to find if there's an existing picnic with this name
        const [existingPicnic] = await pool.query(
            'SELECT picnic_id FROM one_day_picnic WHERE name = ? AND status = 1',
            [related_name]
        );

        let related_picnic_id = null;
        
        if (existingPicnic.length > 0) {
            related_picnic_id = existingPicnic[0].picnic_id;
        }

        // Only filter out blob URLs, keep actual image paths
        let imageUrl = related_image;
        if (imageUrl && imageUrl.startsWith('blob:')) {
            imageUrl = null;
        }

        await pool.query(
            `UPDATE related_one_day_picnic 
             SET related_picnic_id = ?, related_name = ?, related_price = ?, related_image = ?, sort_order = ?
             WHERE relation_id = ?`,
            [
                related_picnic_id, 
                related_name, 
                related_price || null, 
                imageUrl || null, 
                sort_order, 
                relationId
            ]
        );

        res.json({ 
            success: true,
            message: 'Related one day picnic updated successfully'
        });
    } catch (err) {
        console.error('Error updating related one day picnic:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete related one day picnic
router.delete('/related/:relationId', async (req, res) => {
    try {
        await pool.query('DELETE FROM related_one_day_picnic WHERE relation_id = ?', [req.params.relationId]);

        res.json({ 
            success: true,
            message: 'Related one day picnic deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== BOOKING FORM ROUTES ====================

// POST - Save booking form data
router.post('/bookings', async (req, res) => {
    const {
        picnic_code,
        city,
        contact_person,
        cell_no,
        email_id,
        address,
        pin_code,
        state,
        country,
        no_of_people,
        guests
    } = req.body;

    // Validate required fields
    if (!picnic_code || !city || !contact_person || !cell_no) {
        return res.status(400).json({ 
            error: 'Missing required fields: picnic_code, city, contact_person, and cell_no are required' 
        });
    }

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Insert main booking
            const [bookingResult] = await connection.query(
                `INSERT INTO one_day_picnic_bookings 
                (picnic_code, city, contact_person, cell_no, email_id, address, pin_code, state, country, no_of_people)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    picnic_code,
                    city,
                    contact_person,
                    cell_no,
                    email_id || null,
                    address || null,
                    pin_code || null,
                    state || null,
                    country || 'India',
                    no_of_people || 1
                ]
            );

            const bookingId = bookingResult.insertId;

            // Insert guest details
            if (guests && guests.length > 0) {
                for (const guest of guests) {
                    await connection.query(
                        `INSERT INTO one_day_picnic_booking_guests (booking_id, name, age, cell_no, email_id)
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
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error('Error saving booking:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET - Get all bookings
router.get('/bookings', async (req, res) => {
    try {
        const [bookings] = await pool.query(`
            SELECT b.*, 
                   COUNT(bg.guest_id) as actual_guests
            FROM one_day_picnic_bookings b
            LEFT JOIN one_day_picnic_booking_guests bg ON b.booking_id = bg.booking_id
            GROUP BY b.booking_id
            ORDER BY b.created_at DESC
        `);

        // Get guests for each booking
        for (let booking of bookings) {
            const [guests] = await pool.query(
                'SELECT * FROM one_day_picnic_booking_guests WHERE booking_id = ? ORDER BY guest_id',
                [booking.booking_id]
            );
            booking.guests = guests;
        }

        res.json(bookings);
    } catch (err) {
        console.error('Error fetching bookings:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET - Get single booking by ID
router.get('/bookings/:id', async (req, res) => {
    try {
        const [bookings] = await pool.query(
            'SELECT * FROM one_day_picnic_bookings WHERE booking_id = ?',
            [req.params.id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ message: "Booking not found" });
        }

        const [guests] = await pool.query(
            'SELECT * FROM one_day_picnic_booking_guests WHERE booking_id = ? ORDER BY guest_id',
            [req.params.id]
        );

        res.json({
            booking: bookings[0],
            guests: guests
        });
    } catch (err) {
        console.error('Error fetching booking:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE - Delete booking
router.delete('/bookings/:id', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // First check if booking exists
            const [check] = await connection.query(
                'SELECT booking_id FROM one_day_picnic_bookings WHERE booking_id = ?',
                [req.params.id]
            );

            if (check.length === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: "Booking not found" });
            }

            // Delete guests first
            await connection.query(
                'DELETE FROM one_day_picnic_booking_guests WHERE booking_id = ?',
                [req.params.id]
            );

            // Delete booking
            await connection.query(
                'DELETE FROM one_day_picnic_bookings WHERE booking_id = ?',
                [req.params.id]
            );

            await connection.commit();
            connection.release();

            res.json({
                success: true,
                message: 'Booking deleted successfully'
            });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error('Error deleting booking:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;