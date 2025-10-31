const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pathology = require("../models/Pathology");
const Ambulance = require("../models/Ambulance");
const { auth } = require("../middleware/auth");

// Get reviews for an entity
router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const reviews = await Review.find({
      entityType,
      entityId,
      isApproved: true,
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select("rating comment userName createdAt");

    const total = await Review.countDocuments({
      entityType,
      entityId,
      isApproved: true,
      isActive: true,
    });

    // Calculate average rating
    const avgResult = await Review.aggregate([
      {
        $match: {
          entityType,
          entityId: new mongoose.Types.ObjectId(entityId),
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

    const stats = avgResult[0] || { averageRating: 0, totalReviews: 0 };

    res.json({
      success: true,
      data: {
        reviews,
        stats: {
          averageRating: Math.round(stats.averageRating * 10) / 10,
          totalReviews: stats.totalReviews,
        },
        pagination: {
          current: parseInt(page),
          total: Math.ceil(total / limit),
          totalItems: total,
        },
      },
    });
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
});

// Add missing mongoose import
const mongoose = require("mongoose");

// Create a review (requires authentication)
router.post("/", auth, async (req, res) => {
  try {
    const { entityType, entityId, rating, comment } = req.body;

    // Validate required fields
    if (!entityType || !entityId || !rating) {
      return res.status(400).json({
        success: false,
        message: "Entity type, entity ID, and rating are required",
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Verify entity exists
    let entity;
    switch (entityType) {
      case "Doctor":
        entity = await Doctor.findById(entityId);
        break;
      case "Clinic":
        entity = await Clinic.findById(entityId);
        break;
      case "Pathology":
        entity = await Pathology.findById(entityId);
        break;
      case "Ambulance":
        entity = await Ambulance.findById(entityId);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid entity type",
        });
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: `${entityType} not found`,
      });
    }

    // Check if user already reviewed this entity
    const existingReview = await Review.findOne({
      userId: req.user.id,
      entityType,
      entityId,
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message:
          "You have already reviewed this entity. Please update your existing review.",
      });
    }

    // Create review
    const review = new Review({
      entityType,
      entityId,
      userId: req.user.id,
      userName: `${req.user.firstName} ${req.user.lastName}`,
      rating,
      comment,
    });

    await review.save();

    res.status(201).json({
      success: true,
      message: "Review added successfully",
      data: review,
    });
  } catch (error) {
    console.error("Create review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
});

// Update a review (requires authentication)
router.put("/:id", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check if user owns this review
    if (review.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own reviews",
      });
    }

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Update review
    if (rating) review.rating = rating;
    if (comment !== undefined) review.comment = comment;

    await review.save();

    res.json({
      success: true,
      message: "Review updated successfully",
      data: review,
    });
  } catch (error) {
    console.error("Update review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update review",
      error: error.message,
    });
  }
});

// Delete a review (requires authentication)
router.delete("/:id", auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    // Check if user owns this review or is admin
    if (
      review.userId.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superuser"
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own reviews",
      });
    }

    await review.deleteOne();

    res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete review",
      error: error.message,
    });
  }
});

// Get user's review for a specific entity (requires authentication)
router.get("/user/:entityType/:entityId", auth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    const review = await Review.findOne({
      userId: req.user.id,
      entityType,
      entityId,
    });

    res.json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error("Get user review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user review",
      error: error.message,
    });
  }
});

module.exports = router;
