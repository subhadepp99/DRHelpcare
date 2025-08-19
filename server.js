const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const connectDB = require("./config/database");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("combined"));

// Define allowed origins
const allowedOrigins = [
  "http://localhost:3000", // local dev
  "https://yourfrontenddomain.com", // production
  // Add any other frontend URLs here
];

// Apply CORS middleware globally with options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg =
        "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle OPTIONS for all routes with the same options
app.options("*", cors(corsOptions));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/doctors", require("./routes/doctors"));
app.use("/api/clinics", require("./routes/clinics"));
app.use("/api/pharmacies", require("./routes/pharmacies"));
app.use("/api/patients", require("./routes/patients"));
// app.use("/api/search", require("./routes/search"));
// app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/pathologies", require("./routes/pathologies"));
app.use("/api/search", require("./routes/search"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/department", require("./routes/department")); // Corrected path from 'departments'

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ message: "Healthcare API is running!", status: "OK" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); // Export the app for testing or further configuration
