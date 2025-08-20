const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const Doctor = require("../models/Doctor");
const { auth, adminAuth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, "..", "uploads", "doctors");
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

// Get all doctors
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      specialization = "",
      city = "",
      sortBy = "name",
      sortOrder = "asc",
    } = req.query;

    const query = { isActive: true };

    // Add search filters
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { specialization: new RegExp(search, "i") },
        { qualification: new RegExp(search, "i") },
      ];
    }

    if (specialization) {
      query.specialization = specialization;
    }

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    const doctors = await Doctor.find(query)
      .select("-reviews -__v")
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Doctor.countDocuments(query);

    res.json({
      success: true,
      data: {
        doctors,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get doctors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctors",
      error: error.message,
    });
  }
});

// Get single doctor
router.get("/:id", async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      _id: req.params.id,
      isActive: true,
    }).populate("reviews.patient", "firstName lastName");

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    res.json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    console.error("Get doctor error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor",
      error: error.message,
    });
  }
});

// Create new doctor (Admin only)
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      specialization,
      qualification,
      experience,
      licenseNumber,
      consultationFee,
      address = {},
      languages = [],
      services = [],
    } = req.body;

    // Check if doctor already exists
    const existingDoctor = await Doctor.findOne({
      $or: [{ email }, { phone }, { licenseNumber }],
    });

    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message:
          "Doctor with this email, phone, or license number already exists",
      });
    }

    // Parse JSON strings if needed
    const parsedAddress =
      typeof address === "string" ? JSON.parse(address) : address;
    const parsedLanguages =
      typeof languages === "string" ? JSON.parse(languages) : languages;
    const parsedServices =
      typeof services === "string" ? JSON.parse(services) : services;

    // Create doctor object
    const doctorData = {
      name,
      email,
      phone,
      specialization,
      qualification,
      experience: parseInt(experience),
      licenseNumber,
      consultationFee: parseFloat(consultationFee),
      address: parsedAddress,
      languages: parsedLanguages,
      services: parsedServices,
    };

    // Add image path if uploaded
    if (req.file) {
      doctorData.image = `/uploads/doctors/${req.file.filename}`;
      doctorData.imageUrl = `/uploads/doctors/${req.file.filename}`;
    }

    // Add imageUrl if provided in body
    if (req.body.imageUrl) {
      doctorData.imageUrl = req.body.imageUrl;
    }

    const doctor = new Doctor(doctorData);
    await doctor.save();

    // Create activity log
    await createActivity({
      type: "doctor_added",
      message: `Dr. ${doctor.name} was added to ${doctor.specialization} department`,
      user: req.user.id,
      targetId: doctor._id,
      targetModel: "Doctor",
    });

    res.status(201).json({
      success: true,
      message: "Doctor created successfully",
      data: doctor,
    });
  } catch (error) {
    console.error("Create doctor error:", error);

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
      message: "Failed to create doctor",
      error: error.message,
    });
  }
});

// Update doctor (Admin only)
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const doctorId = req.params.id;
    const updates = { ...req.body };

    // Parse JSON strings if needed
    if (updates.address && typeof updates.address === "string") {
      updates.address = JSON.parse(updates.address);
    }
    if (updates.languages && typeof updates.languages === "string") {
      updates.languages = JSON.parse(updates.languages);
    }
    if (updates.services && typeof updates.services === "string") {
      updates.services = JSON.parse(updates.services);
    }

    // Convert numeric fields
    if (updates.experience) updates.experience = parseInt(updates.experience);
    if (updates.consultationFee)
      updates.consultationFee = parseFloat(updates.consultationFee);

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Handle image update
    if (req.file) {
      // Delete old image if exists
      if (doctor.image && doctor.image.startsWith("/uploads/")) {
        const oldImagePath = path.join(
          __dirname,
          "..",
          doctor.image.replace("/uploads/", "uploads/")
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

      updates.image = `/uploads/doctors/${req.file.filename}`;
      updates.imageUrl = `/uploads/doctors/${req.file.filename}`;
    }

    // Add imageUrl if provided in body
    if (req.body.imageUrl) {
      updates.imageUrl = req.body.imageUrl;
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(doctorId, updates, {
      new: true,
      runValidators: true,
    });

    // Create activity log
    await createActivity({
      type: "doctor_updated",
      message: `Dr. ${updatedDoctor.name} profile was updated`,
      user: req.user.id,
      targetId: updatedDoctor._id,
      targetModel: "Doctor",
    });

    res.json({
      success: true,
      message: "Doctor updated successfully",
      data: updatedDoctor,
    });
  } catch (error) {
    console.error("Update doctor error:", error);

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
      message: "Failed to update doctor",
      error: error.message,
    });
  }
});

// Delete doctor (Admin only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const doctorId = req.params.id;

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Soft delete by setting isActive to false
    doctor.isActive = false;
    await doctor.save();

    // Create activity log
    await createActivity({
      type: "doctor_deleted",
      message: `Dr. ${doctor.name} was removed from the system`,
      user: req.user.id,
      targetId: doctor._id,
      targetModel: "Doctor",
    });

    res.json({
      success: true,
      message: "Doctor deleted successfully",
    });
  } catch (error) {
    console.error("Delete doctor error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete doctor",
      error: error.message,
    });
  }
});

// Get doctor image
router.get("/:id/image", async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor || !doctor.image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const imagePath = path.join(
      __dirname,
      "..",
      doctor.image.replace("/uploads/", "uploads/")
    );

    try {
      await fs.access(imagePath);
      res.sendFile(imagePath);
    } catch (error) {
      res.status(404).json({
        success: false,
        message: "Image file not found",
      });
    }
  } catch (error) {
    console.error("Get doctor image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch image",
      error: error.message,
    });
  }
});

// Add review to doctor
router.post("/:id/reviews", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const doctorId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Check if user already reviewed this doctor
    const existingReview = doctor.reviews.find(
      (review) => review.patient.toString() === req.user.id
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this doctor",
      });
    }

    // Add review
    doctor.reviews.push({
      patient: req.user.id,
      rating: parseInt(rating),
      comment: comment || "",
      date: new Date(),
    });

    // Recalculate average rating
    await doctor.calculateRating();

    await doctor.populate("reviews.patient", "firstName lastName");

    res.json({
      success: true,
      message: "Review added successfully",
      data: doctor,
    });
  } catch (error) {
    console.error("Add review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add review",
      error: error.message,
    });
  }
});

// Get doctor specializations (for filters)
router.get("/meta/specializations", async (req, res) => {
  try {
    const specializations = await Doctor.distinct("specialization", {
      isActive: true,
    });

    res.json({
      success: true,
      data: specializations,
    });
  } catch (error) {
    console.error("Get specializations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch specializations",
      error: error.message,
    });
  }
});

module.exports = router;
