const express = require("express");
const User = require("../models/User");
const { auth, adminAuth } = require("../middleware/auth");

const router = express.Router();

// Get all patients (admin and above only)
router.get("/", adminAuth, async (req, res) => {
  try {
    const {
      sort = "lastActivity",
      order = "desc",
      page = 1,
      limit = 12,
      search = "",
    } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 12, 1), 100);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    const query = { role: "user" };

    if (search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
        { city: regex },
        { state: regex },
        { "address.city": regex },
        { "address.state": regex },
      ];
    }

    let sortQuery = {};
    if (sort === "lastActivity") {
      sortQuery = { lastActivity: order === "desc" ? -1 : 1 };
    } else if (sort === "name") {
      sortQuery = {
        firstName: order === "desc" ? -1 : 1,
        lastName: order === "desc" ? -1 : 1,
      };
    } else if (sort === "createdAt") {
      sortQuery = { createdAt: order === "desc" ? -1 : 1 };
    }

    const [patients, total] = await Promise.all([
      User.find(query)
        .select(
          "firstName lastName email phone address city state createdAt lastActivity lastAppointment"
        )
        .sort(sortQuery)
        .skip(skip)
        .limit(parsedLimit),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        patients,
        pagination: {
          current: parsedPage,
          total: Math.ceil(total / parsedLimit),
          totalItems: total,
          limit: parsedLimit,
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

// Get patient by ID (admin and above only)
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const patient = await User.findOne({
      _id: req.params.id,
      role: "user",
    }).select(
      "firstName lastName email phone address city state createdAt lastActivity lastAppointment"
    );

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    res.json({
      success: true,
      data: patient,
    });
  } catch (error) {
    console.error("Get patient error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch patient",
      error: error.message,
    });
  }
});

module.exports = router;
