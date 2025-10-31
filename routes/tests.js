const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const {
  getAllTests,
  getAllTestsForAdmin,
  getTestById,
  searchTests,
  createTest,
  updateTest,
  deleteTest,
  getTestImage,
} = require("../controllers/testController");
const { auth } = require("../middleware/auth");

// Configure multer for memory storage (database storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Public routes
router.get("/", getAllTests);
router.get("/search", searchTests);
router.get("/:id", getTestById);
router.get("/:id/image", getTestImage);

// Admin routes
router.get("/admin/all", auth, getAllTestsForAdmin);
router.post("/", auth, upload.single("image"), createTest);
router.put("/:id", auth, upload.single("image"), updateTest);
router.delete("/:id", auth, deleteTest);

module.exports = router;
