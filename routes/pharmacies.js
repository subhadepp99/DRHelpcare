const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const Pharmacy = require("../models/Pharmacy");
const { auth, adminAuth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, "..", "uploads", "pharmacies");
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

// Get all pharmacies
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      city = "",
      is24Hours = "",
      sortBy = "name",
      sortOrder = "asc",
    } = req.query;

    const query = { isActive: true };

    // Add search filters
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { services: { $in: [new RegExp(search, "i")] } },
        { "address.city": new RegExp(search, "i") },
      ];
    }

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    if (is24Hours !== "") {
      query.is24Hours = is24Hours === "true";
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    const pharmacies = await Pharmacy.find(query)
      .select("-reviews -medications -__v")
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Pharmacy.countDocuments(query);

    res.json({
      success: true,
      data: {
        pharmacies,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get pharmacies error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pharmacies",
      error: error.message,
    });
  }
});

// Get single pharmacy
router.get("/:id", async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findOne({
      _id: req.params.id,
      isActive: true,
    }).populate("reviews.patient", "firstName lastName");

    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    res.json({
      success: true,
      data: pharmacy,
    });
  } catch (error) {
    console.error("Get pharmacy error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pharmacy",
      error: error.message,
    });
  }
});

// Create new pharmacy (Admin only)
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      licenseNumber,
      email,
      phone,
      address,
      place,
      state,
      zipCode,
      country,
      operatingHours,
      services = [],
      is24Hours = false,
      imageUrl,
    } = req.body;

    // Check if pharmacy already exists
    const existingPharmacy = await Pharmacy.findOne({
      $or: [{ email }, { licenseNumber }],
    });

    if (existingPharmacy) {
      return res.status(400).json({
        success: false,
        message: "Pharmacy with this email or license number already exists",
      });
    }

    // Parse arrays if they are strings
    const parsedServices = Array.isArray(services)
      ? services
      : typeof services === "string"
      ? services
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Create pharmacy object
    const pharmacyData = {
      name,
      licenseNumber: licenseNumber || undefined,
      email,
      phone,
      address,
      place,
      state,
      zipCode,
      country,
      services: parsedServices,
      is24Hours: is24Hours === "true" || is24Hours === true,
      imageUrl,
    };

    // Add image path if uploaded
    if (req.file) {
      pharmacyData.image = `/uploads/pharmacies/${req.file.filename}`;
      pharmacyData.imageUrl = `/uploads/pharmacies/${req.file.filename}`; // Set imageUrl for public access
    }

    const pharmacy = new Pharmacy(pharmacyData);
    await pharmacy.save();

    // Create activity log
    await createActivity({
      type: "pharmacy_added",
      message: `${pharmacy.name} was added to the network`,
      user: req.user.id,
      targetId: pharmacy._id,
      targetModel: "Pharmacy",
    });

    res.status(201).json({
      success: true,
      message: "Pharmacy created successfully",
      data: pharmacy,
    });
  } catch (error) {
    console.error("Create pharmacy error:", error);

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
      message: "Failed to create pharmacy",
      error: error.message,
    });
  }
});

// Update pharmacy (Admin only)
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const pharmacyId = req.params.id;
    const updates = { ...req.body };

    // Parse arrays if they are strings
    if (updates.services && typeof updates.services === "string") {
      updates.services = updates.services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    // Convert boolean string
    if (updates.is24Hours !== undefined) {
      updates.is24Hours =
        updates.is24Hours === "true" || updates.is24Hours === true;
    }

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (pharmacy.image && pharmacy.image.startsWith("/uploads/")) {
        const oldImagePath = path.join(
          __dirname,
          "..",
          pharmacy.image.replace("/uploads/", "uploads/")
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

      updates.image = `/uploads/pharmacies/${req.file.filename}`;
      updates.imageUrl = `/uploads/pharmacies/${req.file.filename}`; // Set imageUrl for public access
    }

    const updatedPharmacy = await Pharmacy.findByIdAndUpdate(
      pharmacyId,
      updates,
      { new: true, runValidators: true }
    );

    // Create activity log
    await createActivity({
      type: "pharmacy_updated",
      message: `${updatedPharmacy.name} information was updated`,
      user: req.user.id,
      targetId: updatedPharmacy._id,
      targetModel: "Pharmacy",
    });

    res.json({
      success: true,
      message: "Pharmacy updated successfully",
      data: updatedPharmacy,
    });
  } catch (error) {
    console.error("Update pharmacy error:", error);

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
      message: "Failed to update pharmacy",
      error: error.message,
    });
  }
});

