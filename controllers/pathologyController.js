const Pathology = require("../models/Pathology");
const { prepareImageForDB, bufferToBase64 } = require("../utils/imageUpload");

exports.createPathology = async (req, res) => {
  try {
    const pathologyData = { ...req.body, createdBy: req.user.id };

    // Parse address if it's a string
    if (typeof pathologyData.address === "string") {
      pathologyData.address = JSON.parse(pathologyData.address);
    }

    // Handle location coordinates
    if (pathologyData.latitude && pathologyData.longitude) {
      pathologyData.address.location = {
        type: "Point",
        coordinates: [
          parseFloat(pathologyData.longitude),
          parseFloat(pathologyData.latitude),
        ],
      };
      delete pathologyData.latitude;
      delete pathologyData.longitude;
    }

    if (req.file) {
      const imageResult = prepareImageForDB(req.file);
      if (!imageResult.success) {
        return res
          .status(400)
          .json({ success: false, message: imageResult.error });
      }
      pathologyData.image = imageResult.imageData;
    }

    const pathology = new Pathology(pathologyData);
    await pathology.save();

    const pathologyObj = pathology.toObject();
    if (pathologyObj.image && pathologyObj.image.data) {
      pathologyObj.image = bufferToBase64(
        pathologyObj.image.data,
        pathologyObj.image.contentType
      );
    } else {
      pathologyObj.image = null;
    }

    res.status(201).json({
      message: "Pathology lab created successfully",
      pathology: pathologyObj,
    });
  } catch (error) {
    console.error("Error creating pathology lab:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        message:
          "Pathology lab with this email or license number already exists",
      });
    }
    res.status(500).json({ message: "Error creating pathology lab" });
  }
};

exports.getAllPathologies = async (req, res) => {
  try {
    const { page = 1, limit = 10, city, state, search } = req.query;

    let query = { isActive: true };

    if (city) {
      query["address.city"] = new RegExp(city, "i");
    }

    if (state) {
      query["address.state"] = new RegExp(state, "i");
    }

    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { "address.city": new RegExp(search, "i") },
        { servicesOffered: new RegExp(search, "i") },
        { "testsOffered.name": new RegExp(search, "i") },
      ];
    }

    const pathologies = await Pathology.find(query)
      .select("-image.data")
      .populate("createdBy", "firstName lastName")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Pathology.countDocuments(query);

    const pathologiesWithImage = pathologies.map((lab) => {
      const labObj = lab.toObject();
      if (labObj.image && labObj.image.data) {
        labObj.image = bufferToBase64(
          labObj.image.data,
          labObj.image.contentType
        );
      } else {
        labObj.image = null;
      }
      return labObj;
    });

    res.json({
      pathologies: pathologiesWithImage,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching pathology labs:", error);
    res.status(500).json({ message: "Error fetching pathology labs" });
  }
};

exports.getPathologyById = async (req, res) => {
  try {
    const pathology = await Pathology.findById(req.params.id).populate(
      "createdBy",
      "firstName lastName"
    );

    if (!pathology) {
      return res.status(404).json({ message: "Pathology lab not found" });
    }

    const pathologyObj = pathology.toObject();
    if (pathologyObj.image && pathologyObj.image.data) {
      pathologyObj.image = bufferToBase64(
        pathologyObj.image.data,
        pathologyObj.image.contentType
      );
    } else {
      pathologyObj.image = null;
    }

    res.json(pathologyObj);
  } catch (error) {
    console.error("Error fetching pathology lab:", error);
    res.status(500).json({ message: "Error fetching pathology lab" });
  }
};

