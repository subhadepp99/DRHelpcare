const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      unique: true,
      required: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    clinic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Clinic",
    },
    appointmentDate: {
      type: Date,
      required: true,
    },
    appointmentTime: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "no_show"],
      default: "pending",
    },
    patientDetails: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: false }, // Made optional
      age: Number,
      gender: String,
    },
    symptoms: String,
    reasonForVisit: String,
    consultationFee: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "upi", "wallet", "cash"],
      default: "card",
    },
    paymentId: String,
    diagnosis: String,
    prescription: String,
    followUpDate: Date,
    notes: String,
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: String,
    isEmergency: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique booking ID
bookingSchema.pre("save", function (next) {
  if (!this.bookingId) {
    this.bookingId =
      "BK" + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

// Index for efficient queries
bookingSchema.index({ patient: 1, appointmentDate: 1 });
bookingSchema.index({ doctor: 1, appointmentDate: 1 });
bookingSchema.index({ status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
