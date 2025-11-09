const { body, validationResult } = require("express-validator");

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));

    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errorMessages,
    });
  }

  next();
};

// User registration validation
const validateUserRegistration = [
  body("username")
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be between 3 and 30 characters")
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username can only contain letters, numbers, and underscores"),

  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),

  body("firstName")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("First name is required and must be less than 50 characters"),

  body("lastName")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Last name is required and must be less than 50 characters"),

  body("phone")
    .notEmpty()
    .withMessage("Phone number is required")
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage("Please provide a valid phone number"),

  handleValidationErrors,
];

// User login validation
const validateUserLogin = [
  body("identifier")
    .notEmpty()
    .withMessage("Email, username, or phone is required"),

  body("password").notEmpty().withMessage("Password is required"),

  handleValidationErrors,
];

// Doctor creation validation
const validateDoctorCreation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage(
      "Doctor name is required and must be less than 100 characters"
    ),

  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("phone")
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage("Please provide a valid phone number"),

  body("specialization")
    .isIn([
      "Cardiology",
      "Dermatology",
      "Neurology",
      "Pediatrics",
      "Orthopedics",
      "Gynecology",
      "Psychiatry",
      "Radiology",
      "Anesthesiology",
      "Pathology",
      "Emergency",
      "General",
      "Others",
    ])
    .withMessage("Please provide a valid specialization"),

  body("qualification")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage(
      "Qualification is required and must be less than 200 characters"
    ),

  body("experience")
    .isInt({ min: 0, max: 50 })
    .withMessage("Experience must be a number between 0 and 50"),

  body("licenseNumber")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage(
      "License number is required and must be less than 50 characters"
    ),

  body("consultationFee")
    .isFloat({ min: 0 })
    .withMessage("Consultation fee must be a positive number"),

  handleValidationErrors,
];

// Booking validation
const validateBooking = [
  body("doctorId").isMongoId().withMessage("Please provide a valid doctor ID"),

  body("appointmentDate")
    .isISO8601()
    .withMessage("Please provide a valid appointment date")
    .custom((value) => {
      const appointmentDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (appointmentDate < today) {
        throw new Error("Appointment date cannot be in the past");
      }
      return true;
    }),

  body("appointmentTime")
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage("Please provide a valid time in HH:MM format"),

  body("patientDetails.name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Patient name is required"),

  body("patientDetails.phone")
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage("Please provide a valid phone number"),

  body("patientDetails.email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  handleValidationErrors,
];

// Review validation
const validateReview = [
  body("rating")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be between 1 and 5"),

  body("comment")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Comment must be less than 500 characters"),

  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateDoctorCreation,
  validateBooking,
  validateReview,
};
