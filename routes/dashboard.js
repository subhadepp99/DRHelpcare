const express = require("express");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Activity = require("../models/Activity");
const Pathology = require("../models/Pathology");
const Department = require("../models/Department");
const Ambulance = require("../models/Ambulance");
const { auth, adminAuth } = require("../middleware/auth");

const router = express.Router();

// Get dashboard statistics with real-time data
router.get("/stats", adminAuth, async (req, res) => {
  try {
    const { period = "monthly" } = req.query;
    const now = new Date();
    let dateRange;

    if (period === "weekly") {
      dateRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "monthly") {
      dateRange = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      dateRange = new Date(now.getFullYear(), 0, 1); // Start of year
    }

    const [
      totalDoctors,
      totalClinics,
      totalPharmacies,
      totalPathologies,
      totalDepartments,
      totalUsers,
      totalAmbulances,
      totalBookings,
      completedBookings,
      pendingBookings,
      periodDoctors,
      periodClinics,
      periodPharmacies,
      periodPatients,
      periodBookings,
    ] = await Promise.all([
      Doctor.countDocuments({ isActive: true }),
      Clinic.countDocuments({ isActive: true }),
      Pharmacy.countDocuments({ isActive: true }),
      Pathology.countDocuments({ isActive: true }),
      Department.countDocuments({ isActive: true }),
      User.countDocuments({ role: "user", isActive: true }),
      Ambulance.countDocuments({ isActive: true }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: "completed" }),
      Booking.countDocuments({ status: "pending" }),
      Doctor.countDocuments({
        isActive: true,
        createdAt: { $gte: dateRange },
      }),
      Clinic.countDocuments({
        isActive: true,
        createdAt: { $gte: dateRange },
      }),
      Pharmacy.countDocuments({
        isActive: true,
        createdAt: { $gte: dateRange },
      }),
      User.countDocuments({
        role: "user",
        isActive: true,
        createdAt: { $gte: dateRange },
      }),
      Booking.countDocuments({
        createdAt: { $gte: dateRange },
      }),
    ]);

    // Calculate growth percentages
    const stats = {
      totalDoctors,
      totalClinics,
      totalPharmacies,
      totalPathologies,
      totalDepartments,
      totalUsers,
      totalPatients: totalUsers, // Add this line - patients are users with role "user"
      totalAmbulances,
      totalBookings,
      completedBookings,
      pendingBookings,
      periodStats: {
        doctors: periodDoctors,
        clinics: periodClinics,
        pharmacies: periodPharmacies,
        patients: periodPatients,
        bookings: periodBookings,
      },
      growth: {
        doctors:
          totalDoctors > 0
            ? Math.round((periodDoctors / totalDoctors) * 100)
            : 0,
        clinics:
          totalClinics > 0
            ? Math.round((periodClinics / totalClinics) * 100)
            : 0,
        pharmacies:
          totalPharmacies > 0
            ? Math.round((periodPharmacies / totalPharmacies) * 100)
            : 0,
        patients:
          totalUsers > 0 ? Math.round((periodPatients / totalUsers) * 100) : 0,
        bookings:
          totalBookings > 0
            ? Math.round((periodBookings / totalBookings) * 100)
            : 0,
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics",
      error: error.message,
    });
  }
});

// Get real-time activity feed
router.get("/realtime-activity", adminAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const activities = await Activity.find()
      .populate("user", "firstName lastName username role")
      .populate("targetId")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const formattedActivities = activities.map((activity) => ({
      id: activity._id,
      type: activity.type,
      message: activity.message,
      user: activity.user
        ? {
            name: `${activity.user.firstName} ${activity.user.lastName}`,
            username: activity.user.username,
            role: activity.user.role,
          }
        : null,
      targetModel: activity.targetModel,
      timestamp: activity.createdAt,
      ipAddress: activity.ipAddress,
    }));

    res.json({
      success: true,
      data: { activities: formattedActivities },
    });
  } catch (error) {
    console.error("Real-time activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch real-time activity",
      error: error.message,
    });
  }
});

// Get department statistics
router.get("/departments", adminAuth, async (req, res) => {
  try {
    const departments = await Department.aggregate([
      { $match: { isActive: true } },
      {
        $lookup: {
          from: "doctors",
          localField: "_id",
          foreignField: "department",
          as: "doctors",
        },
      },
      {
        $project: {
          name: 1,
          heading: 1,
          doctorCount: { $size: "$doctors" },
          isActive: 1,
          createdAt: 1,
        },
      },
      { $sort: { doctorCount: -1 } },
    ]);

    res.json({
      success: true,
      data: { departments },
    });
  } catch (error) {
    console.error("Department stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch department statistics",
      error: error.message,
    });
  }
});

