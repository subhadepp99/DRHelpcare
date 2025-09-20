const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
      length: 4,
    },
    type: {
      type: String,
      enum: ["login", "password_reset", "verification", "change_password"],
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
      max: 3,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
otpSchema.index({ identifier: 1, type: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Method to check if OTP is expired
otpSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

// Method to check if OTP is valid
otpSchema.methods.isValid = function () {
  return !this.isExpired() && !this.isUsed && this.attempts < 3;
};

// Method to mark OTP as used
otpSchema.methods.markAsUsed = function () {
  this.isUsed = true;
  return this.save();
};

// Method to increment attempts
otpSchema.methods.incrementAttempts = function () {
  this.attempts += 1;
  return this.save();
};

module.exports = mongoose.model("OTP", otpSchema);
