const express = require("express");
const Booking = require("../models/Booking");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const { auth } = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Create new booking
router.post("/", auth, async (req, res) => {
  try {
    const {
      doctorId,
      appointmentDate,
      appointmentTime,
      patientDetails,
      symptoms,
      reasonForVisit,
      paymentMethod = "card",
    } = req.body;

    // Validate doctor exists
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Check if slot is available
    const existingBooking = await Booking.findOne({
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      status: { $in: ["pending", "confirmed"] },
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "This time slot is already booked",
      });
    }

    // Create booking
    const booking = new Booking({
      patient: req.user.id,
      doctor: doctorId,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      patientDetails: {
        ...patientDetails,
        name:
          patientDetails.patientName ||
          `${req.user.firstName} ${req.user.lastName}`,
        email: patientDetails.email || req.user.email,
        phone: patientDetails.phone || req.user.phone,
      },
      symptoms,
      reasonForVisit,
      consultationFee: doctor.consultationFee,
      paymentMethod,
      status: "confirmed", // Auto-confirm for now
    });

    await booking.save();

    // Create activity log
    await createActivity({
      type: "appointment_booked",
      message: `New appointment booked with Dr. ${doctor.name}`,
      user: req.user.id,
      targetId: booking._id,
      targetModel: "Booking",
    });

    // Populate booking details for response
    await booking.populate([
      { path: "doctor", select: "name specialization consultationFee" },
      { path: "patient", select: "firstName lastName email phone" },
    ]);

    res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      booking,
    });
  } catch (error) {
    console.error("Booking creation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create booking",
      error: error.message,
    });
  }
});

// Get all bookings for admin
router.get("/admin", auth, async (req, res) => {
  try {
    if (!["admin", "superuser"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { status, page = 1, limit = 50 } = req.query;

    const query = {};
    if (status && status !== "all") query.status = status;

    const bookings = await Booking.find(query)
      .populate("doctor", "name specialization image consultationFee address")
      .populate("clinic", "name address")
      .populate("patient", "firstName lastName email phone")
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get admin bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

// Get user's bookings
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Check if user can access these bookings
    if (
      req.user.id !== userId &&
      !["admin", "superuser"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const query = { patient: userId };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .populate("doctor", "name specialization image consultationFee address")
      .populate("clinic", "name address")
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(query);

    // Enhance booking data
    const enhancedBookings = bookings.map((booking) => ({
      ...booking.toObject(),
      doctorName: `Dr. ${booking.doctor.name}`,
      specialization: booking.doctor.specialization,
      date: booking.appointmentDate.toISOString().split("T")[0],
      time: booking.appointmentTime,
      fee: booking.consultationFee,
      diagnosis: booking.diagnosis || "Pending consultation",
      prescription: booking.prescription || "To be provided after consultation",
    }));

    res.json({
      success: true,
      bookings: enhancedBookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get user bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
      error: error.message,
    });
  }
});

// Update booking status
router.put("/:bookingId/status", auth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    if (
      !["pending", "confirmed", "completed", "cancelled", "no_show"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check access permissions
    const canAccess =
      booking.patient.toString() === req.user.id ||
      booking.doctor.toString() === req.user.id ||
      ["admin", "superuser"].includes(req.user.role);

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    booking.status = status;
    await booking.save();

    // Create activity log
    await createActivity({
      type: "booking_status_updated",
      message: `Booking ${booking.bookingId} status updated to ${status}`,
      user: req.user.id,
      targetId: booking._id,
      targetModel: "Booking",
    });

    res.json({
      success: true,
      message: "Booking status updated successfully",
      booking,
    });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
      error: error.message,
    });
  }
});

// Get booking details
router.get("/:bookingId", auth, async (req, res) => {
  try {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId)
      .populate(
        "doctor",
        "name specialization image consultationFee address phone"
      )
      .populate("patient", "firstName lastName email phone")
      .populate("clinic", "name address phone");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check access permissions
    const canAccess =
      booking.patient._id.toString() === req.user.id ||
      booking.doctor._id.toString() === req.user.id ||
      ["admin", "superuser"].includes(req.user.role);

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.json({
      success: true,
      booking,
    });
  } catch (error) {
    console.error("Get booking details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch booking details",
      error: error.message,
    });
  }
});

// Update booking status
router.put("/:bookingId/status", auth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, diagnosis, prescription, notes } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check permissions
    const canUpdate =
      booking.doctor.toString() === req.user.id ||
      ["admin", "superuser"].includes(req.user.role);

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update booking
    booking.status = status;
    if (diagnosis) booking.diagnosis = diagnosis;
    if (prescription) booking.prescription = prescription;
    if (notes) booking.notes = notes;

    await booking.save();

    // Create activity log
    await createActivity({
      type: `appointment_${status}`,
      message: `Appointment ${status} for booking ${booking.bookingId}`,
      user: req.user.id,
      targetId: booking._id,
      targetModel: "Booking",
    });

    res.json({
      success: true,
      message: "Booking updated successfully",
      booking,
    });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update booking",
      error: error.message,
    });
  }
});

// Cancel booking
router.delete("/:bookingId", auth, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Check permissions
    const canCancel =
      booking.patient.toString() === req.user.id ||
      booking.doctor.toString() === req.user.id ||
      ["admin", "superuser"].includes(req.user.role);

    if (!canCancel) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Update booking status
    booking.status = "cancelled";
    booking.notes = reason || "Cancelled by user";
    await booking.save();

    // Create activity log
    await createActivity({
      type: "appointment_cancelled",
      message: `Appointment cancelled for booking ${booking.bookingId}`,
      user: req.user.id,
      targetId: booking._id,
      targetModel: "Booking",
    });

    res.json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel booking",
      error: error.message,
    });
  }
});

// Get doctor's bookings
router.get("/doctor/:doctorId", auth, async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, status, page = 1, limit = 20 } = req.query;

    // Check permissions
    if (
      doctorId !== req.user.id &&
      !["admin", "superuser"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const query = { doctor: doctorId };
    if (date) {
      const searchDate = new Date(date);
      query.appointmentDate = {
        $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
        $lt: new Date(searchDate.setHours(23, 59, 59, 999)),
      };
    }
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .populate("patient", "firstName lastName email phone")
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      bookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Get doctor bookings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor bookings",
      error: error.message,
    });
  }
});

module.exports = router;
