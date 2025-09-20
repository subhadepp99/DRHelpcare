const express = require("express");
const multer = require("multer");
const { adminAuth } = require("../middleware/auth");
const Banner = require("../models/Banner");

const router = express.Router();

// Store banner images in DB (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Public: list active banners
router.get("/", async (req, res) => {
  try {
    const placement = req.query.placement || undefined;
    const query = { isActive: true };
    if (placement) query.placement = placement;
    const banners = await Banner.find(query)
      .sort({ order: 1, createdAt: -1 })
      .select("title image imageUrl linkUrl order isActive placement");
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

    if (req.file && req.file.buffer) {
      bannerData.image = {
        data: req.file.buffer.toString("base64"),
        contentType: req.file.mimetype,
      };
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

    if (req.file && req.file.buffer) {
      updates.image = {
        data: req.file.buffer.toString("base64"),
        contentType: req.file.mimetype,
      };
      updates.imageUrl = undefined;
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
