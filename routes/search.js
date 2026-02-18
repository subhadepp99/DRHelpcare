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

    console.log("=== SEARCH REQUEST ===");
    console.log("Query params:", { q, type, city, lat, lng, limit, page });
    // Handle search queries with different character lengths
    const hasValidSearchQuery = q && q.trim().length >= 3;
    const hasShortQuery = q && q.trim().length > 0 && q.trim().length < 3;

    const skip = (page - 1) * limit;
    const results = {};
    const lim = parseInt(limit);
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;
    const maxDistance = parseInt(distance) * 1000; // Convert km to meters

    // Parse location string - could be "City" or "City, State"
    let cityPart = null;
    let statePart = null;
    let locationRegex = null;

    if (city) {
      const parts = city.split(",").map((p) => p.trim());
      if (parts.length > 1) {
        // Has both city and state
        cityPart = parts[0];
        statePart = parts[1];
      } else {
        // Just city or state
        cityPart = parts[0];
      }
      // Create regex for the full string for backwards compatibility
      locationRegex = new RegExp(city, "i");
    }

    // Helper function to build location filters for different entity types
    const buildLocationFilter = (cityFields, stateFields) => {
      if (!locationRegex) return {};

      const conditions = [];

      // Add full location regex matches
      cityFields.forEach((field) =>
        conditions.push({ [field]: locationRegex })
      );
      stateFields.forEach((field) =>
        conditions.push({ [field]: locationRegex })
      );

      // If we have both city and state parts, match them together
      if (cityPart && statePart) {
        conditions.push({
          $and: [
            {
              $or: cityFields.map((field) => ({
                [field]: new RegExp(cityPart, "i"),
              })),
            },
            {
              $or: stateFields.map((field) => ({
                [field]: new RegExp(statePart, "i"),
              })),
            },
          ],
        });
      }

      // Also match just the city part
      if (cityPart) {
        cityFields.forEach((field) =>
          conditions.push({ [field]: new RegExp(cityPart, "i") })
        );
      }

      return { $or: conditions };
    };

    // --- DOCTORS ---
    // Only search doctors if type is "all" or "doctors" (not when searching for ambulance/clinic specifically)
    if ((type === "all" || type === "doctors") && type !== "ambulance" && type !== "clinics") {
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

          console.log("Department search result:", departmentDoc);

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

      // Build location filter - handle "City, State" format
      const doctorLocationFilter = buildLocationFilter(
        ["address.city", "city"],
        ["address.state", "state"]
      );

      console.log(
        "Doctor location filter:",
        JSON.stringify(doctorLocationFilter, null, 2)
      );
      console.log("Doctor base query:", JSON.stringify(baseQuery, null, 2));

      if (q) {
        // Normalize query to handle "Dr." with or without space
        // This allows "Dr. Sayan" and "Dr.Sayan" to both match
        // Replace "Dr." or "Dr " (with or without space) at word boundaries with flexible pattern
        const normalizedQuery = q.replace(/\b(Dr|dr)\.?\s*/gi, (match) => {
          // Replace with pattern that matches "Dr" followed by optional "." and optional space
          return 'Dr\\.?\\s*';
        });
        
        // Wildcard search for doctor names - prioritize name search
        const regex = new RegExp(normalizedQuery, "i");

        // Check if query matches a department name/heading/specialization
        let departmentIds = [];
        let isDepartmentSearch = false;
        try {
          const deptDocs = await Department.find({
            $or: [
              { name: regex },
              { heading: regex },
              { specialization: regex },
            ],
            isActive: true,
          }).select("_id name heading");
          departmentIds = deptDocs.map((d) => d._id);
          isDepartmentSearch = deptDocs.length > 0;
        } catch (e) {
          departmentIds = [];
        }

        // If it's a department search, show doctors in that department
        // If it's a doctor name search, do wildcard search on name
        const searchQuery = {
          ...baseQuery,
          $or: isDepartmentSearch
            ? [
                // Department search: show all doctors in that department
                departmentIds.length
                  ? { department: { $in: departmentIds } }
                  : null,
              ].filter(Boolean)
            : [
                // Doctor name search: wildcard search on name field
                { name: regex },
                // Also include specialization and bio for flexibility
                { specialization: regex },
                { bio: regex },
              ],
        };

        // Add location filter if present
        if (Object.keys(doctorLocationFilter).length > 0) {
          searchQuery.$and = [doctorLocationFilter];
        }

        console.log(
          "Doctor search query with text:",
          JSON.stringify(searchQuery, null, 2)
        );

        doctors = await Doctor.find(searchQuery)
          .select("-reviews -__v")
          .populate("department", "name")
          .populate("clinicDetails.clinic", "name address place state city")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      } else {
        // No text query, just location and filters
        const searchQuery = { ...baseQuery };

        // Add location filter if present
        if (Object.keys(doctorLocationFilter).length > 0) {
          Object.assign(searchQuery, doctorLocationFilter);
        }

        console.log(
          "Doctor search query (location only):",
          JSON.stringify(searchQuery, null, 2)
        );

        doctors = await Doctor.find(searchQuery)
          .select("-reviews -__v")
          .populate("department", "name")
          .populate("clinicDetails.clinic", "name address place state city")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      }

      console.log(`Found ${doctors.length} doctors before distance sorting`);

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

      console.log(`Found ${doctors.length} doctors`);
      results.doctors = doctors;
    }

    // --- CLINICS ---
    // Only search clinics if type is "all" or "clinics" (not when searching for ambulance specifically)
    if ((type === "all" || type === "clinics") && type !== "ambulance") {
      let baseQuery = { isActive: true };

      let clinics;
      const clinicLocationFilter = buildLocationFilter(
        ["place", "city"],
        ["state"]
      );

      if (q) {
        // Wildcard search for clinic names
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

        const searchQuery = {
          ...baseQuery,
          $or: [
            { name: regex },
            { services: { $in: [regex] } },
            doctorIds.length ? { "doctors.doctor": { $in: doctorIds } } : null,
          ].filter(Boolean),
        };

        // Add location filter if present
        if (Object.keys(clinicLocationFilter).length > 0) {
          searchQuery.$and = [clinicLocationFilter];
        }

        clinics = await Clinic.find(searchQuery)
          .select("-reviews -__v")
          .populate("doctors.doctor", "name qualification experience")
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      } else {
        const searchQuery = { ...baseQuery };

        // Add location filter if present
        if (Object.keys(clinicLocationFilter).length > 0) {
          Object.assign(searchQuery, clinicLocationFilter);
        }

        console.log(
          "Clinic search query (location only):",
          JSON.stringify(searchQuery, null, 2)
        );

        clinics = await Clinic.find(searchQuery)
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
      const pathologyLocationFilter = buildLocationFilter(
        ["place", "address", "city"],
        ["state"]
      );

      if (q) {
        const regex = new RegExp(q, "i");

        const searchQuery = {
          ...baseQuery,
          $or: [{ name: regex }, { category: regex }, { description: regex }],
        };

        // Add location filter if present
        if (Object.keys(pathologyLocationFilter).length > 0) {
          searchQuery.$and = [pathologyLocationFilter];
        }

        pathologies = await Pathology.find(searchQuery)
          .limit(lim * 3) // Get more results for distance sorting
          .lean();
      } else {
        const searchQuery = { ...baseQuery };

        // Add location filter if present
        if (Object.keys(pathologyLocationFilter).length > 0) {
          Object.assign(searchQuery, pathologyLocationFilter);
        }

        pathologies = await Pathology.find(searchQuery)
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
      const pharmacyLocationFilter = buildLocationFilter(
        ["city", "place"],
        ["state"]
      );

      if (q) {
        const regex = new RegExp(q, "i");

        try {
          const searchQuery = {
            $text: { $search: q },
            ...baseQuery,
          };

          // Add location filter if present
          if (Object.keys(pharmacyLocationFilter).length > 0) {
            searchQuery.$and = [pharmacyLocationFilter];
          }

          pharmacies = await Pharmacy.find(searchQuery)
            .select("-reviews -medications -__v")
            .limit(lim * 3)
            .lean();
        } catch (error) {
          // Fallback to manual search if text index fails
          const searchQuery = {
            ...baseQuery,
            name: regex,
          };

          // Add location filter if present
          if (Object.keys(pharmacyLocationFilter).length > 0) {
            Object.assign(searchQuery, pharmacyLocationFilter);
          }

          pharmacies = await Pharmacy.find(searchQuery)
            .select("-reviews -medications -__v")
            .limit(lim * 3)
            .lean();
        }
      } else {
        const searchQuery = { ...baseQuery };

        // Add location filter if present
        if (Object.keys(pharmacyLocationFilter).length > 0) {
          Object.assign(searchQuery, pharmacyLocationFilter);
        }

        pharmacies = await Pharmacy.find(searchQuery)
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
    // When type is "ambulance", ONLY search ambulances (not doctors/clinics)
    if (type === "ambulance" || type === "all") {
      let baseQuery = { isActive: true };

      let ambulances;
      // For ambulances, ONLY search by location (city, state, location)
      // Search box is only for ambulance location search
      const ambulanceLocationFilter = buildLocationFilter(
        ["city", "location"],
        ["state"]
      );

      // If query is provided, treat it as location search only (wildcard)
      if (q && !locationRegex) {
        const regex = new RegExp(q, "i");
        ambulances = await Ambulance.find({
          ...baseQuery,
          $or: [{ city: regex }, { state: regex }, { location: regex }],
        })
          .limit(lim * 3)
          .lean();
      } else {
        const searchQuery = { ...baseQuery };

        // Add location filter if present
        if (Object.keys(ambulanceLocationFilter).length > 0) {
          Object.assign(searchQuery, ambulanceLocationFilter);
        }

        console.log(
          "Ambulance search query (location only):",
          JSON.stringify(searchQuery, null, 2)
        );

        ambulances = await Ambulance.find(searchQuery)
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

    console.log("Total results:", totalResults);
    console.log(
      "Results breakdown:",
      Object.keys(results)
        .map((k) => `${k}: ${results[k]?.length || 0}`)
        .join(", ")
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
    
    // Normalize query to handle "Dr." with or without space for suggestions too
    let normalizedQuery = q;
    if (hasQuery) {
      normalizedQuery = q.replace(/\b(Dr|dr)\.?\s*/gi, (match) => {
        // Replace with pattern that matches "Dr" followed by optional "." and optional space
        return 'Dr\\.?\\s*';
      });
    }
    const regex = hasQuery ? new RegExp(normalizedQuery, "i") : null;

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

    // Ambulances - only show when type is "all" or "ambulance"
    if (type === "all" || type === "ambulance") {
      const ambulances = await Ambulance.find(
        hasQuery
          ? {
              isActive: true,
              // For ambulance suggestions, search by location (city, state, location)
              $or: [{ city: regex }, { state: regex }, { location: regex }],
            }
          : { isActive: true }
      )
        .select("name city state location")
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
