const express = require("express");
const router = express.Router();
const Department = require("../models/Department");
const Doctor = require("../models/Doctor");

// Get all departments with associated doctors (limited info)
router.get("/", async (req, res) => {
  try {
    const departments = await Department.find().populate({
      path: "doctors",
      select: "name specialization photoUrl", // only needed doctor fields
    });
    res.json({ departments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create department (admin/superuser only)
router.post("/", async (req, res) => {
  try {
    const dep = new Department({
      name: req.body.name,
      heading: req.body.heading || req.body.name,
      description: req.body.description,
      imageUrl: req.body.imageUrl, // imageUrl upload handled separately
    });
    await dep.save();
    res.status(201).json(dep);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Edit department
router.put("/:id", async (req, res) => {
  try {
    await Department.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete department
router.delete("/:id", async (req, res) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Associate or dissociate doctors with a department
router.post("/:id/doctors", async (req, res) => {
  // req.body.doctorIds = [array of doctor _id]
  try {
    await Department.findByIdAndUpdate(req.params.id, {
      doctors: req.body.doctorIds,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
