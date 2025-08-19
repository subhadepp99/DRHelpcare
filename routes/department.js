const express = require("express");
const Department = require("../models/Department");
const { auth, adminAuth } = require("../middleware/auth");

const router = express.Router();

// Get all departments (admin and above only)
router.get("/", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "" } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { heading: new RegExp(search, "i") },
        { specialization: new RegExp(search, "i") },
      ];
    }

    const [departments, total] = await Promise.all([
      Department.find(query)
        .populate("doctors", "name specialization")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Department.countDocuments(query),
    ]);

    // Add doctor count to each department
    const departmentsWithCount = departments.map((dept) => ({
      ...dept.toObject(),
      doctorCount: dept.doctors.length,
    }));

    res.json({
      success: true,
      data: {
        departments: departmentsWithCount,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
      error: error.message,
    });
  }
});

// Get department by ID (admin and above only)
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const department = await Department.findById(req.params.id).populate(
      "doctors",
      "name specialization email phone"
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.json({
      success: true,
      data: department,
    });
  } catch (error) {
    console.error("Get department error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch department",
      error: error.message,
    });
  }
});

// Create new department (admin and above only)
router.post("/", adminAuth, async (req, res) => {
  try {
    const department = new Department(req.body);
    await department.save();

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: department,
    });
  } catch (error) {
    console.error("Create department error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create department",
      error: error.message,
    });
  }
});

// Update department (admin and above only)
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    res.json({
      success: true,
      message: "Department updated successfully",
      data: department,
    });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update department",
      error: error.message,
    });
  }
});

// Delete department (admin and above only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Check if department has doctors
    if (department.doctors && department.doctors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete department with assigned doctors",
      });
    }

    await Department.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Delete department error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete department",
      error: error.message,
    });
  }
});

module.exports = router;
