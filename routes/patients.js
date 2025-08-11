const express = require("express");
const User = require("../models/User");
const Booking = require("../models/Booking");
const { auth, adminAuth } = require("../middleware/auth");

const router = express.Router();

// Get all patients (admin only)
router.get("/", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const query = {
      role: "user",
      isActive: true,
    };

    if (search) {
      query.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    const patients = await User.find(query)
      .select("-password -__v")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // Get booking counts for each patient
    const patientsWithBookings = await Promise.all(
      patients.map(async (patient) => {
        const bookingCount = await Booking.countDocuments({
          patient: patient._id,
        });
        const lastBooking = await Booking.findOne({ patient: patient._id })
          .sort({ createdAt: -1 })
          .populate("doctor", "name specialization");

        return {
          ...patient.toObject(),
          name: `${patient.firstName} ${patient.lastName}`,
          bookingCount,
          lastBooking: lastBooking
            ? {
                date: lastBooking.appointmentDate,
                doctor: lastBooking.doctor?.name,
                specialization: lastBooking.doctor?.specialization,
              }
            : null,
        };
      })
    );

    res.json({
      success: true,
      data: {
        patients: patientsWithBookings,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch patients",
      error: error.message,
    });
  }
});

// Get patient details
router.get("/:patientId", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;

    const patient = await User.findById(patientId).select("-password -__v");

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    if (patient.role !== "user") {
      return res.status(400).json({
        success: false,
        message: "User is not a patient",
      });
    }

    // Get patient's bookings
    const bookings = await Booking.find({ patient: patientId })
      .populate("doctor", "name specialization")
      .populate("clinic", "name")
      .sort({ appointmentDate: -1 })
      .limit(10);

    // Get booking statistics
    const [totalBookings, completedBookings, cancelledBookings] =
      await Promise.all([
        Booking.countDocuments({ patient: patientId }),
        Booking.countDocuments({ patient: patientId, status: "completed" }),
        Booking.countDocuments({ patient: patientId, status: "cancelled" }),
      ]);

    const patientDetails = {
      ...patient.toObject(),
      name: `${patient.firstName} ${patient.lastName}`,
      bookings,
      stats: {
        totalBookings,
        completedBookings,
        cancelledBookings,
        pendingBookings: totalBookings - completedBookings - cancelledBookings,
      },
    };

    res.json({
      success: true,
      data: patientDetails,
    });
  } catch (error) {
    console.error("Get patient details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch patient details",
      error: error.message,
    });
  }
});

// Update patient status
router.put("/:patientId/status", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { isActive } = req.body;

    const patient = await User.findByIdAndUpdate(
      patientId,
      { isActive },
      { new: true }
    ).select("-password -__v");

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    res.json({
      success: true,
      message: `Patient ${isActive ? "activated" : "deactivated"} successfully`,
      data: patient,
    });
  } catch (error) {
    console.error("Update patient status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update patient status",
      error: error.message,
    });
  }
});

module.exports = router;
