const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { adminAuth } = require("../middleware/auth");
const Banner = require("../models/Banner");

const router = express.Router();

// Store banner images on disk similar to doctors/ambulances
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, "..", "uploads", "banners");
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok =
      allowed.test(path.extname(file.originalname).toLowerCase()) &&
      allowed.test(file.mimetype);
    if (ok) return cb(null, true);
    cb(new Error("Only image files are allowed"));
  },
});

// Public: list active banners
router.get("/", async (req, res) => {
  try {
    const placement = req.query.placement || undefined;
    const query = { isActive: true };
    if (placement) query.placement = placement;
    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: -1 })
      .select("title imageUrl linkUrl order isActive placement");
    res.json({ success: true, data: { banners } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch banners",
      error: error.message,
    });
  }
});

// Admin: create banner
router.post("/", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const {
      title,
      linkUrl,
      order = 0,
      isActive = true,
      imageUrl,
      placement = "home",
    } = req.body;
    const bannerData = {
      title,
      linkUrl,
      order: Number(order) || 0,
      isActive: String(isActive) !== "false",
      placement,
    };

    if (req.file) {
      bannerData.imageUrl = `/uploads/banners/${req.file.filename}`;
    } else if (imageUrl) {
      bannerData.imageUrl = imageUrl;
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Image is required" });
    }

    const banner = await Banner.create(bannerData);
    res
      .status(201)
      .json({ success: true, message: "Banner created", data: banner });
  } catch (error) {
    // Cleanup file if error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch {}
    }
    res.status(500).json({
      success: false,
      message: "Failed to create banner",
      error: error.message,
    });
  }
});

// Admin: update banner
router.put("/:id", adminAuth, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    if (updates.order !== undefined) updates.order = Number(updates.order) || 0;
    if (updates.isActive !== undefined)
      updates.isActive = String(updates.isActive) !== "false";

    const banner = await Banner.findById(id);
    if (!banner)
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });

    if (req.file) {
      // delete old local file if exists
      if (banner.imageUrl && banner.imageUrl.startsWith("/uploads/")) {
        const oldPath = path.join(
          __dirname,
          "..",
          banner.imageUrl.replace("/uploads/", "uploads/")
        );
        try {
          await fs.unlink(oldPath);
        } catch {}
      }
      updates.imageUrl = `/uploads/banners/${req.file.filename}`;
    }

    Object.assign(banner, updates);
    await banner.save();

    res.json({ success: true, message: "Banner updated", data: banner });
  } catch (error) {
    // Cleanup uploaded file if error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch {}
    }
    res.status(500).json({
      success: false,
      message: "Failed to update banner",
      error: error.message,
    });
  }
});

// Admin: delete banner
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findById(id);
    if (!banner)
      return res
        .status(404)
        .json({ success: false, message: "Banner not found" });

    if (banner.imageUrl && banner.imageUrl.startsWith("/uploads/")) {
      const filePath = path.join(
        __dirname,
        "..",
        banner.imageUrl.replace("/uploads/", "uploads/")
      );
      try {
        await fs.unlink(filePath);
      } catch {}
    }

    await banner.deleteOne();
    res.json({ success: true, message: "Banner deleted" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete banner",
      error: error.message,
    });
  }
});

module.exports = router;
