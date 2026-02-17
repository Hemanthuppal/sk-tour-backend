const express = require('express');
const router = express.Router();
const db = require('../config/db'); 
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = 'uploads/hotels';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `hotel-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// Handle multiple file uploads
const uploadFields = upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'additionalImages', maxCount: 10 }
]);

// Get all offline hotels
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM offline_hotels 
            ORDER BY created_at DESC
        `);
        
        // Parse JSON fields for each row
        const hotels = rows.map(hotel => ({
            ...hotel,
            children_ages: hotel.children_ages ? JSON.parse(hotel.children_ages) : [],
            additional_images: hotel.additional_images ? JSON.parse(hotel.additional_images) : []
        }));
        
        res.json({
            success: true,
            data: hotels
        });
    } catch (error) {
        console.error('Error fetching offline hotels:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching offline hotels',
            error: error.message
        });
    }
});

// Get single offline hotel by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM offline_hotels WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Offline hotel not found'
            });
        }

        const hotel = rows[0];
        
        // Parse JSON fields
        hotel.children_ages = hotel.children_ages ? JSON.parse(hotel.children_ages) : [];
        hotel.additional_images = hotel.additional_images ? JSON.parse(hotel.additional_images) : [];

        // Fetch associated filter data
        const [priceRanges] = await db.query(
            'SELECT * FROM offline_hotel_price_ranges WHERE hotel_id = ?',
            [req.params.id]
        );
        
        const [starCategories] = await db.query(
            'SELECT * FROM offline_hotel_star_categories WHERE hotel_id = ?',
            [req.params.id]
        );
        
        const [budget] = await db.query(
            'SELECT * FROM offline_hotel_budget WHERE hotel_id = ?',
            [req.params.id]
        );
        
        const [localities] = await db.query(
            'SELECT * FROM offline_hotel_search_localities WHERE hotel_id = ?',
            [req.params.id]
        );

        const hotelData = {
            ...hotel,
            filters: {
                priceRanges,
                starCategories,
                budget: budget[0] || null,
                searchLocalities: localities
            }
        };

        res.json({
            success: true,
            data: hotelData
        });
    } catch (error) {
        console.error('Error fetching offline hotel:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching offline hotel',
            error: error.message
        });
    }
});

