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

// Forgot password (basic implementation)
router.post("/forgot-password", authLimiter, authController.forgotPassword);

module.exports = router;
