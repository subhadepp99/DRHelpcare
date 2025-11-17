const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const connectDB = require("./config/database");
const path = require("path"); // Added for path.join
const mongoose = require("mongoose");

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Drop obsolete indexes once DB is connected (idempotent)
mongoose.connection.once("open", async () => {
  try {
    // Fix pathologies email index
    const pathologiesCollection = mongoose.connection.collection("pathologies");
    const pathologyIndexes = await pathologiesCollection.indexes();
    // Drop obsolete index
    const hasLicenseIdx = pathologyIndexes.some((i) => i.name === "licenseNumber_1");
    if (hasLicenseIdx) {
      await pathologiesCollection.dropIndex("licenseNumber_1");
      console.log("Dropped obsolete index licenseNumber_1 on pathologies");
    }
    // Ensure email index is partial unique (only enforce when email is a string)
    const pathologyEmailIdx = pathologyIndexes.find((i) => i.name === "email_1");
    if (pathologyEmailIdx) {
      // Drop and recreate as partial unique to avoid dup null errors
      await pathologiesCollection.dropIndex("email_1");
      console.log("Dropped existing email_1 index on pathologies");
    }
    await pathologiesCollection.createIndex(
      { email: 1 },
      {
        name: "email_1",
        unique: true,
        partialFilterExpression: { email: { $type: "string" } },
      }
    );
    console.log("Created partial unique index email_1 on pathologies");

    // Fix users email index - make it sparse to allow multiple nulls
    const usersCollection = mongoose.connection.collection("users");
    const userIndexes = await usersCollection.indexes();
    const userEmailIdx = userIndexes.find((i) => i.name === "email_1");
    
    // Check if index exists and is not sparse
    if (userEmailIdx && (!userEmailIdx.sparse && !userEmailIdx.partialFilterExpression)) {
      try {
        await usersCollection.dropIndex("email_1");
        console.log("Dropped existing non-sparse email_1 index on users");
      } catch (dropError) {
        console.warn("Could not drop email_1 index:", dropError.message);
      }
    }
    
    // Create sparse unique index (allows multiple nulls)
    try {
      await usersCollection.createIndex(
        { email: 1 },
        {
          name: "email_1",
          unique: true,
          sparse: true, // This allows multiple documents with null/undefined email
        }
      );
      console.log("Created sparse unique index email_1 on users");
    } catch (createError) {
      // Index might already exist as sparse, that's okay
      if (!createError.message.includes("already exists")) {
        console.warn("Could not create email_1 index:", createError.message);
      }
    }

    // Clean up existing users with email: null by removing the email field
    try {
      const result = await usersCollection.updateMany(
        { email: null },
        { $unset: { email: "" } }
      );
      if (result.modifiedCount > 0) {
        console.log(`Cleaned up ${result.modifiedCount} users with null email`);
      }
    } catch (cleanupError) {
      console.warn("Could not clean up null emails:", cleanupError.message);
    }
  } catch (e) {
    console.warn("Index cleanup skipped:", e.message);
  }
});

const app = express();

// Middleware
// Allow primitive JSON values (e.g., "null") to avoid body-parser strict errors for DELETE
app.use(express.json({ limit: "10mb", strict: false }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("combined"));

// Serve static files for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Define allowed origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://drhelp.in",
  "http://drhelp.in",
  "http://213.210.37.151:3000",
  "https://213.210.37.151:3000",
];

// Apply a single CORS middleware with consistent config
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman/curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Skip-Unauth-Redirect"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/patients", require("./routes/patients"));
app.use("/api/doctors", require("./routes/doctors"));
app.use("/api/clinics", require("./routes/clinics"));
app.use("/api/pharmacies", require("./routes/pharmacies"));
app.use("/api/pathology", require("./routes/pathology"));
app.use("/api/pathologies", require("./routes/pathology")); // Admin panel uses plural
app.use("/api/tests", require("./routes/tests"));
app.use("/api/departments", require("./routes/department"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/ambulances", require("./routes/ambulances"));
app.use("/api/banners", require("./routes/banners"));
app.use("/api/faqs", require("./routes/faqs"));
app.use("/api/access-requests", require("./routes/accessRequests"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/search", require("./routes/search"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/blogs", require("./routes/blogs"));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ message: "Healthcare API is running!", status: "OK" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  // Ensure CORS headers are present even on errors
  const origin = req.headers?.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); // Export the app for testing or further configuration
