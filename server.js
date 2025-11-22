// server.js
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

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
// Add others as needed

app.get('/', (req, res) => res.json({ message: "Kesari Tours API - Full CRUD Ready!" }));

const PORT = 5000;
app.listen(PORT, () => console.log(`API Running on http://localhost:${PORT}`));