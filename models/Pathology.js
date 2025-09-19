const mongoose = require("mongoose");

const pathologySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    testCode: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    sampleType: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    turnaroundTime: { type: String, default: "24 hours", trim: true },
    preparation: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    isPackage: { type: Boolean, default: false },
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
    address: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zipCode: { type: String, required: true, trim: true },
    country: { type: String, default: "India", trim: true },
  },
  {
    timestamps: true,
  }
);

// Text index for search
pathologySchema.index({
  name: "text",
  description: "text",
  category: "text",
  address: "text",
  place: "text",
  state: "text",
});

module.exports = mongoose.model("Pathology", pathologySchema);
