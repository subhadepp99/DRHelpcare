const mongoose = require("mongoose");

const ambulanceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    driverName: {
      type: String,
      required: true,
      trim: true,
    },
    driverPhone: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: false,
      trim: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere",
      default: [0, 0],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: String, // Public URL for the image
    isActive: {
      type: Boolean,
      default: true,
    },
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
  },
  {
    timestamps: true,
  }
);

// Index for search optimization
ambulanceSchema.index({ name: "text", city: "text", location: "text" });

module.exports = mongoose.model("Ambulance", ambulanceSchema);
