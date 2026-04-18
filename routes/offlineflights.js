const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Helper function to format date to YYYY-MM-DD without timezone conversion
const formatDateForDB = (dateString) => {
  if (!dateString) return null;
  // If it's already in YYYY-MM-DD format, return as is
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateString;
  }
  // If it's a Date object or ISO string, extract YYYY-MM-DD in local time
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return dateString;
};

// Helper function to format MySQL DATE to YYYY-MM-DD without timezone conversion
const formatDateFromDB = (date) => {
  if (!date) return null;
  // If it's a Date object, convert to YYYY-MM-DD in local time
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  // If it's already a string in YYYY-MM-DD format
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return date;
  }
  return date;
};

// Calculate total amount helper
const calculateTotalAmount = (adults, pricePerAdult, children, pricePerChild) => {
  const adultTotal = (adults || 0) * (parseFloat(pricePerAdult) || 0);
  const childTotal = (children || 0) * (parseFloat(pricePerChild) || 0);
  return adultTotal + childTotal;
};

// Get all offline flights
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM offline_flights 
            ORDER BY created_at DESC
        `);
        
        // Format dates without timezone conversion
        const formattedRows = rows.map(row => ({
            ...row,
            departure_date: formatDateFromDB(row.departure_date),
            return_date: formatDateFromDB(row.return_date)
        }));
        
        res.json({
            success: true,
            data: formattedRows
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
        
        const row = rows[0];
        // Format dates without timezone conversion
        const formattedRow = {
            ...row,
            departure_date: formatDateFromDB(row.departure_date),
            return_date: formatDateFromDB(row.return_date)
        };

        res.json({
            success: true,
            data: formattedRow
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
            flightDetails
        } = req.body;

        // Calculate total amount
        const totalAmount = calculateTotalAmount(
            flightDetails.adults,
            flightDetails.pricePerAdult,
            flightDetails.children,
            flightDetails.pricePerChild
        );

        // Insert main flight details with properly formatted dates
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
                price_per_child,
                total_amount,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                bookingType,
                flightDetails.fromCity,
                flightDetails.fromAirport,
                flightDetails.fromAirportCode,
                flightDetails.toCity,
                flightDetails.toAirport,
                flightDetails.toAirportCode,
                formatDateForDB(flightDetails.departureDate),
                formatDateForDB(flightDetails.returnDate),
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
                flightDetails.pricePerChild || null,
                totalAmount
            ]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Offline flight created successfully',
            data: { id: flightResult.insertId }
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
            flightDetails
        } = req.body;

        // Calculate total amount
        const totalAmount = calculateTotalAmount(
            flightDetails.adults,
            flightDetails.pricePerAdult,
            flightDetails.children,
            flightDetails.pricePerChild
        );

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
                price_per_child = ?,
                total_amount = ?,
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
                formatDateForDB(flightDetails.departureDate),
                formatDateForDB(flightDetails.returnDate),
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
                flightDetails.pricePerChild || null,
                totalAmount,
                req.params.id
            ]
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
    try {
        const [result] = await db.query('DELETE FROM offline_flights WHERE id = ?', [req.params.id]);

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
        console.error('Error deleting offline flight:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting offline flight',
            error: error.message
        });
    }
});

module.exports = router;