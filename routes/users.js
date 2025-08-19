const express = require("express");
const { auth, adminAuth, superuserAuth } = require("../middleware/auth");
const upload = require("../middleware/uploadMiddleware"); // Use the shared upload middleware
const userController = require("../controllers/userController");

const router = express.Router();

// Get all users (Admin only)
router.get("/", adminAuth, userController.getAllUsers);

// Get current user profile
router.get("/profile", auth, userController.getProfile);

// Update user profile
router.put(
  "/:id",
  auth,
  upload.single("profileImage"),
  userController.updateUser
);

// Update user role (Superuser only)
router.put("/:id/role", superuserAuth, userController.updateUserRole);

// Deactivate user (Admin only)
router.delete("/:id", adminAuth, userController.deactivateUser);

// Get user profile image
router.get("/:id/image", userController.getUserImage);

// Change password
router.put("/:id/password", auth, userController.changePassword);

module.exports = router;
