const mongoose = require("mongoose");

const testSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    testCode: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    sampleType: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    discountedPrice: { type: Number, min: 0 },
    turnaroundTime: { type: String, default: "24 hours", trim: true },
    preparationInstructions: { type: String, trim: true },
    reportTime: { type: String, default: "24 hours", trim: true },
    isActive: { type: Boolean, default: true },
    image: { data: Buffer, contentType: String },
    imageUrl: { type: String, trim: true },
    components: [
      {
        name: { type: String, required: true },
        unit: { type: String },
        referenceRange: { type: String },
      },
    ],
    homeCollection: {
      available: { type: Boolean, default: false },
      fee: { type: Number, default: 0 },
      areas: [String],
      timing: {
        start: { type: String, default: "" },
        end: { type: String, default: "" },
      },
    },
    // Reference to pathology lab
    pathologyLab: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pathology",
      required: true,
    },
    // Location information
    address: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    country: { type: String, default: "India", trim: true },
    // Contact information
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
  },
  {
    timestamps: true,
  }
);

// Text index for search
testSchema.index({
  name: "text",
  description: "text",
  category: "text",
  sampleType: "text",
});

// Index for efficient queries
testSchema.index({ pathologyLab: 1 });
testSchema.index({ category: 1 });
testSchema.index({ isActive: 1 });

module.exports = mongoose.model("Test", testSchema);
