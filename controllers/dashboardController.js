const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");
const Patient = require("../models/Patient");
const User = require("../models/User");

exports.getDashboardStats = async (req, res) => {
  try {
    const totalDoctors = await Doctor.countDocuments({ isActive: true });
    const totalClinics = await Clinic.countDocuments({ isActive: true });
    const totalPharmacies = await Pharmacy.countDocuments({ isActive: true });
    const totalPatients = await Patient.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments({ isActive: true });

    res.json({
      totalDoctors,
      totalClinics,
      totalPharmacies,
      totalPatients,
      totalUsers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
};

exports.getDoctorStats = async (req, res) => {
  try {
    const { period = "weekly" } = req.query;

    let dateRange;
    const now = new Date();

    if (period === "weekly") {
      dateRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "monthly") {
      dateRange = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      return res
        .status(400)
        .json({ message: "Invalid period. Use weekly or monthly" });
    }

    const doctorStats = await Doctor.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange },
          isActive: true,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === "weekly" ? "%Y-%m-%d" : "%Y-%m",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const specializations = await Doctor.aggregate([
      {
        $match: { isActive: true },
      },
      {
        $group: {
          _id: "$specialization",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    res.json({
      period,
      doctorStats,
      specializations,
      totalDoctors: await Doctor.countDocuments({ isActive: true }),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching doctor statistics" });
  }
};

exports.getRegistrationStats = async (req, res) => {
  try {
    const { period = "monthly" } = req.query;

    let dateRange;
    const now = new Date();

    if (period === "weekly") {
      dateRange = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "monthly") {
      dateRange = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      return res
        .status(400)
        .json({ message: "Invalid period. Use weekly or monthly" });
    }

    const registrationStats = await Promise.all([
      Doctor.aggregate([
        {
          $match: {
            createdAt: { $gte: dateRange },
            isActive: true,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: period === "weekly" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt",
              },
            },
            doctors: { $sum: 1 },
          },
        },
      ]),
      Clinic.aggregate([
        {
          $match: {
            createdAt: { $gte: dateRange },
            isActive: true,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: period === "weekly" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt",
              },
            },
            clinics: { $sum: 1 },
          },
        },
      ]),
      Pharmacy.aggregate([
        {
          $match: {
            createdAt: { $gte: dateRange },
            isActive: true,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: period === "weekly" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt",
              },
            },
            pharmacies: { $sum: 1 },
          },
        },
      ]),
      Patient.aggregate([
        {
          $match: {
            createdAt: { $gte: dateRange },
            isActive: true,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: period === "weekly" ? "%Y-%m-%d" : "%Y-%m",
                date: "$createdAt",
              },
            },
            patients: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Combine all stats by date
    const combinedStats = {};

    registrationStats.forEach((statArray, index) => {
      const type = ["doctors", "clinics", "pharmacies", "patients"][index];
      statArray.forEach((stat) => {
        if (!combinedStats[stat._id]) {
          combinedStats[stat._id] = { date: stat._id };
        }
        combinedStats[stat._id][type] = stat[type] || 0;
      });
    });

    const result = Object.values(combinedStats).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    res.json({
      period,
      registrationStats: result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching registration statistics" });
  }
};
