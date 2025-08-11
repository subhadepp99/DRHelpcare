const Clinic = require("../models/Clinic");

exports.createClinic = async (req, res) => {
  try {
    const clinic = new Clinic({
      ...req.body,
      createdBy: req.user.id,
    });

    await clinic.save();

    res.status(201).json({
      message: "Clinic created successfully",
      clinic,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          message:
            "Clinic with this email or registration number already exists",
        });
    }
    res.status(500).json({ message: "Error creating clinic" });
  }
};

exports.getAllClinics = async (req, res) => {
  try {
    const { page = 1, limit = 10, city, state } = req.query;

    let query = { isActive: true };

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["address.state"] = new RegExp(state, "i");
    }

    const clinics = await Clinic.find(query)
      .populate("createdBy", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Clinic.countDocuments(query);

    res.json({
      clinics,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching clinics" });
  }
};

exports.getClinicById = async (req, res) => {
  try {
    const clinic = await Clinic.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    res.json(clinic);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching clinic" });
  }
};

exports.updateClinic = async (req, res) => {
  try {
    const clinic = await Clinic.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    res.json({
      message: "Clinic updated successfully",
      clinic,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating clinic" });
  }
};

exports.deleteClinic = async (req, res) => {
  try {
    const clinic = await Clinic.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!clinic) {
      return res.status(404).json({ message: "Clinic not found" });
    }

    res.json({ message: "Clinic deactivated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting clinic" });
  }
};
