const mongoose = require("mongoose");

const faqSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["doctor", "clinic", "pathology", "ambulance", "doctor_search"],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: function () {
        return this.entityType !== "doctor_search"; // search page FAQs are global for type
      },
      index: true,
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FAQ", faqSchema);
