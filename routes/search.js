const express = require("express");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");
const Ambulance = require("../models/Ambulance");
const Department = require("../models/Department");
const Pathology = require("../models/Pathology");

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

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance; // Distance in km
}

// Helper function to add distance to results
function addDistanceToResults(results, userLat, userLng) {
  return results.map((item) => {
    let coordinates = null;

    // Extract coordinates based on entity type
    // Doctor: address.location.coordinates
    if (item.address?.location?.coordinates) {
      coordinates = item.address.location.coordinates;
    }
    // Clinic, Ambulance: coordinates
    else if (item.coordinates) {
      coordinates = item.coordinates;
    }
    // Pathology: may have coordinates field
    else if (item.location?.coordinates) {
      coordinates = item.location.coordinates;
    }

    if (coordinates && coordinates.length === 2 && userLat && userLng) {
      const [itemLng, itemLat] = coordinates;
      if (itemLat && itemLng && itemLat !== 0 && itemLng !== 0) {
        const distance = calculateDistance(
          parseFloat(userLat),
          parseFloat(userLng),
          itemLat,
          itemLng
        );
        return {
          ...(item.toObject ? item.toObject() : item),
          distance: parseFloat(distance.toFixed(2)),
        };
      }
    }

    return { ...(item.toObject ? item.toObject() : item), distance: null };
  });
}

