const express = require("express");
const Pathology = require("../models/Pathology");
const { auth, adminAuth } = require("../middleware/auth");

const router = express.Router();

// Get all pathologies (admin and above only)
router.get("/", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "" } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { place: new RegExp(search, "i") },
        { state: new RegExp(search, "i") },
      ];
    }

    const [pathologies, total] = await Promise.all([
      Pathology.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Pathology.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        pathologies,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error("Get pathologies error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pathologies",
      error: error.message,
    });
  }
});

// Get pathology by ID (admin and above only)
router.get("/:id", adminAuth, async (req, res) => {
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
    console.error("Get pathology error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pathology",
      error: error.message,
    });
  }
});

// Create new pathology (admin and above only)
router.post("/", adminAuth, async (req, res) => {
  try {
    const pathology = new Pathology(req.body);
    await pathology.save();

    res.status(201).json({
      success: true,
      message: "Pathology created successfully",
      data: pathology,
    });
  } catch (error) {
    console.error("Create pathology error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create pathology",
      error: error.message,
    });
  }
});

// Update pathology (admin and above only)
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const pathology = await Pathology.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    res.json({
      success: true,
      message: "Pathology updated successfully",
      data: pathology,
    });
  } catch (error) {
    console.error("Update pathology error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update pathology",
      error: error.message,
    });
  }
});

// Delete pathology (admin and above only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
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
    console.error("Delete pathology error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete pathology",
      error: error.message,
    });
  }
});

module.exports = router;
