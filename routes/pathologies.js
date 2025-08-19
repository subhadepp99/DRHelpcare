const express = require("express");
const { auth, adminAuth } = require("../middleware/auth");
const upload = require("../middleware/uploadMiddleware"); // Use the shared upload middleware
const pathologyController = require("../controllers/pathologyController");

const router = express.Router();

// Get all pathology labs
router.get("/", pathologyController.getAllPathologies);

// Get single pathology lab
router.get("/:id", pathologyController.getPathologyById);

// Create new pathology lab (Admin only)
router.post(
  "/",
  adminAuth,
  upload.single("image"),
  pathologyController.createPathology
);

// Update pathology lab (Admin only)
router.put(
  "/:id",
  adminAuth,
  upload.single("image"),
  pathologyController.updatePathology
);

// Deactivate pathology lab (Admin only)
router.delete("/:id", adminAuth, pathologyController.deletePathology);

// Get pathology lab image
router.get("/:id/image", pathologyController.getPathologyImage);

// Add review to pathology lab
router.post("/:id/reviews", auth, pathologyController.addReview);

// Search tests offered by pathology lab
router.get("/:id/tests", pathologyController.searchTests);

// Add test to pathology lab
router.post("/:id/tests", adminAuth, pathologyController.addTest);

module.exports = router;
