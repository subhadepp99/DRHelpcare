const express = require("express");
const { auth, adminAuth, superuserAuth } = require("../middleware/auth");
const { userUpload } = require("../middleware/uploadMiddleware"); // Use the user-specific upload middleware
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
  userUpload.single("profileImage"),
  userController.updateUser
);

// Create new user (Admin only)
router.post(
  "/",
  adminAuth,
  userUpload.single("profileImage"),
  userController.createUser
);

// Update user role (Superuser only)
router.put("/:id/role", superuserAuth, userController.updateUserRole);

// Deactivate user (Admin only)
router.patch("/:id/deactivate", adminAuth, userController.deactivateUser);

// Delete user permanently (Admin only)
router.delete("/:id", adminAuth, userController.deleteUser);

// Reactivate user (Admin only)
router.patch("/:id/reactivate", adminAuth, userController.reactivateUser);

// Get user profile image
router.get("/:id/image", userController.getUserImage);

// Change password
router.put("/:id/password", auth, userController.changePassword);

module.exports = router;