// Delete pharmacy (Admin only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const pharmacyId = req.params.id;

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    // Soft delete by setting isActive to false
    pharmacy.isActive = false;
    await pharmacy.save();

    // Create activity log
    await createActivity({
      type: "pharmacy_deleted",
      message: `${pharmacy.name} was removed from the system`,
      user: req.user.id,
      targetId: pharmacy._id,
      targetModel: "Pharmacy",
    });

    res.json({
      success: true,
      message: "Pharmacy deleted successfully",
    });
  } catch (error) {
    console.error("Delete pharmacy error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete pharmacy",
      error: error.message,
    });
  }
});

// Add review to pharmacy
router.post("/:id/reviews", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const pharmacyId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    // Check if user already reviewed this pharmacy
    const existingReview = pharmacy.reviews.find(
      (review) => review.patient.toString() === req.user.id
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this pharmacy",
      });
    }

    // Add review
    pharmacy.reviews.push({
      patient: req.user.id,
      rating: parseInt(rating),
      comment: comment || "",
      date: new Date(),
    });

    // Calculate average rating
    const sum = pharmacy.reviews.reduce(
      (acc, review) => acc + review.rating,
      0
    );
    pharmacy.rating.average = (sum / pharmacy.reviews.length).toFixed(1);
    pharmacy.rating.count = pharmacy.reviews.length;

    await pharmacy.save();
    await pharmacy.populate("reviews.patient", "firstName lastName");

    res.json({
      success: true,
      message: "Review added successfully",
      data: pharmacy,
    });
  } catch (error) {
    // Add review to pharmacy (Continued from previous)
    console.error("Add pharmacy review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add review",
      error: error.message,
    });
  }
});

// Search medications in pharmacy
router.get("/:id/medications", async (req, res) => {
  try {
    const { search = "", category = "", page = 1, limit = 20 } = req.query;
    const pharmacyId = req.params.id;

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    let medications = pharmacy.medications || [];

    // Apply search filters
    if (search) {
      medications = medications.filter((med) =>
        med.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (category) {
      medications = medications.filter(
        (med) => med.category.toLowerCase() === category.toLowerCase()
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedMedications = medications.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        medications: paginatedMedications,
        pagination: {
          total: medications.length,
          page: parseInt(page),
          pages: Math.ceil(medications.length / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Search medications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search medications",
      error: error.message,
    });
  }
});

// Add medication to pharmacy
router.post("/:id/medications", adminAuth, async (req, res) => {
  try {
    const pharmacyId = req.params.id;
    const { name, category, price, availability = true } = req.body;

    const pharmacy = await Pharmacy.findById(pharmacyId);
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: "Pharmacy not found",
      });
    }

    // Check if medication already exists
    const existingMedication = pharmacy.medications.find(
      (med) => med.name.toLowerCase() === name.toLowerCase()
    );

    if (existingMedication) {
      return res.status(400).json({
        success: false,
        message: "Medication already exists in this pharmacy",
      });
    }

    // Add medication
    pharmacy.medications.push({
      name,
      category,
      price: parseFloat(price),
      availability,
    });

    await pharmacy.save();

    res.status(201).json({
      success: true,
      message: "Medication added successfully",
      data: pharmacy.medications[pharmacy.medications.length - 1],
    });
  } catch (error) {
    console.error("Add medication error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add medication",
      error: error.message,
    });
  }
});

module.exports = router;
