const express = require("express");
const multer = require("multer");
const Ambulance = require("../models/Ambulance");
const { auth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Configure multer for image uploads in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Get all ambulances (admin and above only)
router.get("/", auth, async (req, res) => {
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
router.get("/:id", auth, async (req, res) => {
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
router.post("/", auth, upload.single("image"), async (req, res) => {
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

    if (req.file && req.file.buffer) {
      ambulance.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      ambulance.imageUrl = undefined;
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

    res.status(500).json({
      success: false,
      message: "Failed to create ambulance",
      error: error.message,
    });
  }
});

// Update ambulance (admin and above only)
router.put("/:id", auth, upload.single("image"), async (req, res) => {
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

    if (req.file && req.file.buffer) {
      ambulanceData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      ambulanceData.imageUrl = undefined;
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

    res.status(500).json({
      success: false,
      message: "Failed to update ambulance",
      error: error.message,
    });
  }
});

// Delete ambulance (admin and above only)
router.delete("/:id", auth, async (req, res) => {
  try {
    const ambulance = await Ambulance.findById(req.params.id);

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "Ambulance not found",
      });
    }

    // No filesystem cleanup needed; images stored in DB

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
      .select(
        "name place state baseRate perKmRate is24Hours image contentType imageUrl"
      )
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
