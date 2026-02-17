const express = require('express');
const router = express.Router();
const db = require('../config/db'); 

// Get all offline flights
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM offline_flights 
            ORDER BY created_at DESC
        `);
        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching offline flights:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching offline flights',
            error: error.message
        });
    }
});

// Get single offline flight by ID
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM offline_flights WHERE id = ?',
            [req.params.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Offline flight not found'
            });
        }

        // Fetch associated filters
        const [filterRows] = await db.query(
            'SELECT * FROM offline_flight_filters WHERE flight_id = ?',
            [req.params.id]
        );

        const flightData = {
            ...rows[0],
            filters: filterRows
        };

        res.json({
            success: true,
            data: flightData
        });
    } catch (error) {
        console.error('Error fetching offline flight:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching offline flight',
            error: error.message
        });
    }
});

// Create new offline flight
router.post('/', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            bookingType,
            flightDetails,
            filters
        } = req.body;

        // Insert main flight details
        const [flightResult] = await connection.query(`
            INSERT INTO offline_flights (
                booking_type,
                from_city,
                from_airport,
                from_airport_code,
                to_city,
                to_airport,
                to_airport_code,
                departure_date,
                return_date,
                adults,
                children,
                infants,
                traveller_class,
                flight_time,
                duration,
                arrival_time,
                flight_type,
                airline,
                flight_number,
                baggage_allowance,
                meals_seat_description,
                refundable_status_description,
                meals_included,
                price_per_adult,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                bookingType,
                flightDetails.fromCity,
                flightDetails.fromAirport,
                flightDetails.fromAirportCode,
                flightDetails.toCity,
                flightDetails.toAirport,
                flightDetails.toAirportCode,
                flightDetails.departureDate,
                flightDetails.returnDate || null,
                flightDetails.adults,
                flightDetails.children,
                flightDetails.infants,
                flightDetails.travellerClass,
                flightDetails.flightTime,
                flightDetails.duration,
                flightDetails.arrivalTime,
                flightDetails.flightType,
                flightDetails.airline,
                flightDetails.flightNumber,
                flightDetails.baggageAllowance,
                flightDetails.mealsSeatDescription,
                flightDetails.refundableStatusDescription,
                flightDetails.mealsIncluded ? 1 : 0,
                flightDetails.pricePerAdult
            ]
        );

        const flightId = flightResult.insertId;

        // Insert popular filters
        await connection.query(`
            INSERT INTO offline_flight_filters (
                flight_id,
                filter_category,
                filter_type,
                filter_name,
                filter_value,
                filter_price,
                is_selected,
                created_at
            ) VALUES ?`,
            [
                [
                    // Popular Filters
                    [flightId, 'popular', 'non_stop', 'Non Stop', 'non_stop', filters.stops[0].price, filters.stops[0].selected ? 1 : 0, new Date()],
                    [flightId, 'popular', 'hide_nearby', 'Hide Nearby Airports', 'hide_nearby', '7121', filters.hideNearbyAirports ? 1 : 0, new Date()],
                    [flightId, 'popular', 'refundable', 'Refundable Fares', 'refundable', '6848', filters.refundableFares ? 1 : 0, new Date()],
                    [flightId, 'popular', 'one_stop', '1 Stop', 'one_stop', filters.stops[1].price, filters.stops[1].selected ? 1 : 0, new Date()],
                    
                    // Departure Airports
                    ...filters.departureAirports.map(airport => [
                        flightId, 'departure_airport', 'airport', airport.name, airport.code, airport.price, airport.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Stops
                    ...filters.stops.map(stop => [
                        flightId, 'stops', 'stop', stop.type, stop.type.toLowerCase().replace(' ', '_'), stop.price, stop.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Departure Time Ranges
                    ...filters.departureTimeRanges.map((range, index) => [
                        flightId, 'departure_time', 'time_range', range.range, `departure_${index}`, null, range.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Arrival Time Ranges
                    ...filters.arrivalTimeRanges.map((range, index) => [
                        flightId, 'arrival_time', 'time_range', range.range, `arrival_${index}`, null, range.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Airlines
                    ...filters.airlines.map(airline => [
                        flightId, 'airline', 'airline', airline.name, airline.code, airline.price, airline.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Aircraft Sizes
                    ...filters.aircraftSizes.map(size => [
                        flightId, 'aircraft_size', 'size', size.size, size.size.toLowerCase().replace(/\s/g, '_'), size.price, size.selected ? 1 : 0, new Date()
                    ])
                ]
            ]
        );

        // Insert price range
        await connection.query(`
            INSERT INTO offline_flight_price_ranges (
                flight_id,
                min_price,
                max_price,
                created_at
            ) VALUES (?, ?, ?, NOW())`,
            [flightId, filters.minPrice, filters.maxPrice]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Offline flight created successfully',
            data: { id: flightId }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating offline flight:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating offline flight',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

// Update offline flight
router.put('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const {
            bookingType,
            flightDetails,
            filters
        } = req.body;

        // Update main flight details
        await connection.query(`
            UPDATE offline_flights SET
                booking_type = ?,
                from_city = ?,
                from_airport = ?,
                from_airport_code = ?,
                to_city = ?,
                to_airport = ?,
                to_airport_code = ?,
                departure_date = ?,
                return_date = ?,
                adults = ?,
                children = ?,
                infants = ?,
                traveller_class = ?,
                flight_time = ?,
                duration = ?,
                arrival_time = ?,
                flight_type = ?,
                airline = ?,
                flight_number = ?,
                baggage_allowance = ?,
                meals_seat_description = ?,
                refundable_status_description = ?,
                meals_included = ?,
                price_per_adult = ?,
                updated_at = NOW()
            WHERE id = ?`,
            [
                bookingType,
                flightDetails.fromCity,
                flightDetails.fromAirport,
                flightDetails.fromAirportCode,
                flightDetails.toCity,
                flightDetails.toAirport,
                flightDetails.toAirportCode,
                flightDetails.departureDate,
                flightDetails.returnDate || null,
                flightDetails.adults,
                flightDetails.children,
                flightDetails.infants,
                flightDetails.travellerClass,
                flightDetails.flightTime,
                flightDetails.duration,
                flightDetails.arrivalTime,
                flightDetails.flightType,
                flightDetails.airline,
                flightDetails.flightNumber,
                flightDetails.baggageAllowance,
                flightDetails.mealsSeatDescription,
                flightDetails.refundableStatusDescription,
                flightDetails.mealsIncluded ? 1 : 0,
                flightDetails.pricePerAdult,
                req.params.id
            ]
        );

        // Delete existing filters
        await connection.query('DELETE FROM offline_flight_filters WHERE flight_id = ?', [req.params.id]);
        await connection.query('DELETE FROM offline_flight_price_ranges WHERE flight_id = ?', [req.params.id]);

        // Re-insert filters (same as POST)
        await connection.query(`
            INSERT INTO offline_flight_filters (
                flight_id,
                filter_category,
                filter_type,
                filter_name,
                filter_value,
                filter_price,
                is_selected,
                created_at
            ) VALUES ?`,
            [
                [
                    // Popular Filters
                    [req.params.id, 'popular', 'non_stop', 'Non Stop', 'non_stop', filters.stops[0].price, filters.stops[0].selected ? 1 : 0, new Date()],
                    [req.params.id, 'popular', 'hide_nearby', 'Hide Nearby Airports', 'hide_nearby', '7121', filters.hideNearbyAirports ? 1 : 0, new Date()],
                    [req.params.id, 'popular', 'refundable', 'Refundable Fares', 'refundable', '6848', filters.refundableFares ? 1 : 0, new Date()],
                    [req.params.id, 'popular', 'one_stop', '1 Stop', 'one_stop', filters.stops[1].price, filters.stops[1].selected ? 1 : 0, new Date()],
                    
                    // Departure Airports
                    ...filters.departureAirports.map(airport => [
                        req.params.id, 'departure_airport', 'airport', airport.name, airport.code, airport.price, airport.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Stops
                    ...filters.stops.map(stop => [
                        req.params.id, 'stops', 'stop', stop.type, stop.type.toLowerCase().replace(' ', '_'), stop.price, stop.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Departure Time Ranges
                    ...filters.departureTimeRanges.map((range, index) => [
                        req.params.id, 'departure_time', 'time_range', range.range, `departure_${index}`, null, range.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Arrival Time Ranges
                    ...filters.arrivalTimeRanges.map((range, index) => [
                        req.params.id, 'arrival_time', 'time_range', range.range, `arrival_${index}`, null, range.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Airlines
                    ...filters.airlines.map(airline => [
                        req.params.id, 'airline', 'airline', airline.name, airline.code, airline.price, airline.selected ? 1 : 0, new Date()
                    ]),
                    
                    // Aircraft Sizes
                    ...filters.aircraftSizes.map(size => [
                        req.params.id, 'aircraft_size', 'size', size.size, size.size.toLowerCase().replace(/\s/g, '_'), size.price, size.selected ? 1 : 0, new Date()
                    ])
                ]
            ]
        );

        await connection.query(`
            INSERT INTO offline_flight_price_ranges (
                flight_id,
                min_price,
                max_price,
                created_at
            ) VALUES (?, ?, ?, NOW())`,
            [req.params.id, filters.minPrice, filters.maxPrice]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Offline flight updated successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error updating offline flight:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating offline flight',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

// Delete offline flight
router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Delete related records first
        await connection.query('DELETE FROM offline_flight_filters WHERE flight_id = ?', [req.params.id]);
        await connection.query('DELETE FROM offline_flight_price_ranges WHERE flight_id = ?', [req.params.id]);
        
        // Delete main flight
        const [result] = await connection.query('DELETE FROM offline_flights WHERE id = ?', [req.params.id]);

        await connection.commit();

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Offline flight not found'
            });
        }

        res.json({
            success: true,
            message: 'Offline flight deleted successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error deleting offline flight:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting offline flight',
            error: error.message
        });
    } finally {
        connection.release();
    }
});

module.exports = router;