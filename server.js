// // server.js
// const express = require('express');
// const cors = require('cors');
// const app = express();
// const path = require('path');


// app.use(cors());
// app.use(express.json());

// const cruiseRoutes = require("./routes/CrusieBookingRoute/CruiseBooking");
// const cruiseAdvancedRoutes = require("./routes/CruiseBookingAdvancedRoute/CruiseBookingAdvanced")
// const visaRoutes = require("./routes/VisaRoute/VisaBooking"); // Add this line

// const tourTransportsRouter = require('./routes/tourTransports');
// const tourBookingPoiRouter = require('./routes/tourBookingPoi');
// const tourCancellationRouter = require('./routes/tourCancellation');
// const tourInstructionsRouter = require('./routes/tourInstructions');
// const tourCostsRouter = require('./routes/tourCosts');
// const tourHotelsRouter = require('./routes/tourHotels');

// // Import the new routes
// const optionalToursRouter = require('./routes/optionaltours');
// const emiOptionsRouter = require('./routes/emioptions');



// app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));





// // === INCLUDE ALL CRUD ROUTES ===
// app.use('/api/tours', require('./routes/tours'));
// app.use('/api/categories', require('./routes/tourCategories'));
// app.use('/api/departures', require('./routes/tourDepartures'));
// app.use('/api/bookings', require('./routes/bookings'));
// app.use('/api/customers', require('./routes/customers'));
// app.use('/api/inquiries', require('./routes/inquiries'));
// app.use('/api/reviews', require('./routes/reviews'));
// app.use('/api/promotions', require('./routes/promotions'));
// app.use('/api/countries', require('./routes/countries'));
// app.use('/api/destinations', require('./routes/destinations'));
// app.use('/api/itineraries', require('./routes/tourItineraries'));
// app.use('/api/inclusions', require('./routes/tourInclusions'));
// app.use('/api/exclusions', require('./routes/tourExclusions'));
// app.use('/api/images', require('./routes/tourImages'));

// app.use('/api/tour-transports', tourTransportsRouter);
// app.use('/api/tour-booking-poi', tourBookingPoiRouter);
// app.use('/api/tour-cancellation', tourCancellationRouter);
// app.use('/api/tour-instructions', tourInstructionsRouter);
// app.use('/api/tour-costs', tourCostsRouter);
// app.use('/api/optional-tours', optionalToursRouter);
// app.use('/api/emi-options', emiOptionsRouter);

// app.use('/api/tour-hotels', tourHotelsRouter);

// app.use("/api", cruiseRoutes);
// app.use("/api", cruiseAdvancedRoutes);
// app.use("/api", visaRoutes); 
// // Add others as needed

// app.get('/', (req, res) => res.json({ message: "Kesari Tours API - Full CRUD Ready!" }));

// const PORT = 5000;
// app.listen(PORT, () => console.log(`API Running on http://localhost:${PORT}`));






const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path');
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });



// === VIDEO CAROUSEL SETUP ===
const videoRoutes = require('./routes/videoRoutes');
// === EXISTING ROUTES ===
const cruiseRoutes = require("./routes/CrusieBookingRoute/CruiseBooking");
const cruiseAdvancedRoutes = require("./routes/CruiseBookingAdvancedRoute/CruiseBookingAdvanced");
const visaRoutes = require("./routes/VisaRoute/VisaBooking");

const tourTransportsRouter = require('./routes/tourTransports');
const tourBookingPoiRouter = require('./routes/tourBookingPoi');
const tourCancellationRouter = require('./routes/tourCancellation');
const tourInstructionsRouter = require('./routes/tourInstructions');
const tourCostsRouter = require('./routes/tourCosts');
const tourHotelsRouter = require('./routes/tourHotels');

const optionalToursRouter = require('./routes/optionaltours');
const emiOptionsRouter = require('./routes/emioptions');
const leadsRoutes = require('./routes/leads');
const contactRoutes = require('./routes/contactroutes');
const phoneRoutes = require("./routes/phonepe")
// const editTour = require('./routes/edittours');
const tourVisaRouter = require('./routes/visa');
const emailRoutes = require('./routes/Email/Email');

// Add this with your other route imports
const checkoutRoutes = require('./routes/checkout');

// server.js or app.js
const paymentRoutes = require('./routes/payments');

const enquiryRoutes = require('./routes/tourEnquiry');

const Vendors = require('./routes/Vendors/Vendors')
// Add this with other route imports
const carouselImagesRoutes = require('./routes/carouselimages');

