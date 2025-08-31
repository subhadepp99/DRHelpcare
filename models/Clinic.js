const mongoose = require("mongoose");

const clinicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    registrationNumber: {
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
        isClosed: { type: Boolean, default: true },
      },
    },
    services: [String],
    facilities: [String],
    // Updated doctors field to include more details
    doctors: [
      {
        doctor: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Doctor",
          required: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        consultationFee: {
          type: Number,
          min: 0,
        },
        availableDays: [String], // Days when doctor is available at this clinic
        availableSlots: [
          {
            startTime: String,
            endTime: String,
            isAvailable: { type: Boolean, default: true },
          },
        ],
        joinedDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: String, // Public URL for clinic image (kept for backward compatibility)
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
    type: {
      type: String,
      enum: ["hospital", "clinic", "diagnostic_center", "pharmacy"],
      default: "clinic",
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for doctor count
clinicSchema.virtual("doctorCount").get(function () {
  return this.doctors ? this.doctors.length : 0;
});

// Method to get active doctors count
clinicSchema.methods.getActiveDoctorCount = function () {
  return this.doctors.filter((doctor) => doctor.isActive).length;
};

// Method to get all doctors with details
clinicSchema.methods.getDoctorsWithDetails = function () {
  return this.doctors.filter((doctor) => doctor.isActive);
};

// Method to add doctor to clinic
clinicSchema.methods.addDoctor = function (
  doctorId,
  consultationFee = null,
  availableDays = []
) {
  const existingDoctor = this.doctors.find(
    (d) => d.doctor.toString() === doctorId.toString()
  );

  if (existingDoctor) {
    // Update existing doctor details
    if (consultationFee !== null)
      existingDoctor.consultationFee = consultationFee;
    if (availableDays.length > 0) existingDoctor.availableDays = availableDays;
    existingDoctor.isActive = true;
  } else {
    // Add new doctor
    this.doctors.push({
      doctor: doctorId,
      consultationFee,
      availableDays,
      isActive: true,
      joinedDate: new Date(),
    });
  }

  return this.save();
};

// Method to remove doctor from clinic
clinicSchema.methods.removeDoctor = function (doctorId) {
  const doctorIndex = this.doctors.findIndex(
    (d) => d.doctor.toString() === doctorId.toString()
  );

  if (doctorIndex !== -1) {
    this.doctors[doctorIndex].isActive = false;
    return this.save();
  }

  return this;
};

// Search index
clinicSchema.index({
  name: "text",
  services: "text",
  "address.city": "text",
});

// Ensure virtual fields are serialized
clinicSchema.set("toJSON", { virtuals: true });
clinicSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Clinic", clinicSchema);
