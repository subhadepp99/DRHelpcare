const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");
const Patient = require("../models/Patient");
const Pathology = require("../models/Pathology"); // Import Pathology model
const Ambulance = require("../models/Ambulance"); // Import Ambulance model

// Helper to check if location params are present
function hasLocationParams(query) {
  return query.city || query.state || query.lat || query.lng;
}

// Helper to check if text search is possible
function canTextSearch(model) {
  // You may want to check if the model has a text index
  // For simplicity, assume all models support $text if needed
  return true;
}

exports.globalSearch = async (req, res) => {
  try {
    const {
      query,
      type,
      limit = 50,
      city,
      state,
      lat,
      lng,
      specialization,
      experience,
      fee,
      rating,
      department,
    } = req.query;

    // Validation: Don't allow text and location search together
    if (query && hasLocationParams(req.query)) {
      return res.status(400).json({
        message:
          "Cannot perform text and location search together. Please use only one type of search.",
      });
    }

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const results = {};

    // Helper for text or regex search
    async function searchModel(
      model,
      textFields,
      extraQuery = {},
      selectFields = "",
      limitVal = limit
    ) {
      let docs = [];
      if (canTextSearch(model)) {
        // Try $text search first
        docs = await model
          .find({ $text: { $search: query }, isActive: true, ...extraQuery })
          .select(selectFields)
          .limit(parseInt(limitVal));
      }
      // If no results or $text not supported, fallback to regex/wildcard
      if (!docs.length) {
        const searchRegex = new RegExp(query, "i");
        docs = await model
          .find({
            isActive: true,
            $or: textFields.map((field) => ({ [field]: searchRegex })),
            ...extraQuery,
          })
          .select(selectFields)
          .limit(parseInt(limitVal));
      }
      return docs;
    }

    // Search doctors with advanced filters
    if (!type || type === "doctors") {
      const doctorExtraQuery = {};

      // Specialization filter
      if (specialization) {
        doctorExtraQuery.specialization = new RegExp(specialization, "i");
      }

      // Department filter
      if (department) {
        // Assuming department is populated or stored as reference
        doctorExtraQuery.department = department;
      }

      // Experience filter (expects format like "0-2", "3-5", "10+")
      if (experience) {
        if (experience === "10+") {
          doctorExtraQuery.experienceYears = { $gte: 10 };
        } else {
          const [min, max] = experience.split("-").map(Number);
          doctorExtraQuery.experienceYears = { $gte: min, $lte: max };
        }
      }

      // Fee filter (expects format like "0-500", "2000+")
      if (fee) {
        if (fee === "2000+") {
          doctorExtraQuery.consultationFee = { $gte: 2000 };
        } else {
          const [min, max] = fee.split("-").map(Number);
          doctorExtraQuery.consultationFee = { $gte: min, $lte: max };
        }
      }

      // Rating filter
      if (rating) {
        doctorExtraQuery["ratings.average"] = { $gte: parseFloat(rating) };
      }

      results.doctors = await searchModel(
        Doctor,
        ["name", "specialization", "address.city"],
        doctorExtraQuery,
        "-image.data"
      );

      // Populate department for doctors
      if (results.doctors && results.doctors.length > 0) {
        results.doctors = await Doctor.populate(results.doctors, {
          path: "department",
          select: "name",
        });
      }
    }

    // Search clinics
    if (!type || type === "clinics") {
      results.clinics = await searchModel(
        Clinic,
        ["name", "address.city", "services"],
        {},
        ""
      );
    }

    // Search pharmacies
    if (!type || type === "pharmacies") {
      results.pharmacies = await searchModel(
        Pharmacy,
        ["name", "address.city", "services"],
        {},
        ""
      );
    }

    // Search pathology labs
    if (!type || type === "pathologies") {
      results.pathologies = await searchModel(
        Pathology,
        ["name", "address.city", "servicesOffered", "testsOffered.name"],
        {},
        "-image.data"
      );
    }

    // Search ambulances
    if (!type || type === "ambulance") {
      results.ambulances = await searchModel(
        Ambulance,
        ["name", "location", "city", "driverName"],
        {},
        ""
      );
    }

    // Search patients (only if user has appropriate permissions)
    if (
      req.user &&
      (req.user.role === "admin" || req.user.role === "superuser")
    ) {
      if (!type || type === "patients") {
        results.patients = await searchModel(
          Patient,
          ["firstName", "lastName", "email", "phone"],
          {},
          "-medicalHistory -allergies"
        );
      }
    }

    // Validation: If all results are empty, return a message
    const totalResults = Object.values(results).reduce(
      (sum, arr) => sum + (arr ? arr.length : 0),
      0
    );
    if (totalResults === 0) {
      return res
        .status(404)
        .json({ message: "No matching results found", query });
    }

    res.json({
      query,
      results,
      totalResults,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error performing search" });
  }
};

exports.searchByLocation = async (req, res) => {
  try {
    const {
      city,
      state,
      pincode,
      type,
      query,
      limit = 50,
      specialization,
      experience,
      fee,
      rating,
      department,
    } = req.query;

    // Validation: Don't allow text and location search together
    if (query && (city || state || pincode)) {
      return res.status(400).json({
        message:
          "Cannot perform text and location search together. Please use only one type of search.",
      });
    }

    if (!city && !state && !pincode) {
      return res
        .status(400)
        .json({ message: "City, state, or pincode is required" });
    }

    let locationQuery = {};

    // Build location query - support multiple fields for different models
    const buildLocationFilter = (cityField, stateField, zipField) => {
      const filter = { isActive: true };
      if (city) filter[cityField] = new RegExp(city, "i");
      if (state) filter[stateField] = new RegExp(state, "i");
      if (pincode) filter[zipField] = new RegExp(pincode, "i");
      return filter;
    };

    const results = {};

    if (!type || type === "doctors") {
      const doctorFilter = buildLocationFilter(
        "city",
        "state",
        "address.zipCode"
      );

      // Apply advanced filters
      if (specialization) {
        doctorFilter.specialization = new RegExp(specialization, "i");
      }

      if (department) {
        doctorFilter.department = department;
      }

      if (experience) {
        if (experience === "10+") {
          doctorFilter.experienceYears = { $gte: 10 };
        } else {
          const [min, max] = experience.split("-").map(Number);
          doctorFilter.experienceYears = { $gte: min, $lte: max };
        }
      }

      if (fee) {
        if (fee === "2000+") {
          doctorFilter.consultationFee = { $gte: 2000 };
        } else {
          const [min, max] = fee.split("-").map(Number);
          doctorFilter.consultationFee = { $gte: min, $lte: max };
        }
      }

      if (rating) {
        doctorFilter["ratings.average"] = { $gte: parseFloat(rating) };
      }

      results.doctors = await Doctor.find(doctorFilter)
        .select("-image.data")
        .limit(parseInt(limit))
        .populate("department", "name");
    }

    if (!type || type === "clinics") {
      results.clinics = await Clinic.find(
        buildLocationFilter("place", "state", "zipCode")
      ).limit(parseInt(limit));
    }

    if (!type || type === "pharmacies") {
      results.pharmacies = await Pharmacy.find(
        buildLocationFilter("address.city", "address.state", "address.zipCode")
      ).limit(parseInt(limit));
    }

    if (!type || type === "pathologies") {
      results.pathologies = await Pathology.find(
        buildLocationFilter("place", "state", "zipCode")
      )
        .select("-image.data")
        .limit(parseInt(limit));
    }

    if (!type || type === "ambulance") {
      results.ambulances = await Ambulance.find(
        buildLocationFilter("city", "location", "city")
      ).limit(parseInt(limit));
    }

    // Validation: If all results are empty, return a message
    const totalResults = Object.values(results).reduce(
      (sum, arr) => sum + (arr ? arr.length : 0),
      0
    );
    if (totalResults === 0) {
      return res.status(404).json({
        message: "No matching results found",
        location: { city, state, pincode },
      });
    }

    res.json({
      location: { city, state, pincode },
      results,
      totalResults,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error searching by location" });
  }
};
