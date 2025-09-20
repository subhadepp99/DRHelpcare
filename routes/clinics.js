const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const Clinic = require("../models/Clinic");
const { auth, adminAuth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

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
        { phone: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { services: { $in: [new RegExp(search, "i")] } },
        { place: new RegExp(search, "i") },
        { state: new RegExp(search, "i") },
        { address: new RegExp(search, "i") },
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
      .select("-reviews -__v -image.data")
      .populate("doctors.doctor", "name qualification experience imageUrl")
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Clinic.countDocuments(query);

    // Convert database images to base64 for frontend
    const clinicsWithImages = clinics.map((clinic) => {
      const clinicObj = clinic.toObject();
      if (clinicObj.image && clinicObj.image.data) {
        clinicObj.image = `data:${
          clinicObj.image.contentType
        };base64,${clinicObj.image.data.toString("base64")}`;
      }
      return clinicObj;
    });

    res.json({
      success: true,
      data: {
        clinics: clinicsWithImages,
        total,
        page: page * 1,
        limit: limit * 1,
        totalPages: Math.ceil(total / limit),
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

// Search clinics by name and location - MUST come before /:id route
router.get("/search", async (req, res) => {
  try {
    const { name = "", location = "" } = req.query;

    //console.log("Clinic search request:", { name, location });

    const query = { isActive: true };

    // Add name filter - search in name field
    if (name) {
      // Handle both exact matches and partial matches
      query.name = new RegExp(name.replace(/-/g, " "), "i");
    }

    // Add location filter - check multiple location fields
    if (location && location !== "unknown") {
      query.$or = [
        { place: new RegExp(location, "i") },
        { state: new RegExp(location, "i") },
        { address: new RegExp(location, "i") }, // address is a string field
      ];
    }

    //console.log("Search query:", JSON.stringify(query, null, 2));

    // First, let's see what clinics exist in the database
    const allClinics = await Clinic.find({ isActive: true }).select(
      "name place state address"
    );
    //console.log("All active clinics in database:", allClinics);

    const clinics = await Clinic.find(query)
      .select(
        "_id name place state address isActive type imageUrl rating services facilities phone email description image"
      )
      .limit(20);

    //console.log(`Found ${clinics.length} clinics matching the search`);
    //console.log(
    // "Matching clinics:",
    // clinics.map((c) => ({
    //   id: c._id,
    //   name: c.name,
    //   place: c.place,
    //   state: c.state,
    //   address: c.address,
    //   type: c.type,
    //   phone: c.phone,
    //   email: c.email,
    // }))
    // );

    // Convert database images to base64 for frontend
    const clinicsWithImages = clinics.map((clinic) => {
      const clinicObj = clinic.toObject();
      if (clinicObj.image && clinicObj.image.data) {
        clinicObj.image = `data:${
          clinicObj.image.contentType
        };base64,${clinicObj.image.data.toString("base64")}`;
      }
      return clinicObj;
    });

    res.json({
      success: true,
      data: {
        clinics: clinicsWithImages,
        total: clinics.length,
      },
    });
  } catch (error) {
    console.error("Search clinics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search clinics",
      error: error.message,
    });
  }
});

// Get clinic by ID - MUST come before /:id route
router.get("/by-id/:id", async (req, res) => {
  try {
    const { id } = req.params;

    //console.log("Get clinic by ID request:", { id });

    const clinic = await Clinic.findById(id)
      .select("-reviews -__v")
      .populate("doctors.doctor", "name qualification experience imageUrl");

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    // Convert database image to base64 for frontend
    const clinicObj = clinic.toObject();
    if (clinicObj.image && clinicObj.image.data) {
      clinicObj.image = `data:${
        clinicObj.image.contentType
      };base64,${clinicObj.image.data.toString("base64")}`;
    }

    //console.log("Found clinic:", { id: clinic._id, name: clinic.name });

    res.json({
      success: true,
      data: {
        clinic: clinicObj,
      },
    });
  } catch (error) {
    console.error("Get clinic by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get clinic",
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
        "doctors.doctor",
        "name qualification experience imageUrl bio department"
      )
      .populate("doctors.doctor.department", "name")
      .populate("reviews.patient", "firstName lastName");

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    // Convert database image to base64 for frontend
    const clinicObj = clinic.toObject();
    if (clinicObj.image && clinicObj.image.data) {
      clinicObj.image = `data:${
        clinicObj.image.contentType
      };base64,${clinicObj.image.data.toString("base64")}`;
    }

    res.json({
      success: true,
      data: clinicObj,
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

    // Add image to database if uploaded via file or base64
    if (req.file) {
      clinicData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      // Keep imageUrl for backward compatibility
      clinicData.imageUrl = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;
    } else if (imageUrl && imageUrl.startsWith("data:image/")) {
      // Handle base64 image data
      const matches = imageUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
      if (matches) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        clinicData.image = {
          data: buffer,
          contentType: contentType,
        };
      }
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

    // Convert database image to base64 for response
    const clinicObj = clinic.toObject();
    if (clinicObj.image && clinicObj.image.data) {
      clinicObj.image = `data:${
        clinicObj.image.contentType
      };base64,${clinicObj.image.data.toString("base64")}`;
    }

    res.status(201).json({
      success: true,
      message: "Clinic created successfully",
      data: clinicObj,
    });
  } catch (error) {
    console.error("Create clinic error:", error);

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
      // Store new image in database
      updates.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      // Keep imageUrl for backward compatibility
      updates.imageUrl = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;
    } else if (updates.imageUrl && updates.imageUrl.startsWith("data:image/")) {
      // Handle base64 image data
      const matches = updates.imageUrl.match(
        /^data:(image\/[a-zA-Z]+);base64,(.+)$/
      );
      if (matches) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        updates.image = {
          data: buffer,
          contentType: contentType,
        };
      }
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

    // Convert database image to base64 for response
    const clinicObj = updatedClinic.toObject();
    if (clinicObj.image && clinicObj.image.data) {
      clinicObj.image = `data:${
        clinicObj.image.contentType
      };base64,${clinicObj.image.data.toString("base64")}`;
    }

    res.json({
      success: true,
      message: "Clinic updated successfully",
      data: clinicObj,
    });
  } catch (error) {
    console.error("Update clinic error:", error);

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

// Get clinic doctors with detailed information
router.get("/:id/doctors", async (req, res) => {
  try {
    const clinicId = req.params.id;
    const {
      page = 1,
      limit = 20,
      search = "",
      department = "",
      available = "",
    } = req.query;

    const clinic = await Clinic.findById(clinicId).populate({
      path: "doctors.doctor",
      select:
        "name qualification experience imageUrl bio department availableDateTime",
      populate: {
        path: "department",
        select: "name",
      },
    });

    if (!clinic) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
      });
    }

    // Filter active doctors
    let activeDoctors = clinic.doctors.filter((doc) => doc.isActive);

    // Apply search filter
    if (search) {
      activeDoctors = activeDoctors.filter(
        (doc) =>
          doc.doctor.name.toLowerCase().includes(search.toLowerCase()) ||
          doc.doctor.qualification
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          (doc.doctor.bio &&
            doc.doctor.bio.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Apply department filter
    if (department) {
      activeDoctors = activeDoctors.filter(
        (doc) =>
          doc.doctor.department &&
          doc.doctor.department.name
            .toLowerCase()
            .includes(department.toLowerCase())
      );
    }

    // Apply availability filter
    if (available === "true") {
      activeDoctors = activeDoctors.filter(
        (doc) =>
          doc.doctor.availableDateTime &&
          doc.doctor.availableDateTime.length > 0
      );
    }

    // Pagination
    const skip = (page - 1) * limit;
    const paginatedDoctors = activeDoctors.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: {
        clinic: {
          _id: clinic._id,
          name: clinic.name,
          address: clinic.address,
          place: clinic.place,
          state: clinic.state,
          city: clinic.city,
        },
        doctors: paginatedDoctors,
        pagination: {
          total: activeDoctors.length,
          page: parseInt(page),
          pages: Math.ceil(activeDoctors.length / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get clinic doctors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch clinic doctors",
      error: error.message,
    });
  }
});

// Get clinic image from database
router.get("/:id/image", async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id);

    if (!clinic || !clinic.image || !clinic.image.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", clinic.image.contentType);
    res.send(clinic.image.data);
  } catch (error) {
    console.error("Get clinic image error:", error);
    res.status(500).json({ message: "Error fetching image" });
  }
});

module.exports = router;
