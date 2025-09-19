const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    imageUrl: { type: String, required: true },
    image: {
      data: String, // legacy/path string if ever needed
      contentType: String,
    },
    linkUrl: { type: String, trim: true },
    placement: { type: String, trim: true, default: "home" }, // e.g., home, pathology
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bannerSchema.index({ placement: 1, order: 1, createdAt: -1 });

module.exports = mongoose.model("Banner", bannerSchema);
