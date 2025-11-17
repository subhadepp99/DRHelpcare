const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
      unique: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    qualification: {
      type: String,
      required: true,
    },
    experience: {
      type: Number,
      required: true,
      min: 0,
    },
    licenseNumber: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    // New field: Doctor's bio/description
    bio: {
      type: String,
      required: false,
      trim: true,
      maxlength: 1000,
    },
    // New field: Doctor fees (consultation fee)
    doctorFees: {
      type: Number,
      required: true,
      min: 0,
    },
    // Keep existing consultationFee for backward compatibility
    consultationFee: {
      type: Number,
      required: false,
      min: 0,
    },
    image: {
      data: Buffer,
      contentType: String,
    },
    imageUrl: String, // Public URL for doctor image
    pinLocation: {
      type: String,
      required: false,
      trim: true,
    }, // Google Maps link or embed URL for location pinning
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: { type: String, default: "India" },
      location: {
        type: {
          type: String, // Don't do `{location: {type: String}}`.
          enum: ["Point"], // 'location.type' must be 'Point'
          default: "Point",
        },
        coordinates: {
          type: [Number],
          default: [0, 0], // Default coordinates to avoid geo index errors
          index: "2dsphere",
        },
      },
    },
    // Add state for easier filtering and display
    state: {
      type: String,
      required: true,
    },
    // Add city for easier filtering and display
    city: {
      type: String,
      required: true,
    },
    // New field: Available date and time for booking
    availableDateTime: [
      {
        day: {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
          required: true,
        },
        slots: [
          {
            startTime: {
              type: String,
              required: true,
              // Format: "HH:MM" (24-hour)
            },
            endTime: {
              type: String,
              required: true,
              // Format: "HH:MM" (24-hour)
            },
            isAvailable: {
              type: Boolean,
              default: true,
            },
            maxBookings: {
              type: Number,
              default: 1,
              min: 1,
            },
            currentBookings: {
              type: Number,
              default: 0,
              min: 0,
            },
          },
        ],
        isAvailable: {
          type: Boolean,
          default: true,
        },
      },
    ],
    // New field: Specific booking schedule with dates
    bookingSchedule: [
      {
        date: {
          type: Date,
          required: true,
        },
        isAvailable: {
          type: Boolean,
          default: true,
        },
        slots: [
          {
            startTime: {
              type: String,
              required: true,
            },
            endTime: {
              type: String,
              required: true,
            },
            isAvailable: {
              type: Boolean,
              default: true,
            },
            maxBookings: {
              type: Number,
              default: 1,
              min: 1,
            },
            currentBookings: {
              type: Number,
              default: 0,
              min: 0,
            },
          },
        ],
      },
    ],
    // Keep existing clinics array for backward compatibility
    clinics: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Clinic",
      },
    ],
    // New field: Detailed clinic information
    clinicDetails: [
      {
        clinic: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Clinic",
          required: true,
        },
        clinicName: String, // Cached clinic name for quick access
        clinicAddress: String, // Cached clinic address for quick access
        isPrimary: {
          type: Boolean,
          default: false,
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
        // Date-wise schedule specific to this clinic
        clinicSchedule: [
          {
            date: {
              type: Date,
              required: true,
            },
            isAvailable: {
              type: Boolean,
              default: true,
            },
            slots: [
              {
                startTime: { type: String, required: true },
                endTime: { type: String, required: true },
                isAvailable: { type: Boolean, default: true },
                maxBookings: { type: Number, default: 1, min: 1 },
                currentBookings: { type: Number, default: 0, min: 0 },
              },
            ],
          },
        ],
      },
    ],
    // Keep existing availability for backward compatibility
    availability: [
      {
        day: {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
        slots: [
          {
            startTime: String,
            endTime: String,
            isAvailable: { type: Boolean, default: true },
          },
        ],
      },
    ],
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
    isFeatured: {
      type: Boolean,
      default: false,
    },
    languages: [String],
    services: [String],
  },
  {
    timestamps: true,
  }
);

// Calculate average rating
doctorSchema.methods.calculateRating = function () {
  if (this.reviews.length === 0) {
    this.rating.average = 0;
    this.rating.count = 0;
  } else {
    const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
    this.rating.average = (sum / this.reviews.length).toFixed(1);
    this.rating.count = this.reviews.length;
  }
  return this.save();
};

// Method to sync consultationFee with doctorFees if not set
doctorSchema.methods.syncConsultationFee = function () {
  if (!this.consultationFee && this.doctorFees) {
    this.consultationFee = this.doctorFees;
  }
  return this.save();
};

// Method to get primary clinic details
doctorSchema.methods.getPrimaryClinic = function () {
  return (
    this.clinicDetails.find((clinic) => clinic.isPrimary) ||
    this.clinicDetails[0]
  );
};

// Search index
doctorSchema.index({
  name: "text",
  qualification: "text",
  bio: "text",
  "address.city": "text",
});

// Geospatial index for location-based search
doctorSchema.index({ "address.location": "2dsphere" });

module.exports = mongoose.model("Doctor", doctorSchema);
