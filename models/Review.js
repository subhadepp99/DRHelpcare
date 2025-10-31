const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    // Entity details
    entityType: {
      type: String,
      required: true,
      enum: ["Doctor", "Clinic", "Pathology", "Ambulance"],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "entityType",
    },

    // User details
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: {
      type: String,
      required: true,
    },

    // Review details
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
    },

    // Status
    isApproved: {
      type: Boolean,
      default: true, // Auto-approve reviews, can be changed to false for moderation
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
reviewSchema.index({ entityType: 1, entityId: 1 });
reviewSchema.index({ userId: 1 });
reviewSchema.index({ isApproved: 1, isActive: 1 });

// Prevent duplicate reviews from same user for same entity
reviewSchema.index({ userId: 1, entityType: 1, entityId: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
