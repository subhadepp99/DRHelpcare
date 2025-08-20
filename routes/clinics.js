const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const Clinic = require("../models/Clinic");
const { auth, adminAuth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, "..", "uploads", "clinics");
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

// Get all clinics
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      city = "",
      type = "",
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

    if (type) {
      query.type = type;
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    const clinics = await Clinic.find(query)
      .select("-reviews -__v")
      .populate("doctors", "name specialization")
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Clinic.countDocuments(query);

    res.json({
      success: true,
      data: {
        clinics,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get clinics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clinics",
      error: error.message,
    });
  }
});

// Get single clinic
router.get("/:id", async (req, res) => {
  try {
    const clinic = await Clinic.findOne({
      _id: req.params.id,
      isActive: true,
    })
      .populate(
        "doctors",
        "name specialization qualification experience consultationFee"
      )
      .populate("reviews.patient", "firstName lastName");

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    res.json({
      success: true,
      data: clinic,
    });
  } catch (error) {
    console.error("Get clinic error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clinic",
      error: error.message,
    });
  }
});

// Create new clinic (Admin only)
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      registrationNumber,
      email,
      phone,
      address,
      place,
      state,
      zipCode,
      country,
      operatingHours,
      services = [],
      facilities = [],
      type = "clinic",
      imageUrl,
    } = req.body;

    // Check if clinic already exists
    const existingClinic = await Clinic.findOne({
      $or: [{ email }, { registrationNumber }],
    });

    if (existingClinic) {
      return res.status(400).json({
        success: false,
        message: "Clinic with this email or registration number already exists",
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
    const parsedFacilities = Array.isArray(facilities)
      ? facilities
      : typeof facilities === "string"
      ? facilities
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      : [];

    // Create clinic object
    const clinicData = {
      name,
      registrationNumber: registrationNumber || undefined,
      email,
      phone,
      address,
      place,
      state,
      zipCode,
      country,
      services: parsedServices,
      facilities: parsedFacilities,
      type,
      imageUrl,
    };

    // Add image path if uploaded
    if (req.file) {
      clinicData.image = `/uploads/clinics/${req.file.filename}`;
      clinicData.imageUrl = `/uploads/clinics/${req.file.filename}`; // Set imageUrl for public access
    }

    const clinic = new Clinic(clinicData);
    await clinic.save();

    // Create activity log
    await createActivity({
      type: "clinic_added",
      message: `${clinic.name} was registered successfully`,
      user: req.user.id,
      targetId: clinic._id,
      targetModel: "Clinic",
    });

    res.status(201).json({
      success: true,
      message: "Clinic created successfully",
      data: clinic,
    });
  } catch (error) {
    console.error("Create clinic error:", error);

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
      message: "Failed to create clinic",
      error: error.message,
    });
  }
});

// Update clinic (Admin only)
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const clinicId = req.params.id;
    const updates = { ...req.body };

    // Parse arrays if they are strings
    if (updates.services && typeof updates.services === "string") {
      updates.services = updates.services
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (updates.facilities && typeof updates.facilities === "string") {
      updates.facilities = updates.facilities
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
    }

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (clinic.image && clinic.image.startsWith("/uploads/")) {
        const oldImagePath = path.join(
          __dirname,
          "..",
          clinic.image.replace("/uploads/", "uploads/")
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

      updates.image = `/uploads/clinics/${req.file.filename}`;
      updates.imageUrl = `/uploads/clinics/${req.file.filename}`; // Set imageUrl for public access
    }

    const updatedClinic = await Clinic.findByIdAndUpdate(clinicId, updates, {
      new: true,
      runValidators: true,
    });

    // Create activity log
    await createActivity({
      type: "clinic_updated",
      message: `${updatedClinic.name} information was updated`,
      user: req.user.id,
      targetId: updatedClinic._id,
      targetModel: "Clinic",
    });

    res.json({
      success: true,
      message: "Clinic updated successfully",
      data: updatedClinic,
    });
  } catch (error) {
    console.error("Update clinic error:", error);

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
      message: "Failed to update clinic",
      error: error.message,
    });
  }
});

// Delete clinic (Admin only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const clinicId = req.params.id;

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    // Soft delete by setting isActive to false
    clinic.isActive = false;
    await clinic.save();

    // Create activity log
    await createActivity({
      type: "clinic_deleted",
      message: `${clinic.name} was removed from the system`,
      user: req.user.id,
      targetId: clinic._id,
      targetModel: "Clinic",
    });

    res.json({
      success: true,
      message: "Clinic deleted successfully",
    });
  } catch (error) {
    console.error("Delete clinic error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete clinic",
      error: error.message,
    });
  }
});

// Add review to clinic
router.post("/:id/reviews", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const clinicId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    // Check if user already reviewed this clinic
    const existingReview = clinic.reviews.find(
      (review) => review.patient.toString() === req.user.id
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this clinic",
      });
    }

    // Add review
    clinic.reviews.push({
      patient: req.user.id,
      rating: parseInt(rating),
      comment: comment || "",
      date: new Date(),
    });

    // Calculate average rating
    const sum = clinic.reviews.reduce((acc, review) => acc + review.rating, 0);
    clinic.rating.average = (sum / clinic.reviews.length).toFixed(1);
    clinic.rating.count = clinic.reviews.length;

    await clinic.save();
    await clinic.populate("reviews.patient", "firstName lastName");

    res.json({
      success: true,
      message: "Review added successfully",
      data: clinic,
    });
  } catch (error) {
    console.error("Add clinic review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add review",
      error: error.message,
    });
  }
});

module.exports = router;
