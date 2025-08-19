const User = require("../models/User");
const { createActivity } = require("../utils/activity");
const { prepareImageForDB, bufferToBase64 } = require("../utils/imageUpload");
const {
  hashPassword,
  comparePassword,
  validatePassword,
} = require("../utils/passwordUtils");

exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      role = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    if (search) {
      query.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { username: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { phone: new RegExp(search, "i") },
      ];
    }

    if (role) {
      query.role = role;
    }

    const sortObj = {};
    sortObj[sortBy] = sortOrder === "desc" ? -1 : 1;

    const users = await User.find(query)
      .select("-password -__v -profileImage.data") // Exclude image data for list view
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    const usersWithImage = users.map((user) => {
      const userObj = user.toObject();
      if (userObj.profileImage && userObj.profileImage.data) {
        userObj.profileImage = bufferToBase64(
          userObj.profileImage.data,
          userObj.profileImage.contentType
        );
      } else {
        userObj.profileImage = null;
      }
      return userObj;
    });

    res.json({
      success: true,
      data: {
        users: usersWithImage,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userObj = user.toObject();
    if (userObj.profileImage && userObj.profileImage.data) {
      userObj.profileImage = bufferToBase64(
        userObj.profileImage.data,
        userObj.profileImage.contentType
      );
    } else {
      userObj.profileImage = null;
    }

    res.json({
      success: true,
      data: userObj,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = { ...req.body };

    if (
      req.user.id !== userId &&
      !["admin", "superuser"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (req.file) {
      const imageResult = prepareImageForDB(req.file);
      if (!imageResult.success) {
        return res
          .status(400)
          .json({ success: false, message: imageResult.error });
      }
      updates.profileImage = imageResult.imageData;
    } else if (updates.profileImage === null) {
      // If profileImage is explicitly set to null, remove the image
      updates.$unset = { profileImage: 1 };
      delete updates.profileImage; // Remove from updates object to avoid conflicts
    }

    delete updates.password;
    delete updates.role;

    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password -__v");

    await createActivity({
      type: "user_updated",
      message: `User ${updatedUser.username} updated their profile`,
      user: req.user.id,
      targetId: updatedUser._id,
      targetModel: "User",
    });

    const updatedUserObj = updatedUser.toObject();
    if (updatedUserObj.profileImage && updatedUserObj.profileImage.data) {
      updatedUserObj.profileImage = bufferToBase64(
        updatedUserObj.profileImage.data,
        updatedUserObj.profileImage.contentType
      );
    } else {
      updatedUserObj.profileImage = null;
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUserObj,
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["user", "admin", "superuser"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    if (
      req.user.id === id &&
      req.user.role === "superuser" &&
      role !== "superuser"
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot demote yourself from superuser role",
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select("-password -__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await createActivity({
      type: "user_updated",
      message: `User ${user.username} role changed to ${role}`,
      user: req.user.id,
      targetId: user._id,
      targetModel: "User",
    });

    res.json({
      success: true,
      message: "User role updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Update user role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user role",
      error: error.message,
    });
  }
};

exports.deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: "Cannot deactivate your own account",
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role === "superuser" && req.user.role !== "superuser") {
      return res.status(403).json({
        success: false,
        message: "Cannot deactivate superuser account",
      });
    }

    user.isActive = false;
    await user.save();

    await createActivity({
      type: "user_deleted",
      message: `User ${user.username} was deactivated`,
      user: req.user.id,
      targetId: user._id,
      targetModel: "User",
    });

    res.json({
      success: true,
      message: "User deactivated successfully",
    });
  } catch (error) {
    console.error("Deactivate user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to deactivate user",
      error: error.message,
    });
  }
};

exports.getUserImage = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user || !user.profileImage || !user.profileImage.data) {
      return res.status(404).json({
        success: false,
        message: "Profile image not found",
      });
    }

    res.set("Content-Type", user.profileImage.contentType);
    res.send(user.profileImage.data);
  } catch (error) {
    console.error("Get user image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch image",
      error: error.message,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (req.user.id !== id && !["admin", "superuser"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const newPasswordValidation = validatePassword(newPassword);
    if (!newPasswordValidation.success) {
      return res
        .status(400)
        .json({ success: false, message: newPasswordValidation.message });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (req.user.id === id) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required",
        });
      }

      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};
