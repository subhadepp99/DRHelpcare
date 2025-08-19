const express = require("express");
const AccessRequest = require("../models/AccessRequest");
const User = require("../models/User");
const {
  auth,
  adminAuth,
  superuserAuth,
  masteruserAuth,
} = require("../middleware/auth");
const { createActivity } = require("../utils/activity");

const router = express.Router();

// Create access request (any authenticated user)
router.post("/", auth, async (req, res) => {
  try {
    const { requestedRole, reason } = req.body;

    if (!requestedRole || !reason) {
      return res.status(400).json({
        success: false,
        message: "Requested role and reason are required",
      });
    }

    // Check if user already has a pending request
    const existingRequest = await AccessRequest.findOne({
      user: req.user.id,
      status: "pending",
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending access request",
      });
    }

    // Check if user is requesting a role they already have or lower
    const userRoleHierarchy = {
      user: 0,
      admin: 1,
      superuser: 2,
      masteruser: 3,
    };

    if (userRoleHierarchy[req.user.role] >= userRoleHierarchy[requestedRole]) {
      return res.status(400).json({
        success: false,
        message:
          "You cannot request a role equal to or lower than your current role",
      });
    }

    const accessRequest = new AccessRequest({
      user: req.user.id,
      requestedRole,
      reason,
    });

    await accessRequest.save();

    // Create activity log
    await createActivity({
      type: "access_request_created",
      message: `User ${req.user.username} requested ${requestedRole} access`,
      user: req.user.id,
      targetId: accessRequest._id,
      targetModel: "AccessRequest",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.status(201).json({
      success: true,
      message: "Access request submitted successfully",
      data: accessRequest,
    });
  } catch (error) {
    console.error("Create access request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create access request",
      error: error.message,
    });
  }
});

// Get all access requests (superuser and masteruser only)
router.get("/", superuserAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    const [accessRequests, total] = await Promise.all([
      AccessRequest.find(query)
        .populate("user", "firstName lastName username email role")
        .populate("reviewedBy", "firstName lastName username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AccessRequest.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        accessRequests,
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error("Get access requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch access requests",
      error: error.message,
    });
  }
});

// Get user's own access requests
router.get("/my-requests", auth, async (req, res) => {
  try {
    const accessRequests = await AccessRequest.find({ user: req.user.id })
      .populate("reviewedBy", "firstName lastName username")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: accessRequests,
    });
  } catch (error) {
    console.error("Get my access requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch your access requests",
      error: error.message,
    });
  }
});

// Review access request (superuser and masteruser only)
router.patch("/:id/review", superuserAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, additionalNotes } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'approved' or 'rejected'",
      });
    }

    const accessRequest = await AccessRequest.findById(id).populate("user");
    if (!accessRequest) {
      return res.status(404).json({
        success: false,
        message: "Access request not found",
      });
    }

    if (accessRequest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Access request has already been reviewed",
      });
    }

    // Check if reviewer has permission to approve the requested role
    const reviewerRoleHierarchy = {
      admin: 1,
      superuser: 2,
      masteruser: 3,
    };

    const requestedRoleHierarchy = {
      admin: 1,
      superuser: 2,
      masteruser: 3,
    };

    if (
      reviewerRoleHierarchy[req.user.role] <=
      requestedRoleHierarchy[accessRequest.requestedRole]
    ) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to review this access request",
      });
    }

    // Update access request
    accessRequest.status = status;
    accessRequest.reviewedBy = req.user.id;
    accessRequest.reviewedAt = new Date();
    accessRequest.rejectionReason = rejectionReason;
    accessRequest.additionalNotes = additionalNotes;

    await accessRequest.save();

    // If approved, update user role
    if (status === "approved") {
      await User.findByIdAndUpdate(accessRequest.user._id, {
        role: accessRequest.requestedRole,
        "accessRequest.status": "approved",
        "accessRequest.reviewedBy": req.user.id,
        "accessRequest.reviewedAt": new Date(),
      });
    } else {
      // Update user's access request status
      await User.findByIdAndUpdate(accessRequest.user._id, {
        "accessRequest.status": "rejected",
        "accessRequest.reviewedBy": req.user.id,
        "accessRequest.reviewedAt": new Date(),
        "accessRequest.rejectionReason": rejectionReason,
      });
    }

    // Create activity log
    await createActivity({
      type: `access_request_${status}`,
      message: `Access request ${status} for user ${accessRequest.user.username}`,
      user: req.user.id,
      targetId: accessRequest._id,
      targetModel: "AccessRequest",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: `Access request ${status} successfully`,
      data: accessRequest,
    });
  } catch (error) {
    console.error("Review access request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to review access request",
      error: error.message,
    });
  }
});

// Delete access request (only the user who created it or superuser/masteruser)
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const accessRequest = await AccessRequest.findById(id);

    if (!accessRequest) {
      return res.status(404).json({
        success: false,
        message: "Access request not found",
      });
    }

    // Check if user can delete the request
    if (
      accessRequest.user.toString() !== req.user.id &&
      !["superuser", "masteruser"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this access request",
      });
    }

    await AccessRequest.findByIdAndDelete(id);

    // Create activity log
    await createActivity({
      type: "access_request_deleted",
      message: `Access request deleted by ${req.user.username}`,
      user: req.user.id,
      targetId: accessRequest._id,
      targetModel: "AccessRequest",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Access request deleted successfully",
    });
  } catch (error) {
    console.error("Delete access request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete access request",
      error: error.message,
    });
  }
});

module.exports = router;
