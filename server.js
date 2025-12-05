// server.js
const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');


app.use(cors());
app.use(express.json());

const cruiseRoutes = require("./routes/CrusieBookingRoute/CruiseBooking");
const cruiseAdvancedRoutes = require("./routes/CruiseBookingAdvancedRoute/CruiseBookingAdvanced")
const visaRoutes = require("./routes/VisaRoute/VisaBooking"); // Add this line

const tourTransportsRouter = require('./routes/tourTransports');
const tourBookingPoiRouter = require('./routes/tourBookingPoi');
const tourCancellationRouter = require('./routes/tourCancellation');
const tourInstructionsRouter = require('./routes/tourInstructions');
const tourCostsRouter = require('./routes/tourCosts');
const tourHotelsRouter = require('./routes/tourHotels');


app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));





// === INCLUDE ALL CRUD ROUTES ===
app.use('/api/tours', require('./routes/tours'));
app.use('/api/categories', require('./routes/tourCategories'));
app.use('/api/departures', require('./routes/tourDepartures'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/inquiries', require('./routes/inquiries'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/promotions', require('./routes/promotions'));
app.use('/api/countries', require('./routes/countries'));
app.use('/api/destinations', require('./routes/destinations'));
app.use('/api/itineraries', require('./routes/tourItineraries'));
app.use('/api/inclusions', require('./routes/tourInclusions'));
app.use('/api/exclusions', require('./routes/tourExclusions'));
app.use('/api/images', require('./routes/tourImages'));

app.use('/api/tour-transports', tourTransportsRouter);
app.use('/api/tour-booking-poi', tourBookingPoiRouter);
app.use('/api/tour-cancellation', tourCancellationRouter);
app.use('/api/tour-instructions', tourInstructionsRouter);
app.use('/api/tour-costs', tourCostsRouter);
app.use('/api/tour-hotels', tourHotelsRouter);

app.use("/api", cruiseRoutes);
app.use("/api", cruiseAdvancedRoutes);
app.use("/api", visaRoutes); 
// Add others as needed

app.get('/', (req, res) => res.json({ message: "Kesari Tours API - Full CRUD Ready!" }));

const PORT = 5000;
app.listen(PORT, () => console.log(`API Running on http://localhost:${PORT}`));