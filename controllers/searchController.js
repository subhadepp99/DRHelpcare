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
    const { query, type, limit = 5, city, state, lat, lng } = req.query;

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

    // Search doctors
    if (!type || type === "doctors") {
      results.doctors = await searchModel(
        Doctor,
        ["name", "specialization", "address.city"],
        {},
        "-image.data"
      );
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
    const { city, state, type, query } = req.query;

    // Validation: Don't allow text and location search together
    if (query && (city || state)) {
      return res.status(400).json({
        message:
          "Cannot perform text and location search together. Please use only one type of search.",
      });
    }

    if (!city && !state) {
      return res.status(400).json({ message: "City or state is required" });
    }

    let locationQuery = {};
    if (city) locationQuery["address.city"] = new RegExp(city, "i");
    if (state) locationQuery["address.state"] = new RegExp(state, "i");

    const results = {};

    if (!type || type === "doctors") {
      results.doctors = await Doctor.find({
        isActive: true,
        ...locationQuery,
      }).select("-image.data");
    }

    if (!type || type === "clinics") {
      results.clinics = await Clinic.find({
        isActive: true,
        ...locationQuery,
      });
    }

    if (!type || type === "pharmacies") {
      results.pharmacies = await Pharmacy.find({
        isActive: true,
        ...locationQuery,
      });
    }

    if (!type || type === "pathologies") {
      results.pathologies = await Pathology.find({
        isActive: true,
        ...locationQuery,
      }).select("-image.data");
    }

    if (!type || type === "ambulance") {
      results.ambulances = await Ambulance.find({
        isActive: true,
        ...locationQuery,
      });
    }

    // Validation: If all results are empty, return a message
    const totalResults = Object.values(results).reduce(
      (sum, arr) => sum + (arr ? arr.length : 0),
      0
    );
    if (totalResults === 0) {
      return res.status(404).json({
        message: "No matching results found",
        location: { city, state },
      });
    }

    res.json({
      location: { city, state },
      results,
      totalResults,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error searching by location" });
  }
};
