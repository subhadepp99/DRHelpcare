const express = require("express");
const { auth } = require("../middleware/auth");
const authController = require("../controllers/authController");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Register new user
router.post("/register", authLimiter, authController.register);

// Test endpoint
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Auth API is working",
    timestamp: new Date().toISOString(),
  });
});

// Login user
router.post("/login", authLimiter, authController.login);

// Refresh token
router.post("/refresh", authController.refreshToken);

// Get current user
router.get("/me", auth, authController.getMe);

// Logout user
router.post("/logout", auth, authController.logout);

// Change password
router.put("/change-password", auth, authController.changePassword);

// OTP-based authentication
router.post("/send-login-otp", authLimiter, authController.sendLoginOTP);
router.post("/verify-otp-login", authLimiter, authController.verifyOTPAndLogin);

// Registration OTP
router.post(
  "/send-registration-otp",
  authLimiter,
  authController.sendRegistrationOTP
);

// Password reset with OTP
router.post(
  "/send-password-reset-otp",
  authLimiter,
  authController.sendPasswordResetOTP
);
router.post(
  "/reset-password-otp",
  authLimiter,
  authController.resetPasswordWithOTP
);

// Test SMS endpoint (for development only)
router.post("/test-sms", authLimiter, async (req, res) => {
  try {
    const { phoneNumber, messageType = "login" } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const { generateOTP, sendOTP } = require("../utils/sms");
    const otp = generateOTP();

    const result = await sendOTP(phoneNumber, otp, messageType);

    if (result.success) {
      res.json({
        success: true,
        message: "Test SMS sent successfully",
        otp: otp, // Only for testing - remove in production
        result: result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to send test SMS",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Test SMS error:", error);
    res.status(500).json({
      success: false,
      message: "Test SMS failed",
      error: error.message,
    });
  }
});

// Forgot password (basic implementation)
router.post("/forgot-password", authLimiter, authController.forgotPassword);

module.exports = router;
