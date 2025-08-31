const mongoose = require("mongoose");

const pathologySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      min: 0,
    },
    isPackage: {
      type: Boolean,
      default: false,
    },
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: {
      type: String,
      trim: true,
    }, // Kept for backward compatibility
    preparationInstructions: {
      type: String,
      trim: true,
    },
    reportTime: {
      type: String,
      default: "24 hours",
      trim: true,
    },
    homeCollection: {
      type: Boolean,
      default: false,
    },
    licenseNumber: {
      type: String,
      sparse: true,
      set: function (val) {
        return val === "" ? undefined : val;
      },
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    place: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    zipCode: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      default: "India",
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    operatingHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String },
    },
    services: [String],
    facilities: [String],
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    reviews: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        comment: String,
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    // Add missing fields that might be used by the frontend
    testsOffered: [
      {
        name: String,
        price: Number,
        description: String,
        imageUrl: String,
      },
    ],
    servicesOffered: [String],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial index removed - using simple address fields

// Create text index for search
pathologySchema.index({
  name: "text",
  description: "text",
  category: "text",
  address: "text",
  place: "text",
  state: "text",
});

module.exports = mongoose.model("Pathology", pathologySchema);
