const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const Ambulance = require("../models/Ambulance");
const { auth, adminAuth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, "..", "uploads", "ambulances");
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
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

// Get all ambulances (admin and above only)
router.get("/", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "" } = req.query;
    const skip = (page - 1) * limit;

    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { city: new RegExp(search, "i") },
        { location: new RegExp(search, "i") },
        { vehicleNumber: new RegExp(search, "i") },
        { driverName: new RegExp(search, "i") },
      ];
    }

    const [ambulances, total] = await Promise.all([
      Ambulance.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Ambulance.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        ambulances,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error("Get ambulances error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ambulances",
      error: error.message,
    });
  }
});

// Get ambulance by ID (admin and above only)
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id);

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "Ambulance not found",
      });
    }

    res.json({
      success: true,
      data: ambulance,
    });
  } catch (error) {
    console.error("Get ambulance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ambulance",
      error: error.message,
    });
  }
});

// Public get by id (no auth) for details page
router.get("/public/:id", async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id);
    if (!ambulance || !ambulance.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Ambulance not found" });
    }
    res.json({ success: true, data: { ambulance } });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch ambulance" });
  }
});

// Create new ambulance (admin and above only)
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const ambulanceData = { ...req.body };

    // Parse services if it's a string
    if (ambulanceData.services && typeof ambulanceData.services === "string") {
      ambulanceData.services = ambulanceData.services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const ambulance = new Ambulance(ambulanceData);

    if (req.file) {
      ambulance.image = `/uploads/ambulances/${req.file.filename}`;
      ambulance.imageUrl = `/uploads/ambulances/${req.file.filename}`;
    }

    await ambulance.save();

    // Create activity log
    await createActivity({
      type: "ambulance_added",
      message: `Ambulance ${ambulance.name} was added to the network`,
      user: req.user.id,
      targetId: ambulance._id,
      targetModel: "Ambulance",
    });

    res.status(201).json({
      success: true,
      message: "Ambulance created successfully",
      data: ambulance,
    });
  } catch (error) {
    console.error("Create ambulance error:", error);

    // Clean up uploaded file if error occurred
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error("Failed to delete uploaded file:", unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to create ambulance",
      error: error.message,
    });
  }
});

// Update ambulance (admin and above only)
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id);

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "Ambulance not found",
      });
    }

    const ambulanceData = { ...req.body };

    // Parse services if it's a string
    if (ambulanceData.services && typeof ambulanceData.services === "string") {
      ambulanceData.services = ambulanceData.services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Convert numeric fields
    if (ambulanceData.baseRate)
      ambulanceData.baseRate = parseFloat(ambulanceData.baseRate);
    if (ambulanceData.perKmRate)
      ambulanceData.perKmRate = parseFloat(ambulanceData.perKmRate);

    if (req.file) {
      // Delete old image if exists
      if (ambulance.image && ambulance.image.startsWith("/uploads/")) {
        const oldImagePath = path.join(
          __dirname,
          "..",
          ambulance.image.replace("/uploads/", "uploads/")
        );
        try {
          await fs.unlink(oldImagePath);
        } catch (error) {
          console.log(
            "Old image not found or could not be deleted:",
            error.message
          );
        }
      }

      ambulanceData.image = `/uploads/ambulances/${req.file.filename}`;
      ambulanceData.imageUrl = `/uploads/ambulances/${req.file.filename}`;
    }

    Object.assign(ambulance, ambulanceData);
    await ambulance.save();

    // Create activity log
    await createActivity({
      type: "ambulance_updated",
      message: `Ambulance ${ambulance.name} information was updated`,
      user: req.user.id,
      targetId: ambulance._id,
      targetModel: "Ambulance",
    });

    res.json({
      success: true,
      message: "Ambulance updated successfully",
      data: ambulance,
    });
  } catch (error) {
    console.error("Update ambulance error:", error);

    // Clean up uploaded file if error occurred
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error("Failed to delete uploaded file:", unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Failed to update ambulance",
      error: error.message,
    });
  }
});

// Delete ambulance (admin and above only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id);

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "Ambulance not found",
      });
    }

    // Delete image if it exists
    if (ambulance.image && ambulance.image.startsWith("/uploads/")) {
      const imagePath = path.join(
        __dirname,
        "..",
        ambulance.image.replace("/uploads/", "uploads/")
      );
      try {
        await fs.unlink(imagePath);
      } catch (err) {
        console.log("Image file not found or already deleted");
      }
    }

    await ambulance.deleteOne();

    // Create activity log
    await createActivity({
      type: "ambulance_deleted",
      message: `Ambulance ${ambulance.name} was removed from the system`,
      user: req.user.id,
      targetId: ambulance._id,
      targetModel: "Ambulance",
    });

    res.json({
      success: true,
      message: "Ambulance deleted successfully",
    });
  } catch (error) {
    console.error("Delete ambulance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete ambulance",
      error: error.message,
    });
  }
});

// Get ambulances for public search (no auth required)
router.get("/search/public", async (req, res) => {
  try {
    const { place, state, search = "" } = req.query;

    let query = { isActive: true, isAvailable: true };

    if (place) {
      query.place = new RegExp(place, "i");
    }

    if (state) {
      query.state = new RegExp(state, "i");
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { place: new RegExp(search, "i") },
        { state: new RegExp(search, "i") },
      ];
    }

    const ambulances = await Ambulance.find(query)
      .select("name place state baseRate perKmRate is24Hours imageUrl")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: ambulances,
    });
  } catch (error) {
    console.error("Public ambulance search error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search ambulances",
      error: error.message,
    });
  }
});

module.exports = router;
