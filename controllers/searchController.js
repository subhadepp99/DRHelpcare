const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");
const Pharmacy = require("../models/Pharmacy");
const Patient = require("../models/Patient");

exports.globalSearch = async (req, res) => {
  try {
    const { query, type, limit = 5 } = req.query;

    if (!query) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const searchRegex = new RegExp(query, "i");
    const results = {};

    // Search doctors
    if (!type || type === "doctors") {
      results.doctors = await Doctor.find({
        isActive: true,
        $or: [
          { name: searchRegex },
          { specialization: searchRegex },
          { "address.city": searchRegex },
        ],
      })
        .select("-image.data")
        .limit(parseInt(limit));
    }

    // Search clinics
    if (!type || type === "clinics") {
      results.clinics = await Clinic.find({
        isActive: true,
        $or: [
          { name: searchRegex },
          { "address.city": searchRegex },
          { services: { $in: [searchRegex] } },
        ],
      }).limit(parseInt(limit));
    }

    // Search pharmacies
    if (!type || type === "pharmacies") {
      results.pharmacies = await Pharmacy.find({
        isActive: true,
        $or: [
          { name: searchRegex },
          { "address.city": searchRegex },
          { services: { $in: [searchRegex] } },
        ],
      }).limit(parseInt(limit));
    }

    // Search patients (only if user has appropriate permissions)
    if (
      req.user &&
      (req.user.role === "admin" || req.user.role === "superuser")
    ) {
      if (!type || type === "patients") {
        results.patients = await Patient.find({
          isActive: true,
          $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
          ],
        })
          .select("-medicalHistory -allergies")
          .limit(parseInt(limit));
      }
    }

    res.json({
      query,
      results,
      totalResults: Object.values(results).reduce(
        (sum, arr) => sum + arr.length,
        0
      ),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error performing search" });
  }
};

exports.searchByLocation = async (req, res) => {
  try {
    const { city, state, type } = req.query;

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

    res.json({
      location: { city, state },
      results,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error searching by location" });
  }
};
