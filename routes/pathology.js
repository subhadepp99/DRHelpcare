const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const router = express.Router();
const Pathology = require("../models/Pathology");
const { auth } = require("../middleware/auth");

// Configure multer for memory storage (database storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Test route to check if pathology is working
router.get("/test", async (req, res) => {
  try {
    console.log("Testing pathology endpoint...");
    const count = await Pathology.countDocuments();

    // Test if we can create a minimal pathology object
    try {
      const testPathology = new Pathology({
        name: "Test Pathology",
        description: "Test Description",
        category: "Test",
        price: 100,
        address: "Test Address",
        place: "Test City",
        state: "Test State",
        zipCode: "12345",
        phone: "1234567890",
        email: "test@test.com",
      });
      console.log("Test pathology model created successfully");
    } catch (modelError) {
      console.error("Test pathology model creation failed:", modelError);
    }

    res.json({
      success: true,
      message: "Pathology endpoint working",
      totalRecords: count,
    });
  } catch (error) {
    console.error("Pathology test error:", error);
    res.status(500).json({
      success: false,
      message: "Pathology endpoint error",
      error: error.message,
    });
  }
});

// Get test packages - MUST come before /:id route
router.get("/test-packages", async (req, res) => {
  try {
    // Fetch only pathology packages (isPackage: true)
    const packages = await Pathology.find({ isPackage: true, isActive: true })
      .select(
        "name description price discountedPrice category imageUrl licenseNumber email phone address place state homeCollection"
      )
      .limit(20);

    res.json({
      success: true,
      data: {
        testPackages: packages,
      },
    });
  } catch (error) {
    console.error("Error fetching test packages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch test packages",
    });
  }
});

// Get individual tests - MUST come before /:id route
router.get("/tests", async (req, res) => {
  try {
    // Fetch only individual pathology tests (isPackage: false or undefined)
    const tests = await Pathology.find({
      $or: [{ isPackage: false }, { isPackage: { $exists: false } }],
      isActive: true,
    })
      .select(
        "name description price discountedPrice category preparationInstructions reportTime homeCollection licenseNumber email phone address place state"
      )
      .limit(50);

    res.json({
      success: true,
      data: {
        tests: tests,
      },
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tests",
    });
  }
});

// Get all pathologies for admin panel - MUST come before /:id route
router.get("/", async (req, res) => {
  try {
    const pathologies = await Pathology.find()
      .select(
        [
          "name",
          "licenseNumber",
          "email",
          "phone",
          "address",
          "place",
          "state",
          "zipCode",
          "country",
          // core fields needed by admin list and edit modal
          "price",
          "sampleType",
          "category",
          "description",
          "turnaroundTime",
          "preparation",
          "components",
          // legacy/admin fields
          "servicesOffered",
          "testsOffered",
          "is24Hours",
          "imageUrl",
          "homeCollection",
        ].join(" ")
      )
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        pathologies: pathologies,
      },
    });
  } catch (error) {
    console.error("Error fetching pathologies:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pathologies",
    });
  }
});

// Search pathologies by name and location - MUST come before /:id route
router.get("/search", async (req, res) => {
  try {
    const { name = "", location = "" } = req.query;

    console.log("Pathology search request:", { name, location });

    const query = {};

    // Add name filter - search in name field
    if (name) {
      // Handle both exact matches and partial matches
      query.$or = [
        { name: new RegExp(name, "i") },
        { name: new RegExp(name.replace(/-/g, " "), "i") }, // Handle URL-encoded names
        { name: new RegExp(name.replace(/-/g, ""), "i") }, // Handle names without spaces
      ];
    }

    // Add location filter - check multiple location fields
    if (location && location !== "unknown") {
      query.$or = [
        { place: new RegExp(location, "i") },
        { state: new RegExp(location, "i") },
        { address: new RegExp(location, "i") }, // address is a string field
      ];
    }

    console.log("Pathology search query:", JSON.stringify(query, null, 2));

    // First, let's see what pathologies exist in the database
    const allPathologies = await Pathology.find().select(
      "name place state address"
    );
    console.log("All pathologies in database:", allPathologies);

    const pathologies = await Pathology.find(query)
      .select(
        "_id name description price discountedPrice category imageUrl homeCollection address place state contact rating services facilities"
      )
      .limit(20);

    console.log(`Found ${pathologies.length} pathologies matching the search`);
    console.log(
      "Matching pathologies:",
      pathologies.map((p) => ({
        id: p._id,
        name: p.name,
        place: p.place,
        state: p.state,
        address: p.address,
        category: p.category,
        price: p.price,
        discountedPrice: p.discountedPrice,
      }))
    );

    res.json({
      success: true,
      data: {
        pathologies,
        total: pathologies.length,
      },
    });
  } catch (error) {
    console.error("Search pathologies error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search pathologies",
      error: error.message,
    });
  }
});

