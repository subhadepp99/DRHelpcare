const express = require("express");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");

const router = express.Router();

// Global search endpoint
router.get("/", async (req, res) => {
  try {
    const {
      q = "",
      type = "all",
      lat,
      lng,
      city,
      specialization,
      experience,
      fee,
      rating,
      distance = 25,
      limit = 20,
      page = 1,
    } = req.query;

    const skip = (page - 1) * limit;
    const results = {};

    // Build search query
    const searchQuery = q ? { $text: { $search: q } } : {};

    // Location-based search
    let locationQuery = {};
    if (lat && lng) {
      locationQuery = {
        "address.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)],
            },
            $maxDistance: distance * 1000, // Convert km to meters
          },
        },
      };
    } else if (city) {
      locationQuery = { "address.city": new RegExp(city, "i") };
    }

    // Search doctors
    if (type === "all" || type === "doctors") {
      let doctorQuery = { ...searchQuery, ...locationQuery, isActive: true };

      // Add filters
      if (specialization) doctorQuery.specialization = specialization;
      if (experience) {
        const [min, max] = experience.split("-").map(Number);
        doctorQuery.experience = max ? { $gte: min, $lte: max } : { $gte: min };
      }
      if (fee) {
        const [min, max] = fee.split("-").map(Number);
        doctorQuery.consultationFee = max
          ? { $gte: min, $lte: max }
          : { $gte: min };
      }
      if (rating) {
        doctorQuery["rating.average"] = { $gte: parseFloat(rating) };
      }

      const doctors = await Doctor.find(doctorQuery)
        .select("-reviews -__v")
        .limit(parseInt(limit))
        .skip(skip)
        .sort(q ? { score: { $meta: "textScore" } } : { "rating.average": -1 });

      results.doctors = doctors;
    }

    // Search clinics
    if (type === "all" || type === "clinics") {
      let clinicQuery = { ...searchQuery, ...locationQuery, isActive: true };

      const clinics = await Clinic.find(clinicQuery)
        .select("-reviews -__v")
        .populate("doctors", "name specialization")
        .limit(parseInt(limit))
        .skip(skip)
        .sort(q ? { score: { $meta: "textScore" } } : { "rating.average": -1 });

      results.clinics = clinics;
    }

    // Search pharmacies
    if (type === "all" || type === "pharmacies") {
      let pharmacyQuery = { ...searchQuery, ...locationQuery, isActive: true };

      const pharmacies = await Pharmacy.find(pharmacyQuery)
        .select("-reviews -medications -__v")
        .limit(parseInt(limit))
        .skip(skip)
        .sort(q ? { score: { $meta: "textScore" } } : { "rating.average": -1 });

      results.pharmacies = pharmacies;
    }

    // Calculate total results
    const totalResults = Object.values(results).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    res.json({
      success: true,
      results,
      totalResults,
      page: parseInt(page),
      limit: parseInt(limit),
      query: {
        searchTerm: q,
        type,
        location: city || (lat && lng ? `${lat},${lng}` : null),
        filters: { specialization, experience, fee, rating, distance },
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      message: "Search failed",
      error: error.message,
    });
  }
});

// Autocomplete suggestions
router.get("/suggestions", async (req, res) => {
  try {
    const { q, type = "all" } = req.query;

    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = [];
    const regex = new RegExp(q, "i");

    if (type === "all" || type === "doctors") {
      const doctors = await Doctor.find({
        $or: [{ name: regex }, { specialization: regex }],
        isActive: true,
      })
        .select("name specialization")
        .limit(5);

      doctors.forEach((doctor) => {
        suggestions.push({
          type: "doctor",
          text: `Dr. ${doctor.name}`,
          subtext: doctor.specialization,
          id: doctor._id,
        });
      });
    }

    if (type === "all" || type === "clinics") {
      const clinics = await Clinic.find({
        name: regex,
        isActive: true,
      })
        .select("name address.city")
        .limit(3);

      clinics.forEach((clinic) => {
        suggestions.push({
          type: "clinic",
          text: clinic.name,
          subtext: clinic.address.city,
          id: clinic._id,
        });
      });
    }

    res.json({ suggestions: suggestions.slice(0, 10) });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get suggestions",
      error: error.message,
    });
  }
});

module.exports = router;
