const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g., 'cardiology'
    heading: { type: String }, // e.g., 'Cardiology'
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: { type: String }, // public URL for department image
    description: { type: String },
    specialization: { type: String, required: true }, // Map to doctor specialization
    doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Doctor" }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", DepartmentSchema);
