const mongoose = require("mongoose");

const pathologySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    licenseNumber: {
      type: String,
      required: false, // Made optional
      unique: true,
      sparse: true, // Allow multiple null values
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
    },
    address: {
      type: String,
      required: true,
    },
    place: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      default: "India",
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere",
    },
    operatingHours: {
      monday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
      tuesday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
      wednesday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
      thursday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
      friday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
      saturday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
      sunday: {
        open: String,
        close: String,
        isClosed: { type: Boolean, default: false },
      },
    },
    servicesOffered: [String],
    testsOffered: [
      {
        name: String,
        category: String,
        price: Number,
        discountedPrice: Number,
        discountType: {
          type: String,
          enum: ["percentage", "flat"],
          default: "flat",
        },
        discountValue: Number, // percentage or flat amount
        requiresPrescription: { type: Boolean, default: false },
        image: {
          data: Buffer,
          contentType: String,
        },
        imageUrl: String,
        description: String,
        preparationInstructions: String,
        reportTime: String, // e.g., "24 hours", "Same day"
        isHomeCollection: { type: Boolean, default: false },
        homeCollectionFee: { type: Number, default: 0 },
      },
    ],
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: String,
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
    is24Hours: {
      type: Boolean,
      default: false,
    },
    homeCollection: {
      available: { type: Boolean, default: false },
      fee: { type: Number, default: 0 },
      areas: [String], // Areas where home collection is available
      timing: {
        start: String,
        end: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Search index
pathologySchema.index({
  name: "text",
  "address.city": "text",
  servicesOffered: "text",
  "testsOffered.name": "text",
});

module.exports = mongoose.model("Pathology", pathologySchema);
