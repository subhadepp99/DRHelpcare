const Test = require("../models/Test");
const Pathology = require("../models/Pathology");

// Get all tests
const getAllTests = async (req, res) => {
  try {
    const tests = await Test.find({ isActive: true })
      .populate("pathologyLab", "name address place state phone email")
      .select("-__v")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        tests,
        total: tests.length,
      },
    });
  } catch (error) {
    console.error("Error fetching tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tests",
    });
  }
};

// Get all tests for admin
const getAllTestsForAdmin = async (req, res) => {
  try {
    const tests = await Test.find()
      .populate("pathologyLab", "name address place state phone email")
      .select("-__v")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        tests,
        total: tests.length,
      },
    });
  } catch (error) {
    console.error("Error fetching tests for admin:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tests",
    });
  }
};

// Get test by ID
const getTestById = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate("pathologyLab", "name address place state phone email imageUrl")
      .select("-__v");

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    res.json({
      success: true,
      data: {
        test,
      },
    });
  } catch (error) {
    console.error("Error fetching test:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch test",
    });
  }
};

// Search tests
const searchTests = async (req, res) => {
  try {
    const { name = "", category = "", sampleType = "" } = req.query;

    const query = { isActive: true };

    if (name) {
      query.$or = [
        { name: new RegExp(name, "i") },
        { description: new RegExp(name, "i") },
      ];
    }

    if (category) {
      query.category = new RegExp(category, "i");
    }

    if (sampleType) {
      query.sampleType = new RegExp(sampleType, "i");
    }

    const tests = await Test.find(query)
      .populate("pathologyLab", "name address place state phone email")
      .select("-__v")
      .limit(50);

    res.json({
      success: true,
      data: {
        tests,
        total: tests.length,
      },
    });
  } catch (error) {
    console.error("Error searching tests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search tests",
    });
  }
};

// Create new test (admin only)
const createTest = async (req, res) => {
  try {
    const testData = { ...req.body };

    // Parse JSON fields
    if (testData.components && typeof testData.components === "string") {
      try {
        testData.components = JSON.parse(testData.components);
      } catch (e) {
        testData.components = [];
      }
    }

    // Handle homeCollection from FormData
    const hasHc =
      req.body["homeCollection[available]"] !== undefined ||
      req.body["homeCollection[fee]"] !== undefined ||
      req.body["homeCollection[areas]"] !== undefined ||
      req.body["homeCollection[timing][start]"] !== undefined ||
      req.body["homeCollection[timing][end]"] !== undefined;

    if (hasHc) {
      const availableRaw = req.body["homeCollection[available]"];
      const feeRaw = req.body["homeCollection[fee]"];
      const areasRaw = req.body["homeCollection[areas]"];
      const startRaw = req.body["homeCollection[timing][start]"];
      const endRaw = req.body["homeCollection[timing][end]"];

      testData.homeCollection = {
        available:
          availableRaw === true ||
          availableRaw === "true" ||
          availableRaw === 1 ||
          availableRaw === "1",
        fee: Number(feeRaw) || 0,
        areas: Array.isArray(areasRaw)
          ? areasRaw.filter((a) => a && String(a).trim())
          : areasRaw
          ? [String(areasRaw).trim()].filter((a) => a)
          : [],
        timing: {
          start: startRaw ? String(startRaw) : "",
          end: endRaw ? String(endRaw) : "",
        },
      };
    }

    // Set defaults
    if (!testData.turnaroundTime) testData.turnaroundTime = "24 hours";
    if (!testData.reportTime) testData.reportTime = "24 hours";
    if (!testData.isActive) testData.isActive = true;
    if (!testData.components) testData.components = [];

    // Validate required fields
    const requiredFields = [
      "name",
      "category",
      "price",
      "sampleType",
      "pathologyLab",
      "address",
      "place",
      "state",
      "zipCode",
    ];
    const missingFields = requiredFields.filter(
      (field) => !testData[field] || testData[field].toString().trim() === ""
    );
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Verify pathology lab exists
    const pathologyLab = await Pathology.findById(testData.pathologyLab);
    if (!pathologyLab) {
      return res.status(400).json({
        success: false,
        message: "Pathology lab not found",
      });
    }

    // Handle image upload
    if (req.file) {
      testData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      testData.imageUrl = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;
    }

    const test = new Test(testData);
    await test.save();

    res.status(201).json({
      success: true,
      data: test,
    });
  } catch (error) {
    console.error("Error creating test:", error);
    let errorMessage = "Failed to create test";
    if (error.name === "ValidationError") {
      errorMessage =
        "Validation error: " +
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", ");
    } else if (error.code === 11000) {
      errorMessage = "Duplicate key error - this value already exists";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
  }
};

