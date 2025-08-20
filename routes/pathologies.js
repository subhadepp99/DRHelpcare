const express = require("express");
const Pathology = require("../models/Pathology");
const { auth, adminAuth } = require("../middleware/auth");
const multer = require("multer");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads/pathologies");
    // Create directory if it doesn't exist
    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch((err) => cb(err));
  },
  filename: function (req, file, cb) {
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
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Helper function to process test images
const processTestImages = (testsOffered) => {
  if (!Array.isArray(testsOffered)) return testsOffered;

  return testsOffered.map((test) => {
    if (test.imageFile) {
      // This would be handled by the frontend sending the image data
      // For now, we'll just ensure the imageUrl is set
      return test;
    }
    return test;
  });
};

// Recreate licenseNumber index (one-time fix for index issues)
router.post("/recreate-index", adminAuth, async (req, res) => {
  try {
    // Drop the existing index
    await Pathology.collection.dropIndex("licenseNumber_1");

    // Create a new sparse index
    await Pathology.collection.createIndex(
      { licenseNumber: 1 },
      {
        unique: true,
        sparse: true,
        name: "licenseNumber_1",
      }
    );

    res.json({
      success: true,
      message: "License number index recreated successfully",
    });
  } catch (error) {
    console.error("Index recreation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to recreate index",
      error: error.message,
    });
  }
});

// Clean up existing pathologies with empty license numbers (one-time fix)
router.post("/cleanup-license", adminAuth, async (req, res) => {
  try {
    // Find all pathologies with empty or null license numbers
    const pathologiesToUpdate = await Pathology.find({
      $or: [
        { licenseNumber: "" },
        { licenseNumber: null },
        { licenseNumber: { $exists: false } },
      ],
    });

    // Update them to remove the licenseNumber field entirely
    const updatePromises = pathologiesToUpdate.map((pathology) => {
      return Pathology.findByIdAndUpdate(
        pathology._id,
        { $unset: { licenseNumber: 1 } },
        { new: true }
      );
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: `Cleaned up ${pathologiesToUpdate.length} pathologies with empty license numbers`,
      count: pathologiesToUpdate.length,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cleanup pathologies",
      error: error.message,
    });
  }
});

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
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const pathologyData = { ...req.body };

    // Handle empty license number - set to undefined to avoid duplicate key errors
    if (
      pathologyData.licenseNumber === "" ||
      pathologyData.licenseNumber === null ||
      pathologyData.licenseNumber === undefined
    ) {
      delete pathologyData.licenseNumber; // Remove the field entirely instead of setting to undefined
    } else if (
      pathologyData.licenseNumber &&
      typeof pathologyData.licenseNumber === "string"
    ) {
      // Trim whitespace and check if it's actually empty after trimming
      const trimmedLicense = pathologyData.licenseNumber.trim();
      if (trimmedLicense === "") {
        delete pathologyData.licenseNumber;
      } else {
        pathologyData.licenseNumber = trimmedLicense;
      }
    }

    console.log(
      "Final pathology data before save:",
      JSON.stringify(pathologyData, null, 2)
    );

    // Process test images if they exist
    if (pathologyData.testsOffered) {
      try {
        pathologyData.testsOffered = JSON.parse(pathologyData.testsOffered);
        pathologyData.testsOffered = processTestImages(
          pathologyData.testsOffered
        );
      } catch (e) {
        console.log("Tests offered parsing failed, using as is");
      }
    }

    // Process other JSON fields
    if (pathologyData.homeCollection) {
      try {
        pathologyData.homeCollection = JSON.parse(pathologyData.homeCollection);
      } catch (e) {
        console.log("Home collection parsing failed, using as is");
      }
    }

    if (pathologyData.servicesOffered) {
      try {
        pathologyData.servicesOffered = JSON.parse(
          pathologyData.servicesOffered
        );
      } catch (e) {
        console.log("Services offered parsing failed, using as is");
      }
    }

    const pathology = new Pathology(pathologyData);

    if (req.file) {
      // Store the file path and generate a public URL
      pathology.image = {
        data: req.file.path,
        contentType: req.file.mimetype,
      };
      pathology.imageUrl = `/uploads/pathologies/${path.basename(
        req.file.path
      )}`;
    }

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
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const pathology = await Pathology.findById(req.params.id);

    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    const pathologyData = { ...req.body };

    // Handle empty license number - set to undefined to avoid duplicate key errors
    if (
      pathologyData.licenseNumber === "" ||
      pathologyData.licenseNumber === null ||
      pathologyData.licenseNumber === undefined
    ) {
      delete pathologyData.licenseNumber; // Remove the field entirely instead of setting to undefined
    } else if (
      pathologyData.licenseNumber &&
      typeof pathologyData.licenseNumber === "string"
    ) {
      // Trim whitespace and check if it's actually empty after trimming
      const trimmedLicense = pathologyData.licenseNumber.trim();
      if (trimmedLicense === "") {
        delete pathologyData.licenseNumber;
      } else {
        pathologyData.licenseNumber = trimmedLicense;
      }
    }

    console.log(
      "Final pathology data before update:",
      JSON.stringify(pathologyData, null, 2)
    );

    // Process test images if they exist
    if (pathologyData.testsOffered) {
      try {
        pathologyData.testsOffered = JSON.parse(pathologyData.testsOffered);
        pathologyData.testsOffered = processTestImages(
          pathologyData.testsOffered
        );
      } catch (e) {
        console.log("Tests offered parsing failed, using as is");
      }
    }

    // Process other JSON fields
    if (pathologyData.homeCollection) {
      try {
        pathologyData.homeCollection = JSON.parse(pathologyData.homeCollection);
      } catch (e) {
        console.log("Home collection parsing failed, using as is");
      }
    }

    if (pathologyData.servicesOffered) {
      try {
        pathologyData.servicesOffered = JSON.parse(
          pathologyData.servicesOffered
        );
      } catch (e) {
        console.log("Services offered parsing failed, using as is");
      }
    }

    if (req.file) {
      // Delete old main image if a new one is uploaded
      if (pathology.image && pathology.image.data) {
        try {
          await fs.unlink(pathology.image.data);
        } catch (err) {
          console.log("Old image file not found or already deleted");
        }
      }
      // Store the file path and generate a public URL
      pathology.image = {
        data: req.file.path,
        contentType: req.file.mimetype,
      };
      pathology.imageUrl = `/uploads/pathologies/${path.basename(
        req.file.path
      )}`;
    }

    Object.assign(pathology, pathologyData);
    await pathology.save();

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
    const pathology = await Pathology.findById(req.params.id);

    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology not found",
      });
    }

    // Delete main image if it exists
    if (pathology.image && pathology.image.data) {
      try {
        await fs.unlink(pathology.image.data);
      } catch (err) {
        console.log("Image file not found or already deleted");
      }
    }

    await pathology.deleteOne();

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
