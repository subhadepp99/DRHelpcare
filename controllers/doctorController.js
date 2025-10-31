const Doctor = require("../models/Doctor");
const upload = require("../middleware/uploadMiddleware");

exports.createDoctor = async (req, res) => {
  try {
    const doctorData = { ...req.body, createdBy: req.user.id };

    // Parse address if it's a string
    if (typeof doctorData.address === "string") {
      doctorData.address = JSON.parse(doctorData.address);
    }

    // Handle location coordinates
    if (doctorData.latitude && doctorData.longitude) {
      doctorData.address.location = {
        type: "Point",
        coordinates: [
          parseFloat(doctorData.longitude),
          parseFloat(doctorData.latitude),
        ],
      };
      delete doctorData.latitude;
      delete doctorData.longitude;
    }

    // Support image upload via base64 photoUrl or file
    if (
      doctorData.photoUrl &&
      typeof doctorData.photoUrl === "string" &&
      doctorData.photoUrl.startsWith("data:image/")
    ) {
      const matches = doctorData.photoUrl.match(
        /^data:(image\/[a-zA-Z]+);base64,(.+)$/
      );
      if (matches) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        doctorData.image = {
          data: buffer,
          contentType: contentType,
        };
      }
      delete doctorData.photoUrl;
    } else if (req.file) {
      doctorData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
    } else {
      if (doctorData.photoUrl) delete doctorData.photoUrl;
    }

    const doctor = new Doctor(doctorData);
    await doctor.save();

    // Prepare image as base64 for response
    let imageBase64 = null;
    if (doctor.image && doctor.image.data) {
      imageBase64 = `data:${
        doctor.image.contentType
      };base64,${doctor.image.data.toString("base64")}`;
    }

    res.status(201).json({
      message: "Doctor created successfully",
      doctor: {
        ...doctor.toObject(),
        image: imageBase64,
      },
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Doctor with this email or license number already exists",
      });
    }
    res.status(500).json({ message: "Error creating doctor" });
  }
};

exports.getAllDoctors = async (req, res) => {
  try {
    const { page = 1, limit = 10, specialization, city } = req.query;
    const Review = require("../models/Review");

    let query = { isActive: true };

    if (specialization) {
      query.specialization = new RegExp(specialization, "i");
    }

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    const doctors = await Doctor.find(query)
      .select("-image.data")
      .populate("clinicId", "name address")
      .populate("createdBy", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Doctor.countDocuments(query);

    // Add image as base64 string and review stats
    const doctorsWithImage = await Promise.all(
      doctors.map(async (doc) => {
        let imageBase64 = null;
        if (doc.image && doc.image.data) {
          imageBase64 = `data:${
            doc.image.contentType
          };base64,${doc.image.data.toString("base64")}`;
        }

        // Get review stats
        const reviewStats = await Review.aggregate([
          {
            $match: {
              entityType: "Doctor",
              entityId: doc._id,
              isApproved: true,
              isActive: true,
            },
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              totalReviews: { $sum: 1 },
            },
          },
        ]);

        const stats = reviewStats[0] || {
          averageRating: 0,
          totalReviews: 0,
        };

        return {
          ...doc.toObject(),
          image: imageBase64,
          rating: Math.round(stats.averageRating * 10) / 10,
          reviewCount: stats.totalReviews,
        };
      })
    );

    res.json({
      doctors: doctorsWithImage,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching doctors" });
  }
};

exports.getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .populate("clinicId", "name address phone")
      .populate("createdBy", "firstName lastName");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    const doctorObj = doctor.toObject();
    if (doctorObj.image && doctorObj.image.data) {
      doctorObj.image = `data:${
        doctorObj.image.contentType
      };base64,${doctorObj.image.data.toString("base64")}`;
    } else {
      doctorObj.image = null;
    }

    res.json(doctorObj);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching doctor" });
  }
};

exports.getDoctorImage = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor || !doctor.image || !doctor.image.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", doctor.image.contentType);
    res.send(doctor.image.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching image" });
  }
};

exports.updateDoctor = async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Parse address if it's a string
    if (typeof updateData.address === "string") {
      updateData.address = JSON.parse(updateData.address);
    }

    // Handle location coordinates
    if (updateData.latitude && updateData.longitude) {
      updateData.address.location = {
        type: "Point",
        coordinates: [
          parseFloat(updateData.longitude),
          parseFloat(updateData.latitude),
        ],
      };
      delete updateData.latitude;
      delete updateData.longitude;
    } else if (updateData.latitude === null || updateData.longitude === null) {
      // If location is explicitly set to null, remove the location field
      updateData.$unset = { "address.location": 1 };
      delete updateData.latitude;
      delete updateData.longitude;
    }

    // Handle image update from file upload or base64 photoUrl
    let imageUpdated = false;

    if (
      updateData.photoUrl &&
      typeof updateData.photoUrl === "string" &&
      updateData.photoUrl.startsWith("data:image/")
    ) {
      const matches = updateData.photoUrl.match(
        /^data:(image\/[a-zA-Z]+);base64,(.+)$/
      );
      if (matches) {
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        updateData.image = {
          data: buffer,
          contentType: contentType,
        };
        imageUpdated = true;
      }
      delete updateData.photoUrl;
    } else if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      imageUpdated = true;
    } else {
      if (updateData.photoUrl) delete updateData.photoUrl;
    }

    const doctor = await Doctor.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("clinicId", "name address")
      .populate("createdBy", "firstName lastName");

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Prepare image as base64 for response
    let imageBase64 = null;
    if (doctor.image && doctor.image.data) {
      imageBase64 = `data:${
        doctor.image.contentType
      };base64,${doctor.image.data.toString("base64")}`;
    }

    res.json({
      message: "Doctor updated successfully",
      doctor: {
        ...doctor.toObject(),
        image: imageBase64,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating doctor" });
  }
};

exports.deleteDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    res.json({ message: "Doctor deactivated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting doctor" });
  }
};