// Update test (admin only)
const updateTest = async (req, res) => {
  try {
    const updates = { ...req.body };

    // Parse JSON fields
    if (updates.components && typeof updates.components === "string") {
      try {
        updates.components = JSON.parse(updates.components);
      } catch (e) {
        updates.components = [];
      }
    }

    // Handle homeCollection from FormData
    const hasHcUpdate =
      req.body["homeCollection[available]"] !== undefined ||
      req.body["homeCollection[fee]"] !== undefined ||
      req.body["homeCollection[areas]"] !== undefined ||
      req.body["homeCollection[timing][start]"] !== undefined ||
      req.body["homeCollection[timing][end]"] !== undefined;

    if (hasHcUpdate) {
      const availableRaw = req.body["homeCollection[available]"];
      const feeRaw = req.body["homeCollection[fee]"];
      const areasRaw = req.body["homeCollection[areas]"];
      const startRaw = req.body["homeCollection[timing][start]"];
      const endRaw = req.body["homeCollection[timing][end]"];

      updates.homeCollection = {
        available:
          availableRaw === true ||
          availableRaw === "true" ||
          availableRaw === 1 ||
          availableRaw === "1",
        fee: Number(feeRaw) || 0,
        areas: Array.isArray(areasRaw)
          ? areasRaw.filter((a) => a && String(a).trim())
          : areasRaw
          ? [String(areasRaw).trim()].filter((a) => a)
          : [],
        timing: {
          start: startRaw ? String(startRaw) : "",
          end: endRaw ? String(endRaw) : "",
        },
      };
    }

    // Coerce primitive types
    if (updates.price != null) {
      const n = Number(updates.price);
      updates.price = isNaN(n) ? 0 : n;
    }
    if (updates.isActive != null) {
      updates.isActive =
        updates.isActive === true || updates.isActive === "true";
    }

    const test = await Test.findById(req.params.id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // Handle image update
    if (req.file) {
      updates.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      updates.imageUrl = `data:${
        req.file.mimetype
      };base64,${req.file.buffer.toString("base64")}`;
    }

    const updatedTest = await Test.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      data: updatedTest,
    });
  } catch (error) {
    console.error("Error updating test:", error);
    let errorMessage = "Failed to update test";
    if (error.name === "ValidationError") {
      errorMessage =
        "Validation error: " +
        Object.values(error.errors)
          .map((e) => e.message)
          .join(", ");
    } else if (error.code === 11000) {
      errorMessage = "Duplicate key error - this value already exists";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
    });
  }
};

// Delete test (admin only)
const deleteTest = async (req, res) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // Remove test from any packages that reference it
    await Pathology.updateMany(
      { tests: req.params.id },
      { $pull: { tests: req.params.id } }
    );

    res.json({
      success: true,
      message: "Test deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting test:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete test",
    });
  }
};

// Get test image
const getTestImage = async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);

    if (!test || !test.image || !test.image.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", test.image.contentType);
    res.send(test.image.data);
  } catch (error) {
    console.error("Get test image error:", error);
    res.status(500).json({ message: "Error fetching image" });
  }
};

module.exports = {
  getAllTests,
  getAllTestsForAdmin,
  getTestById,
  searchTests,
  createTest,
  updateTest,
  deleteTest,
  getTestImage,
};
