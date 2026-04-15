const express = require('express');
const router = express.Router();
const db = require('../config/db'); 
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const hotelUploadDir = 'uploads/hotels';
const roomUploadDir = 'uploads/rooms';

if (!fs.existsSync(hotelUploadDir)) {
    fs.mkdirSync(hotelUploadDir, { recursive: true });
}
if (!fs.existsSync(roomUploadDir)) {
    fs.mkdirSync(roomUploadDir, { recursive: true });
}

// Helper function to format date to YYYY-MM-DD
const formatDateForDB = (dateString) => {
    if (!dateString) return null;
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) return dateString;
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return dateString;
};

// Helper function to format date from DB
const formatDateFromDB = (date) => {
    if (!date) return null;
    if (date instanceof Date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) return date;
    if (typeof date === 'string' && date.includes('T')) return date.split('T')[0];
    return date;
};

// Safe JSON parse function
const safeJSONParse = (data, defaultValue = null) => {
    if (!data) return defaultValue;
    if (typeof data === 'object') return data;
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error('JSON parse error:', e.message, 'Data:', data?.substring?.(0, 100));
        return defaultValue;
    }
};

// Helper function to safely stringify JSON for MySQL
const safeJSONStringify = (data) => {
    if (!data) return null;
    if (Array.isArray(data) && data.length === 0) return '[]';
    if (typeof data === 'object') return JSON.stringify(data);
    return data;
};

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'roomImages') {
            cb(null, roomUploadDir);
        } else {
            cb(null, hotelUploadDir);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const prefix = file.fieldname === 'roomImages' ? 'room' : 'hotel';
        cb(null, `${prefix}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
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

const uploadFields = upload.fields([
    { name: 'mainImage', maxCount: 1 },
    { name: 'additionalImages', maxCount: 10 },
    { name: 'roomImages', maxCount: 50 }
]);

// =====================================================
// GET ALL OFFLINE HOTELS
// =====================================================
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM offline_hotels 
            ORDER BY created_at DESC
        `);
        
        const hotels = rows.map(hotel => ({
            ...hotel,
            children_ages: safeJSONParse(hotel.children_ages, []),
            additional_images: safeJSONParse(hotel.additional_images, []),
            amenities: safeJSONParse(hotel.amenities, []),
            custom_amenities: safeJSONParse(hotel.custom_amenities, []),
            check_in_date: formatDateFromDB(hotel.check_in_date),
            check_out_date: formatDateFromDB(hotel.check_out_date)
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

// =====================================================
// GET SINGLE OFFLINE HOTEL BY ID
// =====================================================
router.get('/:id', async (req, res) => {
    try {
        const hotelId = req.params.id;
        
        const [hotelRows] = await db.query(
            'SELECT * FROM offline_hotels WHERE id = ?',
            [hotelId]
        );
        
        if (hotelRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Offline hotel not found'
            });
        }

        const hotel = hotelRows[0];
        
        // Parse JSON fields safely
        hotel.children_ages = safeJSONParse(hotel.children_ages, []);
        hotel.additional_images = safeJSONParse(hotel.additional_images, []);
        hotel.amenities = safeJSONParse(hotel.amenities, []);
        hotel.custom_amenities = safeJSONParse(hotel.custom_amenities, []);
        hotel.check_in_date = formatDateFromDB(hotel.check_in_date);
        hotel.check_out_date = formatDateFromDB(hotel.check_out_date);

        // Get room types data
        const [roomTypes] = await db.query(
            'SELECT * FROM offline_hotel_room_types WHERE hotel_id = ?',
            [hotelId]
        );
        
        const roomTypesData = {
            standard: { enabled: false, hotels: [] },
            deluxe: { enabled: false, hotels: [] },
            luxury: { enabled: false, hotels: [] }
        };
        
        for (const roomType of roomTypes) {
            const category = roomType.room_category;
            if (!roomTypesData[category]) continue;
            
            roomTypesData[category].enabled = roomType.is_enabled === 1;
            
            const [roomOptions] = await db.query(
                'SELECT * FROM offline_hotel_room_options WHERE room_type_id = ?',
                [roomType.id]
            );
            
            for (const option of roomOptions) {
                const [roomImages] = await db.query(
                    'SELECT * FROM offline_hotel_room_images WHERE room_option_id = ? ORDER BY sort_order',
                    [option.id]
                );
                
                const images = roomImages.map(img => img.image_path);
                
                roomTypesData[category].hotels.push({
                    id: option.id,
                    roomType: option.room_name,
                    price: option.price,
                    amenities: safeJSONParse(option.amenities, []),
                    maxOccupancy: option.max_occupancy,
                    bedType: option.bed_type,
                    roomSize: option.room_size,
                    availableRooms: option.available_rooms,
                    description: option.description,
                    images: images
                });
            }
        }

        const [localities] = await db.query(
            'SELECT * FROM offline_hotel_search_localities WHERE hotel_id = ?',
            [hotelId]
        );

        const hotelData = {
            ...hotel,
            room_types_data: roomTypesData,
            searchLocality: localities[0]?.locality_name || ''
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

// =====================================================
// CREATE NEW OFFLINE HOTEL (WITHOUT custom_amenities)
// =====================================================
router.post('/', (req, res) => {
    uploadFields(req, res, async function(err) {
        if (err) {
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
                customAmenities,
                descriptions,
                roomTypesData
            } = req.body;

            // Parse JSON strings safely
            const parsedSearchDetails = safeJSONParse(searchDetails, {});
            const parsedHotelDetails = safeJSONParse(hotelDetails, {});
            const parsedDescriptions = safeJSONParse(descriptions, {});
            const parsedChildrenAges = safeJSONParse(childrenAges, []);
            const parsedCustomAmenities = safeJSONParse(customAmenities, []);
            const parsedRoomTypesData = safeJSONParse(roomTypesData, {});

            // Handle main image
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

            // Combine amenities with custom amenities for storage
            const allAmenities = [
                ...(parsedHotelDetails.amenities || []),
                ...parsedCustomAmenities
            ];

            // Check if custom_amenities column exists
            let hasCustomAmenitiesColumn = true;
            try {
                await connection.query('SELECT custom_amenities FROM offline_hotels LIMIT 1');
            } catch (e) {
                hasCustomAmenitiesColumn = false;
                console.log('custom_amenities column not found, storing in amenities only');
            }

            // Build insert query based on available columns
            let insertQuery;
            let insertValues;

            if (hasCustomAmenitiesColumn) {
                insertQuery = `
                    INSERT INTO offline_hotels (
                        country, city, location, property_name,
                        check_in_date, check_out_date, rooms, adults, children, pets,
                        children_ages,
                        hotel_name, hotel_location, star_rating, main_image,
                        additional_images, rating, total_ratings, price, taxes,
                        amenities, custom_amenities, status, free_stay_for_kids, limited_time_sale,
                        sale_price, original_price, login_to_book, pay_later,
                        overview_description, hotel_facilities_description,
                        airport_transfers_description, meal_plan_description,
                        taxes_description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                insertValues = [
                    parsedSearchDetails.country || '',
                    parsedSearchDetails.city || '',
                    parsedSearchDetails.location || null,
                    parsedSearchDetails.propertyName || null,
                    formatDateForDB(parsedSearchDetails.checkInDate),
                    formatDateForDB(parsedSearchDetails.checkOutDate),
                    parsedSearchDetails.rooms || 1,
                    parsedSearchDetails.adults || 2,
                    parsedSearchDetails.children || 0,
                    parsedSearchDetails.pets ? 1 : 0,
                    safeJSONStringify(parsedChildrenAges),
                    parsedHotelDetails.hotelName || '',
                    parsedHotelDetails.location || '',
                    parsedHotelDetails.starRating || 3,
                    mainImagePath,
                    safeJSONStringify(additionalImagePaths),
                    parsedHotelDetails.rating || 0,
                    parsedHotelDetails.totalRatings || 0,
                    parsedHotelDetails.price || '',
                    parsedHotelDetails.taxes || null,
                    safeJSONStringify(allAmenities),
                    safeJSONStringify(parsedCustomAmenities),
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
                ];
            } else {
                insertQuery = `
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
                        taxes_description
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                insertValues = [
                    parsedSearchDetails.country || '',
                    parsedSearchDetails.city || '',
                    parsedSearchDetails.location || null,
                    parsedSearchDetails.propertyName || null,
                    formatDateForDB(parsedSearchDetails.checkInDate),
                    formatDateForDB(parsedSearchDetails.checkOutDate),
                    parsedSearchDetails.rooms || 1,
                    parsedSearchDetails.adults || 2,
                    parsedSearchDetails.children || 0,
                    parsedSearchDetails.pets ? 1 : 0,
                    safeJSONStringify(parsedChildrenAges),
                    parsedHotelDetails.hotelName || '',
                    parsedHotelDetails.location || '',
                    parsedHotelDetails.starRating || 3,
                    mainImagePath,
                    safeJSONStringify(additionalImagePaths),
                    parsedHotelDetails.rating || 0,
                    parsedHotelDetails.totalRatings || 0,
                    parsedHotelDetails.price || '',
                    parsedHotelDetails.taxes || null,
                    safeJSONStringify(allAmenities),
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
                ];
            }

            console.log('Insert values count:', insertValues.length);
            
            const [hotelResult] = await connection.query(insertQuery, insertValues);
            const hotelId = hotelResult.insertId;

            // Insert search locality
            const localityName = parsedSearchDetails.location || parsedSearchDetails.city;
            if (localityName) {
                await connection.query(
                    'INSERT INTO offline_hotel_search_localities (hotel_id, locality_name) VALUES (?, ?)',
                    [hotelId, localityName]
                );
            }

            // Process room types
            if (parsedRoomTypesData && Object.keys(parsedRoomTypesData).length > 0) {
                const roomImageFiles = req.files?.roomImages || [];
                const roomImageMetadata = req.body.roomImageMetadata || [];
                
                let metadataArray = [];
                if (Array.isArray(roomImageMetadata)) {
                    metadataArray = roomImageMetadata.map(m => typeof m === 'string' ? safeJSONParse(m, {}) : m);
                } else if (typeof roomImageMetadata === 'string') {
                    metadataArray = [safeJSONParse(roomImageMetadata, {})];
                }

                for (const [category, categoryData] of Object.entries(parsedRoomTypesData)) {
                    if (!categoryData || !categoryData.enabled) continue;
                    
                    const [roomTypeResult] = await connection.query(
                        'INSERT INTO offline_hotel_room_types (hotel_id, room_category, is_enabled) VALUES (?, ?, ?)',
                        [hotelId, category, 1]
                    );
                    const roomTypeId = roomTypeResult.insertId;
                    
                    if (categoryData.hotels && categoryData.hotels.length > 0) {
                        for (let hotelIndex = 0; hotelIndex < categoryData.hotels.length; hotelIndex++) {
                            const hotel = categoryData.hotels[hotelIndex];
                            
                            const [optionResult] = await connection.query(
                                `INSERT INTO offline_hotel_room_options 
                                (hotel_id, room_type_id, room_name, price, amenities, max_occupancy, 
                                 bed_type, room_size, available_rooms, description) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    hotelId,
                                    roomTypeId,
                                    hotel.roomType || '',
                                    hotel.price || '',
                                    safeJSONStringify(hotel.amenities || []),
                                    hotel.maxOccupancy || 2,
                                    hotel.bedType || null,
                                    hotel.roomSize || null,
                                    hotel.availableRooms || 0,
                                    hotel.description || null
                                ]
                            );
                            const roomOptionId = optionResult.insertId;
                            
                            // Process room images
                            metadataArray.forEach((metadata, index) => {
                                if (metadata && metadata.category === category && metadata.hotelIndex === hotelIndex) {
                                    if (roomImageFiles[index]) {
                                        const imagePath = `/uploads/rooms/${roomImageFiles[index].filename}`;
                                        connection.query(
                                            'INSERT INTO offline_hotel_room_images (hotel_id, room_option_id, image_path, sort_order) VALUES (?, ?, ?, ?)',
                                            [hotelId, roomOptionId, imagePath, 0]
                                        ).catch(e => console.error('Error inserting room image:', e));
                                    }
                                }
                            });
                        }
                    }
                }
            }

            await connection.commit();

            res.status(201).json({
                success: true,
                message: 'Offline hotel created successfully',
                data: { id: hotelId }
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error creating offline hotel:', error);
            res.status(500).json({
                success: false,
                message: 'Error creating offline hotel: ' + error.message
            });
        } finally {
            connection.release();
        }
    });
});

// =====================================================
// UPDATE OFFLINE HOTEL
// =====================================================
router.put('/:id', (req, res) => {
    uploadFields(req, res, async function(err) {
        if (err) {
            console.error('Upload error:', err);
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const hotelId = req.params.id;
            const {
                searchDetails,
                childrenAges,
                hotelDetails,
                customAmenities,
                descriptions,
                roomTypesData
            } = req.body;

            // Parse JSON strings safely
            const parsedSearchDetails = safeJSONParse(searchDetails, {});
            const parsedHotelDetails = safeJSONParse(hotelDetails, {});
            const parsedDescriptions = safeJSONParse(descriptions, {});
            const parsedChildrenAges = safeJSONParse(childrenAges, []);
            const parsedCustomAmenities = safeJSONParse(customAmenities, []);
            const parsedRoomTypesData = safeJSONParse(roomTypesData, {});

            // Combine amenities with custom amenities
            const allAmenities = [
                ...(parsedHotelDetails.amenities || []),
                ...parsedCustomAmenities
            ];

            // Handle main image
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

            // Get existing additional images
            const [existingHotel] = await connection.query(
                'SELECT additional_images FROM offline_hotels WHERE id = ?',
                [hotelId]
            );
            
            let finalAdditionalImages = [];
            if (additionalImagePaths.length > 0) {
                finalAdditionalImages = additionalImagePaths;
            } else if (parsedHotelDetails.additionalImages) {
                finalAdditionalImages = parsedHotelDetails.additionalImages;
            } else if (existingHotel[0]?.additional_images) {
                finalAdditionalImages = safeJSONParse(existingHotel[0].additional_images, []);
            }

            // Check if custom_amenities column exists
            let hasCustomAmenitiesColumn = true;
            try {
                await connection.query('SELECT custom_amenities FROM offline_hotels LIMIT 1');
            } catch (e) {
                hasCustomAmenitiesColumn = false;
            }

            // Build update query based on available columns
            let updateQuery;
            let updateValues;

            if (hasCustomAmenitiesColumn) {
                updateQuery = `
                    UPDATE offline_hotels SET
                        country = ?, city = ?, location = ?, property_name = ?,
                        check_in_date = ?, check_out_date = ?, rooms = ?, adults = ?,
                        children = ?, pets = ?, children_ages = ?,
                        hotel_name = ?, hotel_location = ?, star_rating = ?,
                        main_image = ?, additional_images = ?, rating = ?,
                        total_ratings = ?, price = ?, taxes = ?, amenities = ?,
                        custom_amenities = ?, status = ?, free_stay_for_kids = ?, limited_time_sale = ?,
                        sale_price = ?, original_price = ?, login_to_book = ?,
                        pay_later = ?, overview_description = ?,
                        hotel_facilities_description = ?, airport_transfers_description = ?,
                        meal_plan_description = ?, taxes_description = ?
                    WHERE id = ?
                `;
                updateValues = [
                    parsedSearchDetails.country || '',
                    parsedSearchDetails.city || '',
                    parsedSearchDetails.location || null,
                    parsedSearchDetails.propertyName || null,
                    formatDateForDB(parsedSearchDetails.checkInDate),
                    formatDateForDB(parsedSearchDetails.checkOutDate),
                    parsedSearchDetails.rooms || 1,
                    parsedSearchDetails.adults || 2,
                    parsedSearchDetails.children || 0,
                    parsedSearchDetails.pets ? 1 : 0,
                    safeJSONStringify(parsedChildrenAges),
                    parsedHotelDetails.hotelName || '',
                    parsedHotelDetails.location || '',
                    parsedHotelDetails.starRating || 3,
                    mainImagePath,
                    safeJSONStringify(finalAdditionalImages),
                    parsedHotelDetails.rating || 0,
                    parsedHotelDetails.totalRatings || 0,
                    parsedHotelDetails.price || '',
                    parsedHotelDetails.taxes || null,
                    safeJSONStringify(allAmenities),
                    safeJSONStringify(parsedCustomAmenities),
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
                    hotelId
                ];
            } else {
                updateQuery = `
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
                        meal_plan_description = ?, taxes_description = ?
                    WHERE id = ?
                `;
                updateValues = [
                    parsedSearchDetails.country || '',
                    parsedSearchDetails.city || '',
                    parsedSearchDetails.location || null,
                    parsedSearchDetails.propertyName || null,
                    formatDateForDB(parsedSearchDetails.checkInDate),
                    formatDateForDB(parsedSearchDetails.checkOutDate),
                    parsedSearchDetails.rooms || 1,
                    parsedSearchDetails.adults || 2,
                    parsedSearchDetails.children || 0,
                    parsedSearchDetails.pets ? 1 : 0,
                    safeJSONStringify(parsedChildrenAges),
                    parsedHotelDetails.hotelName || '',
                    parsedHotelDetails.location || '',
                    parsedHotelDetails.starRating || 3,
                    mainImagePath,
                    safeJSONStringify(finalAdditionalImages),
                    parsedHotelDetails.rating || 0,
                    parsedHotelDetails.totalRatings || 0,
                    parsedHotelDetails.price || '',
                    parsedHotelDetails.taxes || null,
                    safeJSONStringify(allAmenities),
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
                    hotelId
                ];
            }

            await connection.query(updateQuery, updateValues);

            // Update search locality
            await connection.query('DELETE FROM offline_hotel_search_localities WHERE hotel_id = ?', [hotelId]);
            const localityName = parsedSearchDetails.location || parsedSearchDetails.city;
            if (localityName) {
                await connection.query(
                    'INSERT INTO offline_hotel_search_localities (hotel_id, locality_name) VALUES (?, ?)',
                    [hotelId, localityName]
                );
            }

            // Delete existing room data
            await connection.query('DELETE FROM offline_hotel_room_images WHERE hotel_id = ?', [hotelId]);
            await connection.query('DELETE FROM offline_hotel_room_options WHERE hotel_id = ?', [hotelId]);
            await connection.query('DELETE FROM offline_hotel_room_types WHERE hotel_id = ?', [hotelId]);

            // Process room types
            if (parsedRoomTypesData && Object.keys(parsedRoomTypesData).length > 0) {
                const roomImageFiles = req.files?.roomImages || [];
                const roomImageMetadata = req.body.roomImageMetadata || [];
                
                let metadataArray = [];
                if (Array.isArray(roomImageMetadata)) {
                    metadataArray = roomImageMetadata.map(m => typeof m === 'string' ? safeJSONParse(m, {}) : m);
                } else if (typeof roomImageMetadata === 'string') {
                    metadataArray = [safeJSONParse(roomImageMetadata, {})];
                }

                for (const [category, categoryData] of Object.entries(parsedRoomTypesData)) {
                    if (!categoryData || !categoryData.enabled) continue;
                    
                    const [roomTypeResult] = await connection.query(
                        'INSERT INTO offline_hotel_room_types (hotel_id, room_category, is_enabled) VALUES (?, ?, ?)',
                        [hotelId, category, 1]
                    );
                    const roomTypeId = roomTypeResult.insertId;
                    
                    if (categoryData.hotels && categoryData.hotels.length > 0) {
                        for (let hotelIndex = 0; hotelIndex < categoryData.hotels.length; hotelIndex++) {
                            const hotel = categoryData.hotels[hotelIndex];
                            
                            const [optionResult] = await connection.query(
                                `INSERT INTO offline_hotel_room_options 
                                (hotel_id, room_type_id, room_name, price, amenities, max_occupancy, 
                                 bed_type, room_size, available_rooms, description) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    hotelId,
                                    roomTypeId,
                                    hotel.roomType || '',
                                    hotel.price || '',
                                    safeJSONStringify(hotel.amenities || []),
                                    hotel.maxOccupancy || 2,
                                    hotel.bedType || null,
                                    hotel.roomSize || null,
                                    hotel.availableRooms || 0,
                                    hotel.description || null
                                ]
                            );
                            const roomOptionId = optionResult.insertId;
                            
                            metadataArray.forEach((metadata, index) => {
                                if (metadata && metadata.category === category && metadata.hotelIndex === hotelIndex) {
                                    if (roomImageFiles[index]) {
                                        const imagePath = `/uploads/rooms/${roomImageFiles[index].filename}`;
                                        connection.query(
                                            'INSERT INTO offline_hotel_room_images (hotel_id, room_option_id, image_path, sort_order) VALUES (?, ?, ?, ?)',
                                            [hotelId, roomOptionId, imagePath, 0]
                                        ).catch(e => console.error('Error inserting room image:', e));
                                    }
                                }
                            });
                        }
                    }
                }
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Offline hotel updated successfully'
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error updating offline hotel:', error);
            res.status(500).json({
                success: false,
                message: 'Error updating offline hotel: ' + error.message
            });
        } finally {
            connection.release();
        }
    });
});

// =====================================================
// DELETE OFFLINE HOTEL
// =====================================================
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const hotelId = req.params.id;

        // Get image paths before deleting
        const [hotel] = await connection.query(
            'SELECT main_image, additional_images FROM offline_hotels WHERE id = ?', 
            [hotelId]
        );
        
        // Get room images
        const [roomImages] = await connection.query(
            'SELECT image_path FROM offline_hotel_room_images WHERE hotel_id = ?',
            [hotelId]
        );
        
        // Delete all image files
        if (hotel.length > 0) {
            if (hotel[0].main_image) {
                const mainImagePath = path.join(__dirname, '..', hotel[0].main_image);
                if (fs.existsSync(mainImagePath)) {
                    try { fs.unlinkSync(mainImagePath); } catch(e) {}
                }
            }
            
            if (hotel[0].additional_images) {
                try {
                    const additionalImages = safeJSONParse(hotel[0].additional_images, []);
                    additionalImages.forEach(imagePath => {
                        const fullPath = path.join(__dirname, '..', imagePath);
                        if (fs.existsSync(fullPath)) {
                            try { fs.unlinkSync(fullPath); } catch(e) {}
                        }
                    });
                } catch(e) {}
            }
        }
        
        roomImages.forEach(img => {
            const fullPath = path.join(__dirname, '..', img.image_path);
            if (fs.existsSync(fullPath)) {
                try { fs.unlinkSync(fullPath); } catch(e) {}
            }
        });

        // Delete related records
        await connection.query('DELETE FROM offline_hotel_room_images WHERE hotel_id = ?', [hotelId]);
        await connection.query('DELETE FROM offline_hotel_room_options WHERE hotel_id = ?', [hotelId]);
        await connection.query('DELETE FROM offline_hotel_room_types WHERE hotel_id = ?', [hotelId]);
        await connection.query('DELETE FROM offline_hotel_search_localities WHERE hotel_id = ?', [hotelId]);
        
        // Delete main hotel
        const [result] = await connection.query('DELETE FROM offline_hotels WHERE id = ?', [hotelId]);

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

module.exports = router;