// Create new offline hotel with image upload
router.post('/', (req, res) => {
    uploadFields(req, res, async function(err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading
            console.error('Multer error:', err);
            return res.status(400).json({
                success: false,
                message: err.message === 'Unexpected field' 
                    ? 'Unexpected field in upload. Please check your form fields.'
                    : err.message
            });
        } else if (err) {
            // An unknown error occurred
            console.error('Upload error:', err);
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const {
                searchDetails,
                childrenAges,
                hotelDetails,
                descriptions,
                filters
            } = req.body;

            // Parse JSON strings if they came as strings
            const parsedSearchDetails = typeof searchDetails === 'string' ? JSON.parse(searchDetails) : searchDetails;
            const parsedHotelDetails = typeof hotelDetails === 'string' ? JSON.parse(hotelDetails) : hotelDetails;
            const parsedDescriptions = typeof descriptions === 'string' ? JSON.parse(descriptions) : descriptions;
            const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters;
            const parsedChildrenAges = typeof childrenAges === 'string' ? JSON.parse(childrenAges) : childrenAges;

            // Handle main image upload
            let mainImagePath = parsedHotelDetails.mainImage || null;
            if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
                mainImagePath = `/uploads/hotels/${req.files.mainImage[0].filename}`;
            }

            // Handle additional images
            const additionalImagePaths = [];
            if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
                req.files.additionalImages.forEach(file => {
                    additionalImagePaths.push(`/uploads/hotels/${file.filename}`);
                });
            }

            // Insert main hotel details
            const [hotelResult] = await connection.query(`
                INSERT INTO offline_hotels (
                    country, city, location, property_name,
                    check_in_date, check_out_date, rooms, adults, children, pets,
                    children_ages,
                    hotel_name, hotel_location, star_rating, main_image,
                    additional_images, rating, total_ratings, price, taxes,
                    amenities, status, free_stay_for_kids, limited_time_sale,
                    sale_price, original_price, login_to_book, pay_later,
                    overview_description, hotel_facilities_description,
                    airport_transfers_description, meal_plan_description,
                    taxes_description,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [
                    parsedSearchDetails.country,
                    parsedSearchDetails.city,
                    parsedSearchDetails.location || null,
                    parsedSearchDetails.propertyName || null,
                    parsedSearchDetails.checkInDate,
                    parsedSearchDetails.checkOutDate,
                    parsedSearchDetails.rooms,
                    parsedSearchDetails.adults,
                    parsedSearchDetails.children,
                    parsedSearchDetails.pets ? 1 : 0,
                    JSON.stringify(parsedChildrenAges),
                    parsedHotelDetails.hotelName,
                    parsedHotelDetails.location,
                    parsedHotelDetails.starRating,
                    mainImagePath,
                    additionalImagePaths.length > 0 ? JSON.stringify(additionalImagePaths) : JSON.stringify([]),
                    parsedHotelDetails.rating || 0,
                    parsedHotelDetails.totalRatings || 0,
                    parsedHotelDetails.price,
                    parsedHotelDetails.taxes || null,
                    parsedHotelDetails.amenities || null,
                    parsedHotelDetails.status || 'Available',
                    parsedHotelDetails.freeStayForKids ? 1 : 0,
                    parsedHotelDetails.limitedTimeSale ? 1 : 0,
                    parsedHotelDetails.salePrice || null,
                    parsedHotelDetails.originalPrice || null,
                    parsedHotelDetails.loginToBook ? 1 : 0,
                    parsedHotelDetails.payLater ? 1 : 0,
                    parsedDescriptions.overview || null,
                    parsedDescriptions.hotelFacilities || null,
                    parsedDescriptions.airportTransfers || null,
                    parsedDescriptions.mealPlan || null,
                    parsedDescriptions.taxesDescription || null
                ]
            );

            const hotelId = hotelResult.insertId;

            // Insert price ranges
            if (parsedFilters.priceRanges && parsedFilters.priceRanges.length > 0) {
                const priceRangeValues = parsedFilters.priceRanges.map(range => [
                    hotelId,
                    range.min,
                    range.max,
                    range.range,
                    range.count || 0,
                    range.selected ? 1 : 0,
                    new Date()
                ]);
                
                await connection.query(`
                    INSERT INTO offline_hotel_price_ranges (
                        hotel_id, min_price, max_price, range_label, property_count, is_selected, created_at
                    ) VALUES ?`,
                    [priceRangeValues]
                );
            }

            // Insert star categories
            if (parsedFilters.starCategories && parsedFilters.starCategories.length > 0) {
                const starValues = parsedFilters.starCategories.map(star => [
                    hotelId,
                    star.stars,
                    star.count || 0,
                    star.selected ? 1 : 0,
                    new Date()
                ]);
                
                await connection.query(`
                    INSERT INTO offline_hotel_star_categories (
                        hotel_id, stars, property_count, is_selected, created_at
                    ) VALUES ?`,
                    [starValues]
                );
            }

            // Insert budget
            if (parsedFilters.budget) {
                await connection.query(`
                    INSERT INTO offline_hotel_budget (
                        hotel_id, min_budget, max_budget, created_at
                    ) VALUES (?, ?, ?, NOW())`,
                    [hotelId, parsedFilters.budget.min || null, parsedFilters.budget.max || null]
                );
            }

            // Insert search locality
            if (parsedFilters.searchLocality) {
                await connection.query(`
                    INSERT INTO offline_hotel_search_localities (
                        hotel_id, locality_name, created_at
                    ) VALUES (?, ?, NOW())`,
                    [hotelId, parsedFilters.searchLocality]
                );
            }

            await connection.commit();

            res.status(201).json({
                success: true,
                message: 'Offline hotel created successfully',
                data: { 
                    id: hotelId,
                    mainImage: mainImagePath,
                    additionalImages: additionalImagePaths
                }
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error creating offline hotel:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating offline hotel: ' + error.message,
                error: error.message
            });
        } finally {
            connection.release();
        }
    });
});

// Update offline hotel with image upload
router.put('/:id', (req, res) => {
    uploadFields(req, res, async function(err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(400).json({
                success: false,
                message: err.message === 'Unexpected field' 
                    ? 'Unexpected field in upload. Please check your form fields.'
                    : err.message
            });
        } else if (err) {
            console.error('Upload error:', err);
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const {
                searchDetails,
                childrenAges,
                hotelDetails,
                descriptions,
                filters
            } = req.body;

            // Parse JSON strings if they came as strings
            const parsedSearchDetails = typeof searchDetails === 'string' ? JSON.parse(searchDetails) : searchDetails;
            const parsedHotelDetails = typeof hotelDetails === 'string' ? JSON.parse(hotelDetails) : hotelDetails;
            const parsedDescriptions = typeof descriptions === 'string' ? JSON.parse(descriptions) : descriptions;
            const parsedFilters = typeof filters === 'string' ? JSON.parse(filters) : filters;
            const parsedChildrenAges = typeof childrenAges === 'string' ? JSON.parse(childrenAges) : childrenAges;

            // Handle main image upload
            let mainImagePath = parsedHotelDetails.mainImage;
            if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
                mainImagePath = `/uploads/hotels/${req.files.mainImage[0].filename}`;
            }

            // Handle additional images
            const additionalImagePaths = [];
            if (req.files && req.files.additionalImages && req.files.additionalImages.length > 0) {
                req.files.additionalImages.forEach(file => {
                    additionalImagePaths.push(`/uploads/hotels/${file.filename}`);
                });
            }

            // Update main hotel details
            await connection.query(`
                UPDATE offline_hotels SET
                    country = ?, city = ?, location = ?, property_name = ?,
                    check_in_date = ?, check_out_date = ?, rooms = ?, adults = ?,
                    children = ?, pets = ?, children_ages = ?,
                    hotel_name = ?, hotel_location = ?, star_rating = ?,
                    main_image = ?, additional_images = ?, rating = ?,
                    total_ratings = ?, price = ?, taxes = ?, amenities = ?,
                    status = ?, free_stay_for_kids = ?, limited_time_sale = ?,
                    sale_price = ?, original_price = ?, login_to_book = ?,
                    pay_later = ?, overview_description = ?,
                    hotel_facilities_description = ?, airport_transfers_description = ?,
                    meal_plan_description = ?, taxes_description = ?,
                    updated_at = NOW()
                WHERE id = ?`,
                [
                    parsedSearchDetails.country,
                    parsedSearchDetails.city,
                    parsedSearchDetails.location || null,
                    parsedSearchDetails.propertyName || null,
                    parsedSearchDetails.checkInDate,
                    parsedSearchDetails.checkOutDate,
                    parsedSearchDetails.rooms,
                    parsedSearchDetails.adults,
                    parsedSearchDetails.children,
                    parsedSearchDetails.pets ? 1 : 0,
                    JSON.stringify(parsedChildrenAges),
                    parsedHotelDetails.hotelName,
                    parsedHotelDetails.location,
                    parsedHotelDetails.starRating,
                    mainImagePath,
                    additionalImagePaths.length > 0 ? JSON.stringify(additionalImagePaths) : parsedHotelDetails.additionalImages ? JSON.stringify(parsedHotelDetails.additionalImages) : JSON.stringify([]),
                    parsedHotelDetails.rating || 0,
                    parsedHotelDetails.totalRatings || 0,
                    parsedHotelDetails.price,
                    parsedHotelDetails.taxes || null,
                    parsedHotelDetails.amenities || null,
                    parsedHotelDetails.status || 'Available',
                    parsedHotelDetails.freeStayForKids ? 1 : 0,
                    parsedHotelDetails.limitedTimeSale ? 1 : 0,
                    parsedHotelDetails.salePrice || null,
                    parsedHotelDetails.originalPrice || null,
                    parsedHotelDetails.loginToBook ? 1 : 0,
                    parsedHotelDetails.payLater ? 1 : 0,
                    parsedDescriptions.overview || null,
                    parsedDescriptions.hotelFacilities || null,
                    parsedDescriptions.airportTransfers || null,
                    parsedDescriptions.mealPlan || null,
                    parsedDescriptions.taxesDescription || null,
                    req.params.id
                ]
            );

            // Delete existing filters
            await connection.query('DELETE FROM offline_hotel_price_ranges WHERE hotel_id = ?', [req.params.id]);
            await connection.query('DELETE FROM offline_hotel_star_categories WHERE hotel_id = ?', [req.params.id]);
            await connection.query('DELETE FROM offline_hotel_budget WHERE hotel_id = ?', [req.params.id]);
            await connection.query('DELETE FROM offline_hotel_search_localities WHERE hotel_id = ?', [req.params.id]);

            // Re-insert price ranges
            if (parsedFilters.priceRanges && parsedFilters.priceRanges.length > 0) {
                const priceRangeValues = parsedFilters.priceRanges.map(range => [
                    req.params.id,
                    range.min,
                    range.max,
                    range.range,
                    range.count || 0,
                    range.selected ? 1 : 0,
                    new Date()
                ]);
                
                await connection.query(`
                    INSERT INTO offline_hotel_price_ranges (
                        hotel_id, min_price, max_price, range_label, property_count, is_selected, created_at
                    ) VALUES ?`,
                    [priceRangeValues]
                );
            }

            // Re-insert star categories
            if (parsedFilters.starCategories && parsedFilters.starCategories.length > 0) {
                const starValues = parsedFilters.starCategories.map(star => [
                    req.params.id,
                    star.stars,
                    star.count || 0,
                    star.selected ? 1 : 0,
                    new Date()
                ]);
                
                await connection.query(`
                    INSERT INTO offline_hotel_star_categories (
                        hotel_id, stars, property_count, is_selected, created_at
                    ) VALUES ?`,
                    [starValues]
                );
            }

            // Re-insert budget
            if (parsedFilters.budget) {
                await connection.query(`
                    INSERT INTO offline_hotel_budget (
                        hotel_id, min_budget, max_budget, created_at
                    ) VALUES (?, ?, ?, NOW())`,
                    [req.params.id, parsedFilters.budget.min || null, parsedFilters.budget.max || null]
                );
            }

            // Re-insert search locality
            if (parsedFilters.searchLocality) {
                await connection.query(`
                    INSERT INTO offline_hotel_search_localities (
                        hotel_id, locality_name, created_at
                    ) VALUES (?, ?, NOW())`,
                    [req.params.id, parsedFilters.searchLocality]
                );
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Offline hotel updated successfully',
                data: { 
                    mainImage: mainImagePath,
                    additionalImages: additionalImagePaths
                }
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error updating offline hotel:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating offline hotel: ' + error.message,
                error: error.message
            });
        } finally {
            connection.release();
        }
    });
});

// Delete offline hotel
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Get image paths before deleting
        const [hotel] = await connection.query('SELECT main_image, additional_images FROM offline_hotels WHERE id = ?', [req.params.id]);
        
        if (hotel.length > 0) {
            // Delete main image file
            if (hotel[0].main_image) {
                const mainImagePath = path.join(__dirname, '..', hotel[0].main_image);
                if (fs.existsSync(mainImagePath)) {
                    fs.unlinkSync(mainImagePath);
                }
            }
            
            // Delete additional images
            if (hotel[0].additional_images) {
                const additionalImages = JSON.parse(hotel[0].additional_images);
                additionalImages.forEach(imagePath => {
                    const fullPath = path.join(__dirname, '..', imagePath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                });
            }
        }

        // Delete related records first
        await connection.query('DELETE FROM offline_hotel_price_ranges WHERE hotel_id = ?', [req.params.id]);
        await connection.query('DELETE FROM offline_hotel_star_categories WHERE hotel_id = ?', [req.params.id]);
        await connection.query('DELETE FROM offline_hotel_budget WHERE hotel_id = ?', [req.params.id]);
        await connection.query('DELETE FROM offline_hotel_search_localities WHERE hotel_id = ?', [req.params.id]);
        
        // Delete main hotel
        const [result] = await connection.query('DELETE FROM offline_hotels WHERE id = ?', [req.params.id]);

        await connection.commit();

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Offline hotel not found'
            });
        }

        res.json({
            success: true,
            message: 'Offline hotel deleted successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting offline hotel:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting offline hotel',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

// Bulk delete offline hotels
router.post('/bulk-delete', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No hotel IDs provided'
            });
        }

        // Get all image paths before deleting
        const [hotels] = await connection.query('SELECT main_image, additional_images FROM offline_hotels WHERE id IN (?)', [ids]);
        
        hotels.forEach(hotel => {
            // Delete main image file
            if (hotel.main_image) {
                const mainImagePath = path.join(__dirname, '..', hotel.main_image);
                if (fs.existsSync(mainImagePath)) {
                    fs.unlinkSync(mainImagePath);
                }
            }
            
            // Delete additional images
            if (hotel.additional_images) {
                try {
                    const additionalImages = JSON.parse(hotel.additional_images);
                    additionalImages.forEach(imagePath => {
                        const fullPath = path.join(__dirname, '..', imagePath);
                        if (fs.existsSync(fullPath)) {
                            fs.unlinkSync(fullPath);
                        }
                    });
                } catch (e) {
                    console.error('Error parsing additional_images:', e);
                }
            }
        });

        // Delete all related records for these IDs
        await connection.query('DELETE FROM offline_hotel_price_ranges WHERE hotel_id IN (?)', [ids]);
        await connection.query('DELETE FROM offline_hotel_star_categories WHERE hotel_id IN (?)', [ids]);
        await connection.query('DELETE FROM offline_hotel_budget WHERE hotel_id IN (?)', [ids]);
        await connection.query('DELETE FROM offline_hotel_search_localities WHERE hotel_id IN (?)', [ids]);
        
        // Delete main hotels
        const [result] = await connection.query('DELETE FROM offline_hotels WHERE id IN (?)', [ids]);

        await connection.commit();

        res.json({
            success: true,
            message: `${result.affectedRows} hotels deleted successfully`
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error bulk deleting offline hotels:', error);
        res.status(500).json({
            success: false,
            message: 'Error bulk deleting offline hotels',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

module.exports = router;