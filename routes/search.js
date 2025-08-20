const express = require("express");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");

const router = express.Router();

function matchesText(doc, q, fields) {
  if (!q || q.trim() === "") return true;

  // Split query into words for wildcard search
  const keywords = q.toLowerCase().trim().split(/\s+/);

  // Return true if ANY keyword matches ANY field (more flexible search)
  return keywords.some((keyword) =>
    fields.some((field) => {
      if (typeof doc[field] !== "string") return false;
      return doc[field].toLowerCase().includes(keyword);
    })
  );
}

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

    // Check minimum character requirement for search
    if (q && q.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 3 characters long",
      });
    }

    const skip = (page - 1) * limit;
    const results = {};
    const lim = parseInt(limit);

    // Build filters
    let geoFilter = {};
    if (lat && lng) {
      geoFilter = {
        "address.coordinates": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)],
            },
            $maxDistance: distance * 1000,
          },
        },
      };
    } else if (city) {
      geoFilter = { "address.city": new RegExp(city, "i") };
    }

    // --- DOCTORS ---
    if (type === "all" || type === "doctors") {
      let baseQuery = { ...geoFilter, isActive: true };
      if (specialization) baseQuery.specialization = specialization;
      if (experience) {
        const [min, max] = experience.split("-").map(Number);
        baseQuery.experience = max ? { $gte: min, $lte: max } : { $gte: min };
      }
      if (fee) {
        const [min, max] = fee.split("-").map(Number);
        baseQuery.consultationFee = max
          ? { $gte: min, $lte: max }
          : { $gte: min };
      }
      if (rating) {
        baseQuery["rating.average"] = { $gte: parseFloat(rating) };
      }

      let doctors;
      if (q && lat && lng) {
        // Geo first, then manual text search
        doctors = await Doctor.find(baseQuery)
          .select("-reviews -__v")
          .populate("department", "name")
          .limit(lim * 5) // get extra for manual filtering
          .lean();

        doctors = doctors
          .filter((d) => matchesText(d, q, ["name", "specialization"]))
          .slice(0, lim);
      } else if (q) {
        // Text search only
        try {
          doctors = await Doctor.find({ $text: { $search: q }, ...baseQuery })
            .select("-reviews -__v")
            .populate("department", "name")
            .limit(lim)
            .skip(skip)
            .sort({ score: { $meta: "textScore" } });
        } catch (error) {
          // Fallback to manual search if text index fails
          doctors = await Doctor.find(baseQuery)
            .select("-reviews -__v")
            .populate("department", "name")
            .limit(lim * 2)
            .skip(skip)
            .lean();

          doctors = doctors
            .filter((d) => matchesText(d, q, ["name", "specialization"]))
            .slice(0, lim);
        }
      } else {
        // Just geo or no q
        doctors = await Doctor.find(baseQuery)
          .select("-reviews -__v")
          .populate("department", "name")
          .limit(lim)
          .skip(skip)
          .sort({ "rating.average": -1 });
      }
      results.doctors = doctors;
    }

    // --- CLINICS ---
    if (type === "all" || type === "clinics") {
      let baseQuery = { ...geoFilter, isActive: true };

      let clinics;
      if (q && lat && lng) {
        clinics = await Clinic.find(baseQuery)
          .select("-reviews -__v")
          .populate("doctors", "name specialization")
          .limit(lim * 5)
          .lean();
        clinics = clinics
          .filter((cl) => matchesText(cl, q, ["name"]))
          .slice(0, lim);
      } else if (q) {
        try {
          clinics = await Clinic.find({ $text: { $search: q }, ...baseQuery })
            .select("-reviews -__v")
            .populate("doctors", "name specialization")
            .limit(lim)
            .skip(skip)
            .sort({ score: { $meta: "textScore" } });
        } catch (error) {
          // Fallback to manual search if text index fails
          clinics = await Clinic.find(baseQuery)
            .select("-reviews -__v")
            .populate("doctors", "name specialization")
            .limit(lim * 2)
            .skip(skip)
            .lean();

          clinics = clinics
            .filter((cl) => matchesText(cl, q, ["name"]))
            .slice(0, lim);
        }
      } else {
        clinics = await Clinic.find(baseQuery)
          .select("-reviews -__v")
          .populate("doctors", "name specialization")
          .limit(lim)
          .skip(skip)
          .sort({ "rating.average": -1 });
      }
      results.clinics = clinics;
    }

    // --- PHARMACIES ---
    if (type === "all" || type === "pharmacies") {
      let baseQuery = { ...geoFilter, isActive: true };

      let pharmacies;
      if (q && lat && lng) {
        pharmacies = await Pharmacy.find(baseQuery)
          .select("-reviews -medications -__v")
          .limit(lim * 5)
          .lean();
        pharmacies = pharmacies
          .filter((ph) => matchesText(ph, q, ["name"]))
          .slice(0, lim);
      } else if (q) {
        try {
          pharmacies = await Pharmacy.find({
            $text: { $search: q },
            ...baseQuery,
          })
            .select("-reviews -medications -__v")
            .limit(lim)
            .skip(skip)
            .sort({ score: { $meta: "textScore" } });
        } catch (error) {
          // Fallback to manual search if text index fails
          pharmacies = await Pharmacy.find(baseQuery)
            .select("-reviews -medications -__v")
            .limit(lim * 2)
            .skip(skip)
            .lean();

          pharmacies = pharmacies
            .filter((ph) => matchesText(ph, q, ["name"]))
            .slice(0, lim);
        }
      } else {
        pharmacies = await Pharmacy.find(baseQuery)
          .select("-reviews -medications -__v")
          .limit(lim)
          .skip(skip)
          .sort({ "rating.average": -1 });
      }
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
      limit: lim,
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

// Suggestions endpoint remains unchanged
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
