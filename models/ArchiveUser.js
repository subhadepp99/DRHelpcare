const mongoose = require("mongoose");

const archiveUserSchema = new mongoose.Schema(
  {
    originalId: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "superuser", "masteruser"],
      default: "user",
    },
    profileImage: {
      data: Buffer,
      contentType: String,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: "India" },
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    lastLogin: Date,
    preferences: {
      notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
      },
      theme: { type: String, default: "light" },
    },
    // Access request fields
    accessRequest: {
      requestedRole: {
        type: String,
        enum: ["admin", "superuser", "masteruser"],
      },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
      },
      requestedAt: Date,
      reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reviewedAt: Date,
      reason: String,
      rejectionReason: String,
    },
    // Archive specific fields
    deletedAt: {
      type: Date,
      default: Date.now,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    deletionReason: {
      type: String,
      default: "User requested deletion",
    },
    originalData: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
archiveUserSchema.index({ originalId: 1 });
archiveUserSchema.index({ email: 1 });
archiveUserSchema.index({ username: 1 });
archiveUserSchema.index({ deletedAt: 1 });

module.exports = mongoose.model("ArchiveUser", archiveUserSchema);
