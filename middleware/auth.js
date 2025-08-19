const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Basic authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "healthcare_secret_key_2024"
    );

    const user = await User.findById(decoded.userId).select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid token or user not found.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    console.error("Auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed.",
      error: error.message,
    });
  }
};

// Admin authentication middleware (admin, superuser, masteruser)
const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (
        !req.user ||
        !["admin", "superuser", "masteruser"].includes(req.user.role)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin privileges required.",
        });
      }
      next();
    });
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed.",
      error: error.message,
    });
  }
};

// Superuser authentication middleware (superuser, masteruser)
const superuserAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (!req.user || !["superuser", "masteruser"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Superuser privileges required.",
        });
      }
      next();
    });
  } catch (error) {
    console.error("Superuser auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed.",
      error: error.message,
    });
  }
};

// Masteruser authentication middleware (masteruser only)
const masteruserAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (!req.user || req.user.role !== "masteruser") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Masteruser privileges required.",
        });
      }
      next();
    });
  } catch (error) {
    console.error("Masteruser auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication failed.",
      error: error.message,
    });
  }
};

// Optional authentication middleware (doesn't require token)
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (token) {
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || "healthcare_secret_key_2024"
        );

        const user = await User.findById(decoded.userId).select("-password");

        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // Ignore token errors in optional auth
        console.log("Optional auth token invalid:", error.message);
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    next(); // Continue even if there's an error
  }
};

module.exports = {
  auth,
  adminAuth,
  superuserAuth,
  masteruserAuth,
  optionalAuth,
};
