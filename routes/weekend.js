const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/weekend-gateways';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'gateway-' + uniqueSuffix + path.extname(file.originalname));
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

// GET next gateway code (WG0001, WG0002, etc.)
router.get('/next-gateway-code', async (req, res) => {
    try {
        const prefix = 'WG';
        
        const [rows] = await pool.query(`
            SELECT gateway_code 
            FROM weekend_gateways 
            WHERE gateway_code LIKE ? 
            ORDER BY gateway_code DESC 
            LIMIT 1
        `, [`${prefix}%`]);
        
        let nextNumber = 1;
        
        if (rows.length > 0 && rows[0].gateway_code) {
            const lastCode = rows[0].gateway_code;
            const lastNumber = parseInt(lastCode.replace(prefix, ''));
            nextNumber = isNaN(lastNumber) ? 1 : lastNumber + 1;
        }
        
        const nextCode = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
        
        res.json({ 
            next_gateway_code: nextCode,
            prefix: prefix
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all weekend gateways (for listing)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT w.*, 
                   (SELECT image_url FROM weekend_gateway_images 
                    WHERE gateway_id = w.gateway_id AND is_main = TRUE LIMIT 1) as main_image
            FROM weekend_gateways w
            WHERE w.status = 1
            ORDER BY w.gateway_id DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single weekend gateway with full details
router.get('/:id', async (req, res) => {
    try {
        const [gateway] = await pool.query(
            'SELECT * FROM weekend_gateways WHERE gateway_id = ?', 
            [req.params.id]
        );
        
        if (!gateway.length) {
            return res.status(404).json({ message: "Weekend Gateway not found" });
        }

        const [images] = await pool.query(
            'SELECT * FROM weekend_gateway_images WHERE gateway_id = ? ORDER BY is_main DESC, sort_order ASC',
            [req.params.id]
        );

        const [relatedGateways] = await pool.query(`
            SELECT rg.*, w.name, w.price 
            FROM related_weekend_gateways rg
            LEFT JOIN weekend_gateways w ON rg.related_gateway_id = w.gateway_id
            WHERE rg.gateway_id = ?
            ORDER BY rg.sort_order
        `, [req.params.id]);

        res.json({
            gateway: gateway[0],
            images: images,
            related_gateways: relatedGateways
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE new weekend gateway
router.post('/', async (req, res) => {
    const { 
        gateway_code,
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
            `INSERT INTO weekend_gateways 
            (gateway_code, name, price, per_pax_twin, per_pax_triple, child_with_bed, child_without_bed, infant, per_pax_single, overview, inclusive, exclusive, places_nearby, booking_policy, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                gateway_code,
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
            gateway_id: result.insertId,
            message: 'Weekend Gateway created successfully'
        });
    } catch (err) {
        console.error('Error creating weekend gateway:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE weekend gateway
router.put('/:id', async (req, res) => {
    const gatewayId = req.params.id;
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
            `UPDATE weekend_gateways 
             SET name = ?, price = ?, per_pax_twin = ?, per_pax_triple = ?, child_with_bed = ?, 
                 child_without_bed = ?, infant = ?, per_pax_single = ?, overview = ?, inclusive = ?, 
                 exclusive = ?, places_nearby = ?, booking_policy = ?, status = ?
             WHERE gateway_id = ?`,
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
                gatewayId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Weekend Gateway not found" });
        }

        res.json({ 
            success: true,
            message: 'Weekend Gateway updated successfully'
        });
    } catch (err) {
        console.error('Error updating weekend gateway:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE weekend gateway (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const [result] = await pool.query(
            'UPDATE weekend_gateways SET status = 0 WHERE gateway_id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Weekend Gateway not found" });
        }

        res.json({ 
            success: true,
            message: 'Weekend Gateway deleted successfully' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPLOAD images for weekend gateway
router.post('/upload/:gatewayId', upload.array('images', 10), async (req, res) => {
    const gatewayId = req.params.gatewayId;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
    }

    try {
        const [gateway] = await pool.query(
            'SELECT gateway_id FROM weekend_gateways WHERE gateway_id = ?',
            [gatewayId]
        );

        if (gateway.length === 0) {
            return res.status(404).json({ message: "Weekend Gateway not found" });
        }

        const [existingImages] = await pool.query(
            'SELECT COUNT(*) as count FROM weekend_gateway_images WHERE gateway_id = ?',
            [gatewayId]
        );
        const isFirstImage = existingImages[0].count === 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const imageUrl = `/uploads/weekend-gateways/${file.filename}`;
            
            await pool.query(
                `INSERT INTO weekend_gateway_images (gateway_id, image_url, is_main, sort_order)
                 VALUES (?, ?, ?, ?)`,
                [
                    gatewayId, 
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
                url: `/uploads/weekend-gateways/${f.filename}`
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
            'SELECT gateway_id FROM weekend_gateway_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        const gatewayId = image[0].gateway_id;

        await pool.query(
            'UPDATE weekend_gateway_images SET is_main = 0 WHERE gateway_id = ?',
            [gatewayId]
        );

        await pool.query(
            'UPDATE weekend_gateway_images SET is_main = 1 WHERE image_id = ?',
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
            'SELECT image_url FROM weekend_gateway_images WHERE image_id = ?',
            [imageId]
        );

        if (image.length === 0) {
            return res.status(404).json({ message: "Image not found" });
        }

        await pool.query('DELETE FROM weekend_gateway_images WHERE image_id = ?', [imageId]);

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

// RELATED WEEKEND GATEWAYS ROUTES

// Add related weekend gateway
router.post('/related/:gatewayId', async (req, res) => {
    const gatewayId = req.params.gatewayId;
    const { related_name, related_price, related_image, sort_order } = req.body;

    try {
        const [existingGateway] = await pool.query(
            'SELECT gateway_id FROM weekend_gateways WHERE name = ? AND status = 1',
            [related_name]
        );

        let related_gateway_id = null;
        
        if (existingGateway.length > 0) {
            related_gateway_id = existingGateway[0].gateway_id;
        }

        let imageUrl = related_image;
        if (imageUrl && imageUrl.startsWith('blob:')) {
            imageUrl = null;
        }

        const [result] = await pool.query(
            `INSERT INTO related_weekend_gateways 
            (gateway_id, related_gateway_id, related_name, related_price, related_image, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                gatewayId, 
                related_gateway_id, 
                related_name, 
                related_price || null, 
                imageUrl || null, 
                sort_order || 0
            ]
        );

        res.status(201).json({ 
            success: true,
            relation_id: result.insertId,
            message: 'Related weekend gateway added successfully'
        });
    } catch (err) {
        console.error('Error adding related weekend gateway:', err);
        res.status(500).json({ error: err.message });
    }
});

// UPLOAD image for related weekend gateway
router.post('/upload-related/:gatewayId', upload.single('image'), async (req, res) => {
    const gatewayId = req.params.gatewayId;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    try {
        const [gateway] = await pool.query(
            'SELECT gateway_id FROM weekend_gateways WHERE gateway_id = ?',
            [gatewayId]
        );

        if (gateway.length === 0) {
            return res.status(404).json({ message: "Weekend Gateway not found" });
        }

        const imageUrl = `/uploads/weekend-gateways/${file.filename}`;

        res.json({ 
            success: true,
            image_url: imageUrl,
            message: 'Image uploaded successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get related weekend gateways
router.get('/related/:gatewayId', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT rg.*, w.name, w.price 
            FROM related_weekend_gateways rg
            LEFT JOIN weekend_gateways w ON rg.related_gateway_id = w.gateway_id
            WHERE rg.gateway_id = ?
            ORDER BY rg.sort_order
        `, [req.params.gatewayId]);

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update related weekend gateway
router.put('/related/:relationId', async (req, res) => {
    const relationId = req.params.relationId;
    const { related_name, related_price, related_image, sort_order } = req.body;

    try {
        const [existingGateway] = await pool.query(
            'SELECT gateway_id FROM weekend_gateways WHERE name = ? AND status = 1',
            [related_name]
        );

        let related_gateway_id = null;
        
        if (existingGateway.length > 0) {
            related_gateway_id = existingGateway[0].gateway_id;
        }

        let imageUrl = related_image;
        if (imageUrl && imageUrl.startsWith('blob:')) {
            imageUrl = null;
        }

        await pool.query(
            `UPDATE related_weekend_gateways 
             SET related_gateway_id = ?, related_name = ?, related_price = ?, related_image = ?, sort_order = ?
             WHERE relation_id = ?`,
            [
                related_gateway_id, 
                related_name, 
                related_price || null, 
                imageUrl || null, 
                sort_order, 
                relationId
            ]
        );

        res.json({ 
            success: true,
            message: 'Related weekend gateway updated successfully'
        });
    } catch (err) {
        console.error('Error updating related weekend gateway:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete related weekend gateway
router.delete('/related/:relationId', async (req, res) => {
    try {
        await pool.query('DELETE FROM related_weekend_gateways WHERE relation_id = ?', [req.params.relationId]);

        res.json({ 
            success: true,
            message: 'Related weekend gateway deleted successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// ==================== WEEKEND BOOKING FORM ROUTES ====================

// POST - Save weekend booking form data
router.post('/bookings', async (req, res) => {
    const {
        property_name,
        city,
        person_name,
        cell_no,
        email_id,
        address,
        city_location,
        pin_code,
        state,
        country,
        no_of_adults,
        no_of_rooms,
        no_of_child,
        children
    } = req.body;

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Insert main weekend booking
            const [bookingResult] = await connection.query(
                `INSERT INTO weekend_bookings 
                (property_name, city, person_name, cell_no, email_id, address, city_location, 
                 pin_code, state, country, no_of_adults, no_of_rooms, no_of_child)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    property_name,
                    city,
                    person_name,
                    cell_no,
                    email_id,
                    address,
                    city_location,
                    pin_code,
                    state,
                    country || 'India',
                    no_of_adults,
                    no_of_rooms,
                    no_of_child || 0
                ]
            );

            const bookingId = bookingResult.insertId;

            // Insert child details if any
            if (children && children.length > 0) {
                for (const child of children) {
                    await connection.query(
                        `INSERT INTO weekend_booking_children (booking_id, name, age, cell_no, email_id)
                         VALUES (?, ?, ?, ?, ?)`,
                        [
                            bookingId,
                            child.name,
                            child.age,
                            child.cell_no || null,
                            child.email_id || null
                        ]
                    );
                }
            }

            await connection.commit();
            connection.release();

            res.status(201).json({
                success: true,
                booking_id: bookingId,
                message: 'Weekend booking saved successfully'
            });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error('Error saving weekend booking:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET - Get all weekend bookings
router.get('/bookings', async (req, res) => {
    try {
        const [bookings] = await pool.query(`
            SELECT wb.*, 
                   COUNT(wbc.child_id) as actual_children
            FROM weekend_bookings wb
            LEFT JOIN weekend_booking_children wbc ON wb.booking_id = wbc.booking_id
            GROUP BY wb.booking_id
            ORDER BY wb.created_at DESC
        `);

        // Get children for each booking
        for (let booking of bookings) {
            const [children] = await pool.query(
                'SELECT * FROM weekend_booking_children WHERE booking_id = ? ORDER BY child_id',
                [booking.booking_id]
            );
            booking.children = children;
        }

        res.json(bookings);
    } catch (err) {
        console.error('Error fetching weekend bookings:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET - Get single weekend booking by ID
router.get('/bookings/:id', async (req, res) => {
    try {
        const [bookings] = await pool.query(
            'SELECT * FROM weekend_bookings WHERE booking_id = ?',
            [req.params.id]
        );

        if (bookings.length === 0) {
            return res.status(404).json({ message: "Weekend booking not found" });
        }

        const [children] = await pool.query(
            'SELECT * FROM weekend_booking_children WHERE booking_id = ? ORDER BY child_id',
            [req.params.id]
        );

        res.json({
            booking: bookings[0],
            children: children
        });
    } catch (err) {
        console.error('Error fetching weekend booking:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE - Delete weekend booking
router.delete('/bookings/:id', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Delete children first (foreign key constraint)
            await connection.query(
                'DELETE FROM weekend_booking_children WHERE booking_id = ?',
                [req.params.id]
            );

            // Delete booking
            const [result] = await connection.query(
                'DELETE FROM weekend_bookings WHERE booking_id = ?',
                [req.params.id]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: "Weekend booking not found" });
            }

            await connection.commit();
            connection.release();

            res.json({
                success: true,
                message: 'Weekend booking deleted successfully'
            });
        } catch (err) {
            await connection.rollback();
            connection.release();
            throw err;
        }
    } catch (err) {
        console.error('Error deleting weekend booking:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;