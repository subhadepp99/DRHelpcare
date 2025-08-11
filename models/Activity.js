const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "doctor_added",
        "doctor_updated",
        "doctor_deleted",
        "clinic_added",
        "clinic_updated",
        "clinic_deleted",
        "pharmacy_added",
        "pharmacy_updated",
        "pharmacy_deleted",
        "user_registered",
        "user_updated",
        "user_deleted",
        "appointment_booked",
        "appointment_cancelled",
        "appointment_completed",
        "admin_login",
        "system_update",
      ],
    },
    message: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    targetId: mongoose.Schema.Types.ObjectId,
    targetModel: String,
    metadata: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
activitySchema.index({ createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("Activity", activitySchema);