// In your main server.js or app.js file
const exhibitionRoutes = require('./routes/ExhibitionRoutes/exhibitionroutes');

// Import routes
const offlineFlightsRoutes = require('./routes/offlineflights');
const onlineFlightsRoutes = require('./routes/onlineflights');

const offlineHotelsRoutes = require('./routes/offlinehotels');

const miceRoutes = require('./routes/miceroutes');

const flightspaymentRoutes = require('./routes/flightspayments_v1');
const bungalowRoutes = require('./routes/bunglow');



// Update the static middleware to serve carousel images
app.use('/uploads/carousel', express.static(path.join(__dirname, 'uploads/carousel')));
// Add this with your other static middleware - MICE uploads
app.use('/uploads/mice', express.static(path.join(__dirname, 'uploads/mice')));


// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
const videosDir = path.join(uploadsDir, 'videos');
const domesticToursRoutes = require('./routes/domesticTours');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(videosDir)) {
  fs.mkdirSync(videosDir, { recursive: true });
}

console.log('Upload directories created at:', uploadsDir);

// ✅ Exhibition images (FIRST)
app.use(
  '/uploads/exhibition',
  express.static(path.join(__dirname, 'uploads/exhibition'))
);


// ✅ Existing uploads (SECOND)
// app.use(
//   '/uploads',
//   express.static(path.join(__dirname, 'public/uploads'))
// );


// Serve bungalow uploads
app.use('/uploads/bungalows', express.static(path.join(__dirname, 'uploads/bungalows')));


// Add this with your other static middleware
app.use('/uploads/hotels', express.static(path.join(__dirname, 'uploads/hotels')));

// ✅ Existing uploads (SECOND)
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'public/uploads'))
);

// Serve uploaded videos statically
app.use('/video-uploads', express.static(uploadsDir));
app.use('/video-uploads/videos', express.static(videosDir));
app.use('/api/leads', leadsRoutes);


app.use('/api/carousel-images', carouselImagesRoutes);

// === VIDEO CAROUSEL ROUTE ===
app.use('/api/videos', videoRoutes);

// === ALL EXISTING CRUD ROUTES ===
app.use('/api/tours', require('./routes/tours'));
// app.use('/api/edittours', require('./routes/edittours'));
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
app.use('/api/optional-tours', optionalToursRouter);
app.use('/api/emi-options', emiOptionsRouter);
app.use('/api/tour-hotels', tourHotelsRouter);

app.use("/api", cruiseRoutes);
app.use("/api", cruiseAdvancedRoutes);
app.use("/api", visaRoutes);
app.use('/api/domestic-tours', domesticToursRoutes);
app.use('/api/visa', tourVisaRouter);
app.use('/api', emailRoutes);

app.use('/api/contact', contactRoutes);
app.use('/api', phoneRoutes);
app.use("/api", enquiryRoutes);
// Add this with your other routes
app.use('/api', paymentRoutes);

// Add this with your other route uses
app.use('/api', checkoutRoutes);
app.use('/api', Vendors);
app.use('/api/exhibitions', exhibitionRoutes);

// Routes
app.use('/api/offline-flights', offlineFlightsRoutes);
app.use('/api/online-flights', onlineFlightsRoutes);

app.use('/api', flightspaymentRoutes);

// Add this with your other routes
app.use('/api/bungalows', bungalowRoutes);

app.use('/api/offline-hotels', offlineHotelsRoutes);



app.use('/api/mice', miceRoutes);



// Simple test route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: "API is working!",
    timestamp: new Date().toISOString(),
    endpoints: {
      video_carousel: {
        test: "/api/videos/test",
        all_videos: "/api/videos",
        admin_videos: "/api/videos/admin",
        health_check: "/api/videos/health/check"
      }
    }
  });
});

// Root route
app.get('/', (req, res) => res.json({ 
  message: "Kesari Tours API - Full CRUD Ready!",
  video_carousel: {
    test: "/api/videos/test",
    health_check: "/api/videos/health/check"
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  console.error('Stack:', err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || 'Something went wrong!',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 API Server is running!`);
  console.log(`📁 URL: http://localhost:${PORT}`);
  console.log(`📂 Video uploads: ${videosDir}`);
  console.log(`🔗 Test endpoints:`);
  console.log(`   - http://localhost:${PORT}/api/test`);
  console.log(`   - http://localhost:${PORT}/api/videos/test`);
  console.log(`   - http://localhost:${PORT}/api/videos/health/check`);
  console.log(`=========================================`);
});