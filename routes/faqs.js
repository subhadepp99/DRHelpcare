const express = require("express");
const { auth, adminAuth } = require("../middleware/auth");
const FAQ = require("../models/FAQ");

const router = express.Router();

// Public: list FAQs by entity
router.get("/public", async (req, res) => {
  try {
    const { entityType, entityId } = req.query;
    if (!entityType) {
      return res
        .status(400)
        .json({ success: false, message: "entityType is required" });
    }
    const query = { entityType, isActive: true };
    if (entityId) query.entityId = entityId;
    const faqs = await FAQ.find(query).sort({ sortOrder: 1, createdAt: -1 });
    res.json({ success: true, data: { faqs } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Failed to fetch FAQs" });
  }
});

// Admin: create FAQ
router.post("/", adminAuth, async (req, res) => {
  try {
    const faq = new FAQ({ ...req.body, createdBy: req.user.id });
    await faq.save();
    res.status(201).json({ success: true, data: { faq } });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// Admin: update FAQ
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!faq)
      return res.status(404).json({ success: false, message: "FAQ not found" });
    res.json({ success: true, data: { faq } });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// Admin: delete FAQ
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    if (!faq)
      return res.status(404).json({ success: false, message: "FAQ not found" });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

module.exports = router;