// Get pathology by ID - MUST come before /:id route
router.get("/by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Get pathology by ID request:", { id });

    const pathology = await Pathology.findById(id).select("-__v");

    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    console.log("Found pathology:", {
      id: pathology._id,
      name: pathology.name,
    });

    res.json({
      success: true,
      data: {
        pathology,
      },
    });
  } catch (error) {
    console.error("Get pathology by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get pathology",
      error: error.message,
    });
  }
});

// Create new pathology (admin only)
router.post("/", auth, upload.single("image"), async (req, res) => {
  try {
    console.log("Auth check - User:", req.user);
    console.log("Auth check - User role:", req.user?.role);

    if (req.user.role !== "admin" && req.user.role !== "superuser") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const pathologyData = { ...req.body };

    // Normalize optional unique-like fields so null doesn't collide
    if (
      pathologyData.email == null ||
      String(pathologyData.email).trim() === ""
    ) {
      delete pathologyData.email;
    }
    if (
      pathologyData.phone == null ||
      String(pathologyData.phone).trim() === ""
    ) {
      delete pathologyData.phone;
    }

    console.log(
      "Received pathology data:",
      JSON.stringify(pathologyData, null, 2)
    );
    console.log("User role:", req.user.role);

    // Parse JSON fields
    if (
      pathologyData.components &&
      typeof pathologyData.components === "string"
    ) {
      try {
        pathologyData.components = JSON.parse(pathologyData.components);
      } catch (e) {
        pathologyData.components = [];
      }
    }
    // Reconstruct homeCollection from FormData if sent as flat fields
    const hasHc =
      req.body["homeCollection[available]"] !== undefined ||
      req.body["homeCollection[fee]"] !== undefined ||
      req.body["homeCollection[areas]"] !== undefined ||
      req.body["homeCollection[timing][start]"] !== undefined ||
      req.body["homeCollection[timing][end]"] !== undefined;

    if (hasHc) {
      const availableRaw = req.body["homeCollection[available]"];
      const feeRaw = req.body["homeCollection[fee]"];
      const areasRaw = req.body["homeCollection[areas]"];
      const startRaw = req.body["homeCollection[timing][start]"];
      const endRaw = req.body["homeCollection[timing][end]"];

      pathologyData.homeCollection = {
        available:
          availableRaw === true ||
          availableRaw === "true" ||
          availableRaw === 1 ||
          availableRaw === "1",
        fee: Number(feeRaw) || 0,
        areas: Array.isArray(areasRaw)
          ? areasRaw.filter((a) => a && String(a).trim())
          : areasRaw
          ? [String(areasRaw).trim()].filter((a) => a)
          : [],
        timing: {
          start: startRaw ? String(startRaw) : "",
          end: endRaw ? String(endRaw) : "",
        },
      };
    }

    // If sent as a JSON string instead, parse it safely
    if (
      typeof pathologyData.homeCollection === "string" &&
      pathologyData.homeCollection.trim().startsWith("{")
    ) {
      try {
        const parsed = JSON.parse(pathologyData.homeCollection);
        pathologyData.homeCollection = {
          available: !!parsed.available,
          fee: Number(parsed.fee) || 0,
          areas: Array.isArray(parsed.areas) ? parsed.areas : [],
          timing: {
            start: parsed.timing?.start || "",
            end: parsed.timing?.end || "",
          },
        };
      } catch (e) {
        pathologyData.homeCollection = {
          available: false,
          fee: 0,
          areas: [],
          timing: { start: "", end: "" },
        };
      }
    }
    // Set defaults for optional fields
    if (!pathologyData.turnaroundTime)
      pathologyData.turnaroundTime = "24 hours";
    if (!pathologyData.preparation) pathologyData.preparation = "";
    if (!pathologyData.isPackage) pathologyData.isPackage = false;
    if (!pathologyData.isActive) pathologyData.isActive = true;
    if (!pathologyData.components) pathologyData.components = [];
    // Validate required fields
    const requiredFields = [
      "name",
      "category",
      "price",
      "sampleType",
      "address",
      "place",
      "state",
      "zipCode",
    ];
    const missingFields = requiredFields.filter(
      (field) =>
        !pathologyData[field] || pathologyData[field].toString().trim() === ""
    );
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Provide sensible defaults for missing optional/required-like fields
    if (
      !pathologyData.sampleType ||
      String(pathologyData.sampleType).trim() === ""
    ) {
      pathologyData.sampleType = "Blood";
    }

    // If homeCollection is effectively empty, drop it to avoid schema cast issues on older deployments
    if (pathologyData.homeCollection) {
      const hc = pathologyData.homeCollection;
      const isEmptyAreas =
        !hc.areas || (Array.isArray(hc.areas) && hc.areas.length === 0);
      const start = hc.timing?.start || "";
      const end = hc.timing?.end || "";
      const isEmptyTiming = !start && !end;
      if (
        (hc.available === false || hc.available === "false") &&
        (Number(hc.fee) || 0) === 0 &&
        isEmptyAreas &&
        isEmptyTiming
      ) {
        delete pathologyData.homeCollection;
      }
    }

    console.log(
      "Final pathology data before save:",
      JSON.stringify(pathologyData, null, 2)
    );

    let createdPathology;
    try {
      const pathology = new Pathology(pathologyData);
      console.log("Pathology model created successfully");

      await pathology.save();
      console.log("Pathology saved successfully");
      createdPathology = pathology;
    } catch (saveError) {
      console.error("Save error details:", {
        name: saveError.name,
        message: saveError.message,
        errors: saveError.errors,
      });
      throw saveError;
    }

    res.status(201).json({
      success: true,
      data: createdPathology,
    });
  } catch (error) {
    console.error("Error creating pathology:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    });

    // Provide more specific error messages
    let errorMessage = "Failed to create pathology";
    if (error.name === "ValidationError") {
      errorMessage =
        "Validation error: " +
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", ");
    } else if (error.code === 11000) {
      errorMessage = "Duplicate key error - this value already exists";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Get pathology by ID - MUST come after specific routes
router.get("/:id", async (req, res) => {
  try {
    const pathology = await Pathology.findById(req.params.id);
    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    res.json({
      success: true,
      data: pathology,
    });
  } catch (error) {
    console.error("Error fetching pathology:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pathology",
    });
  }
});

// Update pathology (admin only)
router.put("/:id", auth, upload.single("image"), async (req, res) => {
  try {
    console.log("Auth check - User:", req.user);
    console.log("Auth check - User role:", req.user?.role);

    if (req.user.role !== "admin" && req.user.role !== "superuser") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const updates = { ...req.body };

    // Normalize optional unique-like fields so null doesn't collide on update
    if (updates.email != null && String(updates.email).trim() === "") {
      updates.email = undefined;
    }
    if (updates.phone != null && String(updates.phone).trim() === "") {
      updates.phone = undefined;
    }

    console.log("Received update data:", JSON.stringify(updates, null, 2));
    console.log("User role:", req.user.role);

    // Parse JSON-ish fields possibly sent via multipart/form-data
    if (updates.components && typeof updates.components === "string") {
      try {
        updates.components = JSON.parse(updates.components);
      } catch (e) {
        // Accept empty array string or invalid JSON gracefully
        updates.components = [];
      }
    }
    if (
      updates.servicesOffered &&
      typeof updates.servicesOffered === "string"
    ) {
      try {
        updates.servicesOffered = JSON.parse(updates.servicesOffered);
      } catch (e) {
        updates.servicesOffered = [];
      }
    }
    if (updates.testsOffered && typeof updates.testsOffered === "string") {
      try {
        updates.testsOffered = JSON.parse(updates.testsOffered);
      } catch (e) {
        updates.testsOffered = [];
      }
    }

    // Support bracketed homeCollection fields from FormData
    const hasHcUpdate =
      req.body["homeCollection[available]"] !== undefined ||
      req.body["homeCollection[fee]"] !== undefined ||
      req.body["homeCollection[areas]"] !== undefined ||
      req.body["homeCollection[timing][start]"] !== undefined ||
      req.body["homeCollection[timing][end]"] !== undefined;

    if (hasHcUpdate) {
      const availableRaw = req.body["homeCollection[available]"];
      const feeRaw = req.body["homeCollection[fee]"];
      const areasRaw = req.body["homeCollection[areas]"];
      const startRaw = req.body["homeCollection[timing][start]"];
      const endRaw = req.body["homeCollection[timing][end]"];

      updates.homeCollection = {
        available:
          availableRaw === true ||
          availableRaw === "true" ||
          availableRaw === 1 ||
          availableRaw === "1",
        fee: Number(feeRaw) || 0,
        areas: Array.isArray(areasRaw)
          ? areasRaw.filter((a) => a && String(a).trim())
          : areasRaw
          ? [String(areasRaw).trim()].filter((a) => a)
          : [],
        timing: {
          start: startRaw ? String(startRaw) : "",
          end: endRaw ? String(endRaw) : "",
        },
      };
    } else if (
      updates.homeCollection &&
      typeof updates.homeCollection === "string"
    ) {
      // Or if homeCollection came as a JSON string
      try {
        const parsed = JSON.parse(updates.homeCollection);
        updates.homeCollection = {
          available: !!parsed.available,
          fee: Number(parsed.fee) || 0,
          areas: Array.isArray(parsed.areas) ? parsed.areas : [],
          timing: {
            start: parsed.timing?.start || "",
            end: parsed.timing?.end || "",
          },
        };
      } catch (e) {
        updates.homeCollection = {
          available: false,
          fee: 0,
          areas: [],
          timing: { start: "", end: "" },
        };
      }
    }

    // Coerce primitive types where needed
    if (updates.price != null) {
      const n = Number(updates.price);
      updates.price = isNaN(n) ? 0 : n;
    }
    if (updates.isPackage != null) {
      updates.isPackage =
        updates.isPackage === true || updates.isPackage === "true";
    }
    if (updates.isActive != null) {
      updates.isActive =
        updates.isActive === true || updates.isActive === "true";
    }

    const pathology = await Pathology.findById(req.params.id);
    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    // Handle image update
    if (req.file) {
      // Store new image directly in database
      updates.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      // Keep imageUrl for backward compatibility
      updates.imageUrl = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;
    }

    // Ensure required fields have valid values
    if (
      updates.price !== undefined &&
      (isNaN(updates.price) || updates.price < 0)
    ) {
      updates.price = 0; // Default price
    }

    // If homeCollection is effectively empty, drop it to avoid cast issues
    if (updates.homeCollection) {
      const hc = updates.homeCollection;
      const isEmptyAreas =
        !hc.areas || (Array.isArray(hc.areas) && hc.areas.length === 0);
      const start = hc.timing?.start || "";
      const end = hc.timing?.end || "";
      const isEmptyTiming = !start && !end;
      if (
        (hc.available === false || hc.available === "false") &&
        (Number(hc.fee) || 0) === 0 &&
        isEmptyAreas &&
        isEmptyTiming
      ) {
        delete updates.homeCollection;
      }
    }

    console.log("Final update data:", JSON.stringify(updates, null, 2));

    const updatedPathology = await Pathology.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedPathology,
    });
  } catch (error) {
    console.error("Error updating pathology:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    });

    // Provide more specific error messages
    let errorMessage = "Failed to update pathology";
    if (error.name === "ValidationError") {
      errorMessage =
        "Validation error: " +
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", ");
    } else if (error.code === 11000) {
      errorMessage = "Duplicate key error - this value already exists";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Delete pathology (admin only)
router.delete("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superuser") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const pathology = await Pathology.findByIdAndDelete(req.params.id);
    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    res.json({
      success: true,
      message: "Pathology deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting pathology:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete pathology",
    });
  }
});

// Get pathology image from database
router.get("/:id/image", async (req, res) => {
  try {
    const pathology = await Pathology.findById(req.params.id);

    if (!pathology || !pathology.image || !pathology.image.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", pathology.image.contentType);
    res.send(pathology.image.data);
  } catch (error) {
    console.error("Get pathology image error:", error);
    res.status(500).json({ message: "Error fetching image" });
  }
});

module.exports = router;
