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
router.post(
  "/send-change-password-otp",
  auth,
  authController.sendChangePasswordOTP
);

// OTP-based authentication
router.post("/send-login-otp", authLimiter, authController.sendLoginOTP);
router.post("/verify-otp-login", authLimiter, authController.verifyOTPAndLogin);

// MSG91 Widget access-token flows
router.post("/login-msg91", authLimiter, authController.loginWithMsg91);
router.post("/register-msg91", authLimiter, authController.registerWithMsg91);

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

// Removed test SMS endpoint in production

// Forgot password (basic implementation)
router.post("/forgot-password", authLimiter, authController.forgotPassword);

module.exports = router;
