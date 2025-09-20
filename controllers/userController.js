const User = require("../models/User");
const ArchiveUser = require("../models/ArchiveUser");
const { createActivity } = require("../utils/activity");

const path = require("path");
const fs = require("fs");
const {
  hashPassword,
  comparePassword,
  validatePassword,
} = require("../utils/passwordUtils");

// Helper: build data URL from stored image
function buildDataUrl(image) {
  try {
    if (!image || !image.data || !image.contentType) return null;
    const base64 = Buffer.isBuffer(image.data)
      ? image.data.toString("base64")
      : typeof image.data === "string"
      ? image.data
      : Buffer.from(image.data.data || []).toString("base64");
    return `data:${image.contentType};base64,${base64}`;
  } catch (_) {
    return null;
  }
}

exports.createUser = async (req, res) => {
  try {
    if (!["admin", "superuser"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { username, email, password, firstName, lastName, phone, role } =
      req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email, username, or phone already exists",
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user object
    const userData = {
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role: role || "user",
    };

    // Add profile image if uploaded (store in DB)
    if (req.file && req.file.buffer) {
      userData.profileImage = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      userData.profileImageUrl = undefined;
    }

    const user = new User(userData);
    await user.save();

    // Create activity log
    await createActivity({
      type: "user_created",
      message: `User ${user.username} was created by admin`,
      user: req.user.id,
      targetId: user._id,
      targetModel: "User",
    });

    // Remove password from response
    const userResponse = user.toObject();
    if (userResponse.profileImage) {
      const url = buildDataUrl(userResponse.profileImage);
      if (url) userResponse.profileImageUrl = url;
    }
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};

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
      .select("-password -__v") // Exclude password and version
      .sort(sortObj)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    const usersWithImage = users.map((user) => {
      const userObj = user.toObject();
      if (userObj.profileImage) {
        const url = buildDataUrl(userObj.profileImage);
        if (url && url.length > "data:image/".length)
          userObj.profileImageUrl = url;
      }
      delete userObj.profileImage;
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
    if (userObj.profileImage) {
      const url = buildDataUrl(userObj.profileImage);
      if (url && url.length > "data:image/".length)
        userObj.profileImageUrl = url;
    }
    delete userObj.profileImage;

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
    //console.log("Update user called with ID:", userId);
    //console.log("Request params:", req.params);
    //console.log("Request user:", req.user);

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

    if (req.file && req.file.buffer) {
      updates.profileImage = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      updates.profileImageUrl = undefined;
    } else if (updates.profileImage === null) {
      // If profileImage is explicitly set to null, remove the image
      updates.$unset = { profileImage: 1, profileImageUrl: 1 };
      delete updates.profileImage; // Remove from updates object to avoid conflicts
    }

    delete updates.password;
    delete updates.role;

    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    })
      .select("-password -__v")
      .lean();

    await createActivity({
      type: "user_updated",
      message: `User ${updatedUser.username} updated their profile`,
      user: req.user.id,
      targetId: updatedUser._id,
      targetModel: "User",
    });

    if (updatedUser && updatedUser.profileImage) {
      const url = buildDataUrl(updatedUser.profileImage);
      if (url && url.length > "data:image/".length) {
        updatedUser.profileImageUrl = url;
      } else {
        // Remove empty or invalid profileImageUrl so client uses profileImage fallback
        delete updatedUser.profileImageUrl;
      }
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
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
      type: "user_deactivated",
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

// Delete user permanently (Admin only)
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account",
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
        message: "Cannot delete superuser account",
      });
    }

    // Archive the user before deletion
    const archiveUser = new ArchiveUser({
      originalId: user._id.toString(),
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      profileImage: user.profileImage,
      profileImageUrl: user.profileImageUrl,
      address: user.address,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      preferences: user.preferences,
      accessRequest: user.accessRequest,
      deletedBy: req.user.id,
      deletionReason: "Admin requested permanent deletion",
      originalData: user.toObject(),
    });

    await archiveUser.save();

    // Delete the user from the main table
    await User.findByIdAndDelete(id);

    await createActivity({
      type: "user_deleted",
      message: `User ${user.username} was permanently deleted and archived`,
      user: req.user.id,
      targetId: user._id,
      targetModel: "User",
    });

    res.json({
      success: true,
      message: "User deleted and archived successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user",
      error: error.message,
    });
  }
};

// Reactivate user (Admin only)
exports.reactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.isActive = true;
    await user.save();

    await createActivity({
      type: "user_reactivated",
      message: `User ${user.username} was reactivated`,
      user: req.user.id,
      targetId: user._id,
      targetModel: "User",
    });

    res.json({
      success: true,
      message: "User reactivated successfully",
    });
  } catch (error) {
    console.error("Reactivate user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reactivate user",
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
