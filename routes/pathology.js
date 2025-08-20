const express = require("express");
const router = express.Router();
const Pathology = require("../models/Pathology");
const { auth } = require("../middleware/auth");

// Test route to check if pathology is working
router.get("/test", async (req, res) => {
  try {
    console.log("Testing pathology endpoint...");
    const count = await Pathology.countDocuments();
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
    console.log("Fetching test packages...");

    // First, let's check if there are any pathology records at all
    const totalCount = await Pathology.countDocuments();
    console.log("Total pathology records:", totalCount);

    // Since existing data might not have isPackage field, let's get all records
    // and filter by category or name patterns that suggest packages
    const allPathologies = await Pathology.find()
      .select(
        "name description price discountedPrice category imageUrl licenseNumber email phone address place state"
      )
      .limit(20);

    console.log("All pathologies found:", allPathologies.length);

    // For now, return all pathologies as packages to ensure data is displayed
    // This can be refined later when we have better data structure
    const packages = allPathologies;

    console.log("Filtered packages:", packages.length);
    console.log("Packages:", packages);

    res.json({
      success: true,
      data: {
        testPackages: packages.slice(0, 10), // Limit to 10
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
    // For now, get all pathologies as tests since existing data might not have isPackage field
    const tests = await Pathology.find()
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
        "name licenseNumber email phone address place state zipCode country servicesOffered testsOffered is24Hours imageUrl homeCollection"
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

// Create new pathology (admin only)
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superuser") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const pathologyData = req.body;
    const pathology = new Pathology(pathologyData);
    await pathology.save();

    res.status(201).json({
      success: true,
      data: pathology,
    });
  } catch (error) {
    console.error("Error creating pathology:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create pathology",
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
router.put("/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "superuser") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

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
      data: pathology,
    });
  } catch (error) {
    console.error("Error updating pathology:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update pathology",
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

module.exports = router;