exports.updatePathology = async (req, res) => {
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

    if (req.file) {
      const imageResult = prepareImageForDB(req.file);
      if (!imageResult.success) {
        return res
          .status(400)
          .json({ success: false, message: imageResult.error });
      }
      updateData.image = imageResult.imageData;
    } else if (updateData.image === null) {
      updateData.$unset = { image: 1 };
      delete updateData.image;
    }

    const pathology = await Pathology.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).populate("createdBy", "firstName lastName");

    if (!pathology) {
      return res.status(404).json({ message: "Pathology lab not found" });
    }

    const pathologyObj = pathology.toObject();
    if (pathologyObj.image && pathologyObj.image.data) {
      pathologyObj.image = bufferToBase64(
        pathologyObj.image.data,
        pathologyObj.image.contentType
      );
    } else {
      pathologyObj.image = null;
    }

    res.json({
      message: "Pathology lab updated successfully",
      pathology: pathologyObj,
    });
  } catch (error) {
    console.error("Error updating pathology lab:", error);
    res.status(500).json({ message: "Error updating pathology lab" });
  }
};

exports.deletePathology = async (req, res) => {
  try {
    const pathology = await Pathology.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!pathology) {
      return res.status(404).json({ message: "Pathology lab not found" });
    }

    res.json({ message: "Pathology lab deactivated successfully" });
  } catch (error) {
    console.error("Error deleting pathology lab:", error);
    res.status(500).json({ message: "Error deleting pathology lab" });
  }
};

exports.getPathologyImage = async (req, res) => {
  try {
    const pathology = await Pathology.findById(req.params.id);

    if (!pathology || !pathology.image || !pathology.image.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", pathology.image.contentType);
    res.send(pathology.image.data);
  } catch (error) {
    console.error("Error fetching pathology image:", error);
    res.status(500).json({ message: "Error fetching image" });
  }
};

exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const pathologyId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const pathology = await Pathology.findById(pathologyId);
    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology lab not found",
      });
    }

    const existingReview = pathology.reviews.find(
      (review) => review.patient.toString() === req.user.id
    );

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this pathology lab",
      });
    }

    pathology.reviews.push({
      patient: req.user.id,
      rating: parseInt(rating),
      comment: comment || "",
      date: new Date(),
    });

    const sum = pathology.reviews.reduce(
      (acc, review) => acc + review.rating,
      0
    );
    pathology.rating.average = (sum / pathology.reviews.length).toFixed(1);
    pathology.rating.count = pathology.reviews.length;

    await pathology.save();
    await pathology.populate("reviews.patient", "firstName lastName");

    res.json({
      success: true,
      message: "Review added successfully",
      data: pathology,
    });
  } catch (error) {
    console.error("Add pathology review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add review",
      error: error.message,
    });
  }
};

exports.searchTests = async (req, res) => {
  try {
    const { search = "", category = "", page = 1, limit = 20 } = req.query;
    const pathologyId = req.params.id;

    const pathology = await Pathology.findById(pathologyId);
    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology lab not found",
      });
    }

    let tests = pathology.testsOffered || [];

    if (search) {
      tests = tests.filter((test) =>
        test.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (category) {
      tests = tests.filter(
        (test) => test.category.toLowerCase() === category.toLowerCase()
      );
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedTests = tests.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        tests: paginatedTests,
        pagination: {
          total: tests.length,
          page: parseInt(page),
          pages: Math.ceil(tests.length / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Search tests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search tests",
      error: error.message,
    });
  }
};

exports.addTest = async (req, res) => {
  try {
    const pathologyId = req.params.id;
    const { name, category, price, requiresPrescription = false } = req.body;

    const pathology = await Pathology.findById(pathologyId);
    if (!pathology) {
      return res.status(404).json({
        success: false,
        message: "Pathology lab not found",
      });
    }

    const existingTest = pathology.testsOffered.find(
      (test) => test.name.toLowerCase() === name.toLowerCase()
    );

    if (existingTest) {
      return res.status(400).json({
        success: false,
        message: "Test already exists in this pathology lab",
      });
    }

    pathology.testsOffered.push({
      name,
      category,
      price: parseFloat(price),
      requiresPrescription,
    });

    await pathology.save();

    res.status(201).json({
      success: true,
      message: "Test added successfully",
      data: pathology.testsOffered[pathology.testsOffered.length - 1],
    });
  } catch (error) {
    console.error("Add test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add test",
      error: error.message,
    });
  }
};