// Helper function to sort results by distance
function sortByDistance(results) {
  return results.sort((a, b) => {
    if (a.distance === null) return 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  });
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
      department,
      experience,
      fee,
      rating,
      distance = 50,
      limit = 20,
      page = 1,
    } = req.query;
    // Handle search queries with different character lengths
    const hasValidSearchQuery = q && q.trim().length >= 3;
    const hasShortQuery = q && q.trim().length > 0 && q.trim().length < 3;

    const skip = (page - 1) * limit;
    const results = {};
    const lim = parseInt(limit);
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;
    const maxDistance = parseInt(distance) * 1000; // Convert km to meters

    // Substring location matcher used across entities
    const locationRegex = city ? new RegExp(city, "i") : null;

    // --- DOCTORS ---
    if (type === "all" || type === "doctors") {
      let baseQuery = { isActive: true };
      if (specialization) baseQuery.specialization = specialization;

      // Handle department filtering
      if (department) {
        console.log("Department filter applied:", department);
        console.log(
          "Searching for department with name or heading matching:",
          department
        );

        try {
          // Find department by name (case-insensitive)
          const departmentDoc = await Department.findOne({
            $or: [
              { name: new RegExp(department, "i") },
              { heading: new RegExp(department, "i") },
            ],
            isActive: true,
          });

          //console.log("Department search result:", departmentDoc);

          if (departmentDoc) {
            baseQuery.department = departmentDoc._id;
            console.log(
              "Found department ID:",
              departmentDoc._id,
              "for name:",
              department
            );
            console.log("Department details:", {
              id: departmentDoc._id,
              name: departmentDoc.name,
              heading: departmentDoc.heading,
            });
          } else {
            console.log("No department found for:", department);
            // Debug: Show all available departments
            const allDepartments = await Department.find({
              isActive: true,
            }).select("name heading");
            console.log(
              "Available departments:",
              allDepartments.map((d) => ({ name: d.name, heading: d.heading }))
            );
            // If department not found, return empty results
            baseQuery.department = null;
          }
        } catch (error) {
          console.error("Error finding department:", error);
          // If error finding department, return empty results
          baseQuery.department = null;
        }
      }
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

      console.log(
        "Final baseQuery for doctors:",
        JSON.stringify(baseQuery, null, 2)
      );

      let doctors;

      // Build location filter
      const doctorLocationFilter = locationRegex
        ? {
            $or: [
              { "address.city": locationRegex },
              { "address.state": locationRegex },
              { city: locationRegex },
              { state: locationRegex },
            ],
          }
        : {};

      if (q) {
        // Text search with location filter
        const regex = new RegExp(q, "i");

        // Find matching departments by name/heading/specialization
        let departmentIds = [];
        try {
          const deptDocs = await Department.find({
            $or: [
              { name: regex },
              { heading: regex },
              { specialization: regex },
            ],
            isActive: true,
          }).select("_id");
          departmentIds = deptDocs.map((d) => d._id);
        } catch (e) {
          departmentIds = [];
        }

        doctors = await Doctor.find({
          ...baseQuery,
          ...doctorLocationFilter,
          $or: [
            { name: regex },
            { specialization: regex },
            { bio: regex },
            departmentIds.length
              ? { department: { $in: departmentIds } }
              : null,
          ].filter(Boolean),
        })
          .select("-reviews -__v")
          .populate("department", "name")
          .populate("clinicDetails.clinic", "name address place state city")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      } else {
        // No text query, just location and filters
        doctors = await Doctor.find({ ...baseQuery, ...doctorLocationFilter })
          .select("-reviews -__v")
          .populate("department", "name")
          .populate("clinicDetails.clinic", "name address place state city")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      }

      // Add distance calculation and sort by distance
      if (userLat && userLng) {
        doctors = addDistanceToResults(doctors, userLat, userLng);
        doctors = sortByDistance(doctors);
        // Filter by max distance if coordinates are available
        doctors = doctors.filter(
          (d) => d.distance === null || d.distance <= parseInt(distance)
        );
      }

      // Apply pagination after distance sorting
      doctors = doctors.slice(skip, skip + lim);

      results.doctors = doctors;
    }

    // --- CLINICS ---
    if (type === "all" || type === "clinics") {
      let baseQuery = { isActive: true };

      let clinics;
      if (q) {
        const regex = new RegExp(q, "i");

        // Find matching departments
        let departmentIds = [];
        try {
          const deptDocs = await Department.find({
            $or: [
              { name: regex },
              { heading: regex },
              { specialization: regex },
            ],
            isActive: true,
          }).select("_id");
          departmentIds = deptDocs.map((d) => d._id);
        } catch (e) {
          departmentIds = [];
        }

        // Find doctors matching query or department
        const doctorMatch = await Doctor.find({
          isActive: true,
          $or: [
            { name: regex },
            { specialization: regex },
            departmentIds.length
              ? { department: { $in: departmentIds } }
              : null,
          ].filter(Boolean),
        }).select("_id");
        const doctorIds = doctorMatch.map((d) => d._id);

        const clinicLocationFilter = locationRegex
          ? {
              $or: [
                { "address.city": locationRegex },
                { "address.state": locationRegex },
                { place: locationRegex },
                { state: locationRegex },
              ],
            }
          : {};

        clinics = await Clinic.find({
          ...baseQuery,
          ...clinicLocationFilter,
          $or: [
            { name: regex },
            { services: { $in: [regex] } },
            doctorIds.length ? { "doctors.doctor": { $in: doctorIds } } : null,
          ].filter(Boolean),
        })
          .select("-reviews -__v")
          .populate("doctors.doctor", "name qualification experience")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      } else {
        const clinicLocationFilter = locationRegex
          ? {
              $or: [
                { "address.city": locationRegex },
                { "address.state": locationRegex },
                { place: locationRegex },
                { state: locationRegex },
              ],
            }
          : {};

        clinics = await Clinic.find({ ...baseQuery, ...clinicLocationFilter })
          .select("-reviews -__v")
          .populate("doctors.doctor", "name qualification experience")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      }

      // Add distance calculation and sort by distance
      if (userLat && userLng) {
        clinics = addDistanceToResults(clinics, userLat, userLng);
        clinics = sortByDistance(clinics);
        // Filter by max distance if coordinates are available
        clinics = clinics.filter(
          (c) => c.distance === null || c.distance <= parseInt(distance)
        );
      }

      // Apply pagination after distance sorting
      clinics = clinics.slice(skip, skip + lim);

      results.clinics = clinics;
    }

    // --- PATHOLOGIES ---
    if (type === "all" || type === "pathology") {
      let baseQuery = { isActive: true };
      let pathologies;
      if (q) {
        const regex = new RegExp(q, "i");
        const pathologyLocationFilter = locationRegex
          ? {
              $or: [
                { place: locationRegex },
                { state: locationRegex },
                { address: locationRegex },
                { city: locationRegex },
              ],
            }
          : {};

        pathologies = await Pathology.find({
          ...baseQuery,
          ...pathologyLocationFilter,
          $or: [{ name: regex }, { category: regex }, { description: regex }],
        })
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      } else {
        const pathologyLocationFilter = locationRegex
          ? {
              $or: [
                { place: locationRegex },
                { state: locationRegex },
                { address: locationRegex },
                { city: locationRegex },
              ],
            }
          : {};

        pathologies = await Pathology.find({
          ...baseQuery,
          ...pathologyLocationFilter,
        })
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      }

      // Add distance calculation and sort by distance
      if (userLat && userLng) {
        pathologies = addDistanceToResults(pathologies, userLat, userLng);
        pathologies = sortByDistance(pathologies);
        // Filter by max distance if coordinates are available
        pathologies = pathologies.filter(
          (p) => p.distance === null || p.distance <= parseInt(distance)
        );
      }

      // Apply pagination after distance sorting
      pathologies = pathologies.slice(skip, skip + lim);

      results.pathologies = pathologies;
    }

    // --- PHARMACIES ---
    if (type === "all" || type === "pharmacies") {
      let baseQuery = { isActive: true };

      let pharmacies;
      if (q) {
        const regex = new RegExp(q, "i");
        const pharmacyLocationFilter = locationRegex
          ? {
              $or: [
                { "address.city": locationRegex },
                { "address.state": locationRegex },
                { city: locationRegex },
                { state: locationRegex },
              ],
            }
          : {};

        try {
          pharmacies = await Pharmacy.find({
            $text: { $search: q },
            ...baseQuery,
            ...pharmacyLocationFilter,
          })
            .select("-reviews -medications -__v")
            .limit(lim * 3)
            .lean();
        } catch (error) {
          // Fallback to manual search if text index fails
          pharmacies = await Pharmacy.find({
            ...baseQuery,
            ...pharmacyLocationFilter,
            name: regex,
          })
            .select("-reviews -medications -__v")
            .limit(lim * 3)
            .lean();
        }
      } else {
        const pharmacyLocationFilter = locationRegex
          ? {
              $or: [
                { "address.city": locationRegex },
                { "address.state": locationRegex },
                { city: locationRegex },
                { state: locationRegex },
              ],
            }
          : {};

        pharmacies = await Pharmacy.find({
          ...baseQuery,
          ...pharmacyLocationFilter,
        })
          .select("-reviews -medications -__v")
          .limit(lim * 3)
          .lean();
      }

      // Add distance calculation and sort by distance
      if (userLat && userLng) {
        pharmacies = addDistanceToResults(pharmacies, userLat, userLng);
        pharmacies = sortByDistance(pharmacies);
        // Filter by max distance if coordinates are available
        pharmacies = pharmacies.filter(
          (p) => p.distance === null || p.distance <= parseInt(distance)
        );
      }

      // Apply pagination after distance sorting
      pharmacies = pharmacies.slice(skip, skip + lim);

      results.pharmacies = pharmacies;
    }

    // --- AMBULANCES ---
    if (type === "all" || type === "ambulance") {
      let baseQuery = { isActive: true };

      let ambulances;
      if (q) {
        const regex = new RegExp(q, "i");
        const ambulanceLocationFilter = locationRegex
          ? {
              $or: [
                { city: locationRegex },
                { state: locationRegex },
                { location: locationRegex },
              ],
            }
          : {};

        try {
          // Try text search first
          ambulances = await Ambulance.find({
            $text: { $search: q },
            ...baseQuery,
            ...ambulanceLocationFilter,
          })
            .limit(lim * 3)
            .lean();
        } catch (error) {
          // Fallback to manual search if text index fails
          ambulances = await Ambulance.find({
            ...baseQuery,
            ...ambulanceLocationFilter,
            $or: [
              { name: regex },
              { city: regex },
              { location: regex },
              { driverName: regex },
            ],
          })
            .limit(lim * 3)
            .lean();
        }
      } else {
        const ambulanceLocationFilter = locationRegex
          ? {
              $or: [
                { city: locationRegex },
                { state: locationRegex },
                { location: locationRegex },
              ],
            }
          : {};

        ambulances = await Ambulance.find({
          ...baseQuery,
          ...ambulanceLocationFilter,
        })
          .limit(lim * 3)
          .lean();
      }

      // Add distance calculation and sort by distance
      if (userLat && userLng) {
        ambulances = addDistanceToResults(ambulances, userLat, userLng);
        ambulances = sortByDistance(ambulances);
        // Filter by max distance if coordinates are available
        ambulances = ambulances.filter(
          (a) => a.distance === null || a.distance <= parseInt(distance)
        );
      } else {
        // Sort by availability if no location provided
        ambulances = ambulances.sort((a, b) => {
          if (a.isAvailable && !b.isAvailable) return -1;
          if (!a.isAvailable && b.isAvailable) return 1;
          return 0;
        });
      }

      // Apply pagination after distance sorting
      ambulances = ambulances.slice(skip, skip + lim);

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
    const suggestions = [];
    const hasQuery = typeof q === "string" && q.length > 0;
    const regex = hasQuery ? new RegExp(q, "i") : null;

    // Default suggestions when no query: show departments
    if (!hasQuery) {
      const depts = await Department.find({ isActive: true })
        .select("name heading specialization")
        .limit(10)
        .sort({ name: 1 });
      depts.forEach((d) => {
        suggestions.push({
          type: "department",
          text: d.heading || d.name,
          subtext: d.specialization || "Department",
          id: d._id,
        });
      });
      return res.json({ suggestions });
    }

    // Doctors
    if (type === "all" || type === "doctors") {
      const doctors = await Doctor.find(
        hasQuery
          ? {
              isActive: true,
              $or: [{ name: regex }, { specialization: regex }],
            }
          : { isActive: true }
      )
        .select("name specialization")
        .limit(10);

      doctors.forEach((doctor) => {
        suggestions.push({
          type: "doctor",
          text: `Dr. ${doctor.name}`,
          subtext: doctor.specialization,
          id: doctor._id,
        });
      });
    }

    // Clinics
    if (type === "all" || type === "clinics") {
      const clinics = await Clinic.find(
        hasQuery ? { isActive: true, name: regex } : { isActive: true }
      )
        .select("name address.city place state")
        .limit(10);

      clinics.forEach((clinic) => {
        suggestions.push({
          type: "clinic",
          text: clinic.name,
          subtext:
            clinic.address?.city || clinic.place || clinic.state || "Clinic",
          id: clinic._id,
        });
      });
    }

    // Departments
    if (type === "all" || type === "departments") {
      const depts = await Department.find(
        hasQuery
          ? {
              isActive: true,
              $or: [
                { name: regex },
                { heading: regex },
                { specialization: regex },
              ],
            }
          : { isActive: true }
      )
        .select("name heading specialization")
        .limit(10);

      depts.forEach((d) => {
        suggestions.push({
          type: "department",
          text: d.heading || d.name,
          subtext: d.specialization || "Department",
          id: d._id,
        });
      });
    }

    // Pathologies
    if (type === "all" || type === "pathology") {
      const paths = await Pathology.find(
        hasQuery
          ? { isActive: true, $or: [{ name: regex }, { category: regex }] }
          : { isActive: true }
      )
        .select("name category place state")
        .limit(10);

      paths.forEach((p) => {
        suggestions.push({
          type: "pathology",
          text: p.name,
          subtext: p.category || p.place || p.state || "Pathology",
          id: p._id,
        });
      });
    }

    // Pharmacies
    if (type === "all" || type === "pharmacies") {
      const pharms = await Pharmacy.find(
        hasQuery ? { isActive: true, name: regex } : { isActive: true }
      )
        .select("name address.city state")
        .limit(10);

      pharms.forEach((ph) => {
        suggestions.push({
          type: "pharmacy",
          text: ph.name,
          subtext: ph.address?.city || ph.state || "Pharmacy",
          id: ph._id,
        });
      });
    }

    // Ambulances
    if (type === "all" || type === "ambulance") {
      const ambulances = await Ambulance.find(
        hasQuery
          ? {
              isActive: true,
              $or: [{ name: regex }, { city: regex }, { state: regex }],
            }
          : { isActive: true }
      )
        .select("name city state")
        .limit(10);

      ambulances.forEach((ambulance) => {
        suggestions.push({
          type: "ambulance",
          text: ambulance.name,
          subtext: ambulance.city || ambulance.state || "Ambulance",
          id: ambulance._id,
        });
      });
    }

    res.json({ suggestions: suggestions.slice(0, 15) });
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

    // Get locations from pathologies
    const pathologies = await Pathology.find({ isActive: true })
      .select("place state address")
      .lean();
    pathologies.forEach((p) => {
      if (p.place) locations.add(p.place);
      if (p.state) locations.add(p.state);
      if (p.address) locations.add(p.address);
    });

    ambulances.forEach((ambulance) => {
      if (ambulance.city) locations.add(ambulance.city);
      if (ambulance.state) locations.add(ambulance.state);
      if (ambulance.location) locations.add(ambulance.location);
    });

    // Convert to array and sort alphabetically
    // Build suggestions as "place, state" style when both available
    const normalized = new Set();
    const raw = Array.from(locations).filter(Boolean);
    raw.forEach((loc) => normalized.add(String(loc).trim()));
    const locationsArray = Array.from(normalized).sort();

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
