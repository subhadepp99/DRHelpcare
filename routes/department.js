const express = require("express");
const multer = require("multer");
const Department = require("../models/Department");
const Doctor = require("../models/Doctor");
const { auth, adminAuth, superuserAuth } = require("../middleware/auth");

const router = express.Router();

// Configure multer for image uploads to memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Get all departments (public route for homepage)
router.get("/public", async (req, res) => {
  try {
    const { page = 1, limit = 100, search = "" } = req.query;
    const skip = (page - 1) * limit;

    let query = { isActive: true }; // Only active departments
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { heading: new RegExp(search, "i") },
        { specialization: new RegExp(search, "i") },
      ];
    }

    const [departments, total, doctorCounts] = await Promise.all([
      Department.find(query)
        .populate("doctors", "name specialization")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Department.countDocuments(query),
      Doctor.aggregate([
        { $match: { isActive: true, department: { $ne: null } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(doctorCounts.map((d) => [String(d._id), d.count]));

    const departmentsWithCount = departments.map((dept) => ({
      ...dept.toObject(),
      doctorCount: countMap.get(String(dept._id)) || 0,
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
    console.error("Get public departments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch departments",
      error: error.message,
    });
  }
});

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

    const [departments, total, doctorCounts] = await Promise.all([
      Department.find(query)
        .populate("doctors", "name specialization")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Department.countDocuments(query),
      Doctor.aggregate([
        { $match: { isActive: true, department: { $ne: null } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(doctorCounts.map((d) => [String(d._id), d.count]));

    const departmentsWithCount = departments.map((dept) => ({
      ...dept.toObject(),
      doctorCount: countMap.get(String(dept._id)) || 0,
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
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    // Ensure department name starts with capital letter
    const departmentData = {
      ...req.body,
      name: req.body.name.charAt(0).toUpperCase() + req.body.name.slice(1),
    };

    // Store image in DB if uploaded
    if (req.file && req.file.buffer) {
      departmentData.image = {
        data: req.file.buffer.toString("base64"),
        contentType: req.file.mimetype,
      };
      departmentData.imageUrl = undefined;
    } else if (req.body.imageUrl) {
      departmentData.imageUrl = req.body.imageUrl;
    }

    const department = new Department(departmentData);
    await department.save();

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: department,
    });
  } catch (error) {
    console.error("Create department error:", error);

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
      message: "Failed to create department",
      error: error.message,
    });
  }
});

// Update department (admin and above only)
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    // Ensure department name starts with capital letter
    const updateData = {
      ...req.body,
      name: req.body.name.charAt(0).toUpperCase() + req.body.name.slice(1),
    };

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    // Handle image update
    if (req.file && req.file.buffer) {
      updateData.image = {
        data: req.file.buffer.toString("base64"),
        contentType: req.file.mimetype,
      };
      updateData.imageUrl = undefined;
    } else if (req.body.imageUrl) {
      updateData.imageUrl = req.body.imageUrl;
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Department updated successfully",
      data: updatedDepartment,
    });
  } catch (error) {
    console.error("Update department error:", error);

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
      message: "Failed to update department",
      error: error.message,
    });
  }
});

// Sync department doctors (admin and above only)
router.post("/sync-doctors", adminAuth, async (req, res) => {
  try {
    //console.log("Starting department-doctors sync...");

    // Get all departments
    const departments = await Department.find({});
    //console.log(`Found ${departments.length} departments`);

    // Clear all department doctors arrays first
    await Department.updateMany({}, { $set: { doctors: [] } });
    //console.log("Cleared all department doctors arrays");

    // Get all active doctors
    const Doctor = require("../models/Doctor");
    const doctors = await Doctor.find({ isActive: true });
    //console.log(`Found ${doctors.length} active doctors`);

    // Group doctors by department
    const departmentDoctors = {};
    for (const doctor of doctors) {
      if (doctor.department) {
        const deptId = doctor.department.toString();
        if (!departmentDoctors[deptId]) {
          departmentDoctors[deptId] = [];
        }
        departmentDoctors[deptId].push(doctor._id);
      }
    }

    // Update each department with its doctors
    for (const [deptId, doctorIds] of Object.entries(departmentDoctors)) {
      await Department.findByIdAndUpdate(deptId, {
        $set: { doctors: doctorIds },
      });
      console.log(
        `Updated department ${deptId} with ${doctorIds.length} doctors`
      );
    }

    res.json({
      success: true,
      message: "Department-doctors sync completed successfully",
      syncedDepartments: Object.keys(departmentDoctors).length,
      totalDoctors: doctors.length,
    });
  } catch (error) {
    console.error("Error syncing department-doctors:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync department-doctors",
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
