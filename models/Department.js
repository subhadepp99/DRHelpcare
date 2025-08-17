const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g., 'cardiology'
    heading: { type: String }, // e.g., 'Cardiology'
    imageUrl: { type: String }, // public URL for department image
    description: { type: String },
    doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "Doctor" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", DepartmentSchema);
