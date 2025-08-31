const express = require("express");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");
const Ambulance = require("../models/Ambulance");

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

    // Handle search queries with different character lengths
    const hasValidSearchQuery = q && q.trim().length >= 3;
    const hasShortQuery = q && q.trim().length > 0 && q.trim().length < 3;

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
          .populate("clinicDetails.clinic", "name address place state city")
          .limit(lim * 5) // get extra for manual filtering
          .lean();

        doctors = doctors
          .filter((d) => matchesText(d, q, ["name", "specialization", "bio"]))
          .slice(0, lim);
      } else if (q) {
        // Text search only
        try {
          doctors = await Doctor.find({ $text: { $search: q }, ...baseQuery })
            .select("-reviews -__v")
            .populate("department", "name")
            .populate("clinicDetails.clinic", "name address place state city")
            .limit(lim)
            .skip(skip)
            .sort({ score: { $meta: "textScore" } });
        } catch (error) {
          // Fallback to manual search if text index fails
          doctors = await Doctor.find(baseQuery)
            .select("-reviews -__v")
            .populate("department", "name")
            .populate("clinicDetails.clinic", "name address place state city")
            .limit(lim * 2)
            .skip(skip)
            .lean();

          doctors = doctors
            .filter((d) => matchesText(d, q, ["name", "specialization", "bio"]))
            .slice(0, lim);
        }
      } else {
        // Just geo or no q
        doctors = await Doctor.find(baseQuery)
          .select("-reviews -__v")
          .populate("department", "name")
          .populate("clinicDetails.clinic", "name address place state city")
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
          .populate("doctors.doctor", "name qualification experience")
          .limit(lim * 5)
          .lean();
        clinics = clinics
          .filter((cl) => matchesText(cl, q, ["name"]))
          .slice(0, lim);
      } else if (hasValidSearchQuery) {
        try {
          clinics = await Clinic.find({ $text: { $search: q }, ...baseQuery })
            .select("-reviews -__v")
            .populate("doctors.doctor", "name qualification experience")
            .limit(lim)
            .skip(skip)
            .sort({ score: { $meta: "textScore" } });
        } catch (error) {
          // Fallback to manual search if text index fails
          clinics = await Clinic.find(baseQuery)
            .select("-reviews -__v")
            .populate("doctors.doctor", "name qualification experience")
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
          .populate("doctors.doctor", "name qualification experience")
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

    // --- AMBULANCES ---
    if (type === "all" || type === "ambulance") {
      let baseQuery = { ...geoFilter, isActive: true };

      let ambulances;
      if (q && lat && lng) {
        // Geo first, then manual text search
        ambulances = await Ambulance.find(baseQuery)
          .limit(lim * 5) // get extra for manual filtering
          .lean();

        ambulances = ambulances
          .filter((a) => matchesText(a, q, ["name", "city", "location"]))
          .slice(0, lim);
      } else if (q) {
        try {
          // Try text search first
          ambulances = await Ambulance.find({
            $text: { $search: q },
            ...baseQuery,
          })
            .limit(lim)
            .skip(skip)
            .sort({ score: { $meta: "textScore" } });
        } catch (error) {
          // Fallback to manual search if text index fails
          ambulances = await Ambulance.find(baseQuery)
            .limit(lim * 2)
            .skip(skip)
            .lean();

          ambulances = ambulances
            .filter((a) => matchesText(a, q, ["name", "city", "location"]))
            .slice(0, lim);
        }
      } else {
        ambulances = await Ambulance.find(baseQuery)
          .limit(lim)
          .skip(skip)
          .sort({ isAvailable: -1, name: 1 });
      }
      results.ambulances = ambulances;
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

// Suggestions endpoint - allows shorter queries for better UX
router.get("/suggestions", async (req, res) => {
  try {
    const { q, type = "all" } = req.query;
    if (!q || q.length < 1) {
      return res.json({ suggestions: [] });
    }
    const suggestions = [];
    const regex = new RegExp(q, "i");

    if (type === "all" || type === "doctors") {
      let query = { isActive: true };
      if (q.length >= 3) {
        // Full search for 3+ characters
        query = {
          $or: [{ name: regex }, { specialization: regex }],
          isActive: true,
        };
      } else {
        // Basic search for 1-2 characters - just check if name starts with query
        query = {
          name: { $regex: `^${q}`, $options: "i" },
          isActive: true,
        };
      }

      const doctors = await Doctor.find(query)
        .select("name specialization")
        .limit(q.length >= 3 ? 5 : 3);

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
      let query = { isActive: true };
      if (q.length >= 3) {
        // Full search for 3+ characters
        query = {
          name: regex,
          isActive: true,
        };
      } else {
        // Basic search for 1-2 characters - just check if name starts with query
        query = {
          name: { $regex: `^${q}`, $options: "i" },
          isActive: true,
        };
      }

      const clinics = await Clinic.find(query)
        .select("name address.city")
        .limit(q.length >= 3 ? 3 : 2);

      clinics.forEach((clinic) => {
        suggestions.push({
          type: "clinic",
          text: clinic.name,
          subtext: clinic.address.city,
          id: clinic._id,
        });
      });
    }
    if (type === "all" || type === "ambulance") {
      let query = { isActive: true };
      if (q.length >= 3) {
        // Full search for 3+ characters
        query = {
          $or: [{ name: regex }, { city: regex }],
          isActive: true,
        };
      } else {
        // Basic search for 1-2 characters - just check if name starts with query
        query = {
          name: { $regex: `^${q}`, $options: "i" },
          isActive: true,
        };
      }

      const ambulances = await Ambulance.find(query)
        .select("name city")
        .limit(q.length >= 3 ? 3 : 2);

      ambulances.forEach((ambulance) => {
        suggestions.push({
          type: "ambulance",
          text: ambulance.name,
          subtext: ambulance.city,
          id: ambulance._id,
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

// Get all available locations from database
router.get("/locations", async (req, res) => {
  try {
    const locations = new Set();

    // Get locations from doctors
    const doctors = await Doctor.find({ isActive: true })
      .select("city state address.city address.state")
      .lean();

    doctors.forEach((doctor) => {
      if (doctor.city) locations.add(doctor.city);
      if (doctor.state) locations.add(doctor.state);
      if (doctor.address?.city) locations.add(doctor.address.city);
      if (doctor.address?.state) locations.add(doctor.address.state);
    });

    // Get locations from clinics
    const clinics = await Clinic.find({ isActive: true })
      .select("address.city address.state place")
      .lean();

    clinics.forEach((clinic) => {
      if (clinic.address?.city) locations.add(clinic.address.city);
      if (clinic.address?.state) locations.add(clinic.address.state);
      if (clinic.place) locations.add(clinic.place);
    });

    // Get locations from ambulances
    const ambulances = await Ambulance.find({ isActive: true })
      .select("city state location")
      .lean();

    ambulances.forEach((ambulance) => {
      if (ambulance.city) locations.add(ambulance.city);
      if (ambulance.state) locations.add(ambulance.state);
      if (ambulance.location) locations.add(ambulance.location);
    });

    // Convert to array and sort alphabetically
    const locationsArray = Array.from(locations).filter(Boolean).sort();

    res.json({
      success: true,
      locations: locationsArray,
    });
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get locations",
      error: error.message,
    });
  }
});

module.exports = router;
