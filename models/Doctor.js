const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    specialization: {
      type: String,
      required: true,
      enum: [
        "Cardiology",
        "Dermatology",
        "Neurology",
        "Pediatrics",
        "Orthopedics",
        "Gynecology",
        "Psychiatry",
        "Radiology",
        "Anesthesiology",
        "Pathology",
        "Emergency",
        "General",
        "Others",
      ],
    },
    qualification: {
      type: String,
      required: true,
    },
    experience: {
      type: Number,
      required: true,
      min: 0,
    },
    licenseNumber: {
      type: String,
      required: true,
      unique: true,
    },
    department: { type: mongoose.Schema.Types.ObjectId, ref: "Department" },
    consultationFee: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      default: null,
    },
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: "India" },
    },
    clinics: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Clinic",
      },
    ],
    availability: [
      {
        day: {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
        slots: [
          {
            startTime: String,
            endTime: String,
            isAvailable: { type: Boolean, default: true },
          },
        ],
      },
    ],
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    reviews: [
      {
        patient: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: String,
        date: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    languages: [String],
    services: [String],
  },
  {
    timestamps: true,
  }
);

// Calculate average rating
doctorSchema.methods.calculateRating = function () {
  if (this.reviews.length === 0) {
    this.rating.average = 0;
    this.rating.count = 0;
  } else {
    const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
    this.rating.average = (sum / this.reviews.length).toFixed(1);
    this.rating.count = this.reviews.length;
  }
  return this.save();
};

// Search index
doctorSchema.index({
  name: "text",
  specialization: "text",
  "address.city": "text",
});

// Geospatial index for location-based search
doctorSchema.index({ "address.location": "2dsphere" });

module.exports = mongoose.model("Doctor", doctorSchema);
