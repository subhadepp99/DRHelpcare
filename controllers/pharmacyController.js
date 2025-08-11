const Pharmacy = require("../models/Pharmacy");

exports.createPharmacy = async (req, res) => {
  try {
    const pharmacy = new Pharmacy({
      ...req.body,
      createdBy: req.user.id,
    });

    await pharmacy.save();

    res.status(201).json({
      message: "Pharmacy created successfully",
      pharmacy,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
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
    const pharmacy = await Pharmacy.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

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