// Get doctor registration statistics
router.get("/doctors", adminAuth, async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    let dateRange, groupBy;
    const now = new Date();

    if (period === "weekly") {
      dateRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy = {
        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
      };
    } else {
      dateRange = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      groupBy = {
        $dateToString: { format: "%Y-%m", date: "$createdAt" },
      };
    }

    const doctorStats = await Doctor.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange },
        },
      },
      {
        $group: {
          _id: groupBy,
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.json({
      success: true,
      data: { doctorStats },
    });
  } catch (error) {
    console.error("Doctor stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor statistics",
      error: error.message,
    });
  }
});

// Get registration trends
router.get("/registrations", adminAuth, async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    let dateRange, groupBy;
    const now = new Date();

    if (period === "weekly") {
      dateRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupBy = {
        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
      };
    } else {
      dateRange = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      groupBy = {
        $dateToString: { format: "%Y-%m", date: "$createdAt" },
      };
    }

    // Get registration trends for all entities
    const [doctorTrends, clinicTrends, pharmacyTrends, patientTrends] =
      await Promise.all([
        Doctor.aggregate([
          { $match: { createdAt: { $gte: dateRange } } },
          { $group: { _id: groupBy, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Clinic.aggregate([
          { $match: { createdAt: { $gte: dateRange } } },
          { $group: { _id: groupBy, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Pharmacy.aggregate([
          { $match: { createdAt: { $gte: dateRange } } },
          { $group: { _id: groupBy, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        User.aggregate([
          { $match: { createdAt: { $gte: dateRange }, role: "user" } },
          { $group: { _id: groupBy, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
      ]);

    // Combine trends
    const combinedTrends = {};

    // Process each trend
    [doctorTrends, clinicTrends, pharmacyTrends, patientTrends].forEach(
      (trends, index) => {
        const keys = ["doctors", "clinics", "pharmacies", "patients"];
        trends.forEach((trend) => {
          if (!combinedTrends[trend._id]) {
            combinedTrends[trend._id] = {
              date: trend._id,
              doctors: 0,
              clinics: 0,
              pharmacies: 0,
              patients: 0,
            };
          }
          combinedTrends[trend._id][keys[index]] = trend.count;
        });
      }
    );

    const registrationStats = Object.values(combinedTrends).map((stat) => ({
      ...stat,
      total: stat.doctors + stat.clinics + stat.pharmacies + stat.patients,
    }));

    res.json({
      success: true,
      data: { registrationStats },
    });
  } catch (error) {
    console.error("Registration trends error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch registration trends",
      error: error.message,
    });
  }
});

// Get recent activity
router.get("/activity", adminAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const activities = await Activity.find()
      .populate("user", "firstName lastName username")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // If no activities in database, return mock data
    if (activities.length === 0) {
      const mockActivities = [
        {
          id: 1,
          type: "doctor_added",
          message: "Dr. Sarah Johnson was added to Cardiology department",
          user: "Admin User",
          timestamp: new Date(Date.now() - 1000 * 60 * 30),
        },
        {
          id: 2,
          type: "appointment_booked",
          message: "New appointment booked with Dr. Michael Brown",
          user: "John Doe",
          timestamp: new Date(Date.now() - 1000 * 60 * 60),
        },
        {
          id: 3,
          type: "clinic_registered",
          message: "City Care Clinic registered successfully",
          user: "System",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
        },
        {
          id: 4,
          type: "pharmacy_added",
          message: "MedPlus Pharmacy added to network",
          user: "Admin User",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
        },
        {
          id: 5,
          type: "user_registered",
          message: "New user registration: Alice Smith",
          user: "System",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4),
        },
        {
          id: 6,
          type: "doctor_updated",
          message: "Dr. Robert Wilson updated profile information",
          user: "Dr. Robert Wilson",
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
        },
      ];

      return res.json({
        success: true,
        data: { activities: mockActivities },
      });
    }

    // Format real activities
    const formattedActivities = activities.map((activity) => ({
      id: activity._id,
      type: activity.type,
      message: activity.message,
      user: activity.user
        ? `${activity.user.firstName} ${activity.user.lastName}`
        : "System",
      timestamp: activity.createdAt,
    }));

    res.json({
      success: true,
      data: { activities: formattedActivities },
    });
  } catch (error) {
    console.error("Recent activity error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent activity",
      error: error.message,
    });
  }
});

// Get booking analytics
router.get("/bookings", adminAuth, async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    let dateRange;
    const now = new Date();

    if (period === "weekly") {
      dateRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      dateRange = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    }

    const bookingStats = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: period === "weekly" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt",
              },
            },
            status: "$status",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          bookings: {
            $push: {
              status: "$_id.status",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.json({
      success: true,
      data: { bookingStats },
    });
  } catch (error) {
    console.error("Booking analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch booking analytics",
      error: error.message,
    });
  }
});

module.exports = router;
