const Patient = require("../models/Patient");

exports.createPatient = async (req, res) => {
  try {
    const patient = new Patient({
      ...req.body,
      createdBy: req.user.id,
    });

    await patient.save();

    res.status(201).json({
      message: "Patient registered successfully",
      patient,
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "Patient with this email already exists" });
    }
    res.status(500).json({ message: "Error registering patient" });
  }
};

exports.getAllPatients = async (req, res) => {
  try {
    const { page = 1, limit = 10, bloodGroup, city } = req.query;

    let query = { isActive: true };

    if (bloodGroup) {
      query.bloodGroup = bloodGroup;
    }

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    const patients = await Patient.find(query)
      .populate("createdBy", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Patient.countDocuments(query);

    res.json({
      patients,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching patients" });
  }
};

exports.getPatientById = async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json(patient);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching patient" });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json({
      message: "Patient updated successfully",
      patient,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating patient" });
  }
};

exports.deletePatient = async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json({ message: "Patient deactivated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting patient" });
  }
};
