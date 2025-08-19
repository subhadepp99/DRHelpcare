const mongoose = require("mongoose");

const accessRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedRole: {
      type: String,
      enum: ["admin", "superuser", "masteruser"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
    rejectionReason: String,
    additionalNotes: String,
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
accessRequestSchema.index({ status: 1, createdAt: -1 });
accessRequestSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model("AccessRequest", accessRequestSchema);
