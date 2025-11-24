const express = require("express");
const cors = require("cors");
const app = express();

// Import routes
const cruiseRoutes = require("./routes/CrusieBookingRoute/CruiseBooking");
const cruiseAdvancedRoutes = require("./routes/CruiseBookingAdvancedRoute/CruiseBookingAdvanced")
const visaRoutes = require("./routes/VisaRoute/VisaBooking"); // Add this line

app.use(cors());
app.use(express.json());

// Use cruise routes
app.use("/api", cruiseRoutes);
app.use("/api", cruiseAdvancedRoutes);
app.use("/api", visaRoutes); 

app.get("/", (req, res) => {
  res.send("Backend Running...");
});

app.listen(5000, () => console.log("Server running on port 5000"));