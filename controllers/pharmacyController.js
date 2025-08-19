const Pharmacy = require("../models/Pharmacy");

exports.createPharmacy = async (req, res) => {
  try {
    const pharmacyData = { ...req.body, createdBy: req.user.id };

    // Parse address if it's a string
    if (typeof pharmacyData.address === "string") {
      pharmacyData.address = JSON.parse(pharmacyData.address);
    }

    // Handle location coordinates
    if (pharmacyData.latitude && pharmacyData.longitude) {
      pharmacyData.address.location = {
        type: "Point",
        coordinates: [
          parseFloat(pharmacyData.longitude),
          parseFloat(pharmacyData.latitude),
        ],
      };
      delete pharmacyData.latitude;
      delete pharmacyData.longitude;
    }

    const pharmacy = new Pharmacy(pharmacyData);
    await pharmacy.save();

    res.status(201).json({
      message: "Pharmacy created successfully",
      pharmacy,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Pharmacy with this email or license number already exists",
      });
    }
    res.status(500).json({ message: "Error creating pharmacy" });
  }
};

exports.getAllPharmacies = async (req, res) => {
  try {
    const { page = 1, limit = 10, city, state } = req.query;

    let query = { isActive: true };

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["address.state"] = new RegExp(state, "i");
    }

    const pharmacies = await Pharmacy.find(query)
      .populate("createdBy", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Pharmacy.countDocuments(query);

    res.json({
      pharmacies,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching pharmacies" });
  }
};

exports.getPharmacyById = async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy not found" });
    }

    res.json(pharmacy);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching pharmacy" });
  }
};

exports.updatePharmacy = async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Parse address if it's a string
    if (typeof updateData.address === "string") {
      updateData.address = JSON.parse(updateData.address);
    }

    // Handle location coordinates
    if (updateData.latitude && updateData.longitude) {
      updateData.address.location = {
        type: "Point",
        coordinates: [
          parseFloat(updateData.longitude),
          parseFloat(updateData.latitude),
        ],
      };
      delete updateData.latitude;
      delete updateData.longitude;
    } else if (updateData.latitude === null || updateData.longitude === null) {
      updateData.$unset = { "address.location": 1 };
      delete updateData.latitude;
      delete updateData.longitude;
    }

    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy not found" });
    }

    res.json({
      message: "Pharmacy updated successfully",
      pharmacy,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating pharmacy" });
  }
};

exports.deletePharmacy = async (req, res) => {
  try {
    const pharmacy = await Pharmacy.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!pharmacy) {
      return res.status(404).json({ message: "Pharmacy not found" });
    }

    res.json({ message: "Pharmacy deactivated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting pharmacy" });
  }
};
