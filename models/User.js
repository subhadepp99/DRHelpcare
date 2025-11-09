const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true, // Allow multiple null/undefined values
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
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
      unique: true,
    },
    role: {
      type: String,
      enum: [
        "user",
        "doctor",
        "clinic",
        "admin",
        "superuser",
        "masteruser",
        "userDoctor",
        "userClinic",
      ],
      default: "user",
    },
    profileImage: {
      data: Buffer,
      contentType: String,
    },
    profileImageUrl: {
      type: String,
      trim: true,
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
      default: true,
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
  },
  {
    timestamps: true,
  }
);

// Update last login
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save();
};

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
