const Activity = require("../models/Activity");

const createActivity = async ({
  type,
  message,
  user,
  targetId = null,
  targetModel = null,
  metadata = {},
  ipAddress = null,
  userAgent = null,
}) => {
  try {
    const activity = new Activity({
      type,
      message,
      user,
      targetId,
      targetModel,
      metadata,
      ipAddress,
      userAgent,
    });

    await activity.save();
    return activity;
  } catch (error) {
    console.error("Failed to create activity log:", error);
    // Don't throw error to prevent breaking main functionality
    return null;
  }
};

const getRecentActivity = async (limit = 10, type = null) => {
  try {
    const query = type ? { type } : {};

    const activities = await Activity.find(query)
      .populate("user", "firstName lastName username")
      .sort({ createdAt: -1 })
      .limit(limit);

    return activities;
  } catch (error) {
    console.error("Failed to fetch recent activity:", error);
    return [];
  }
};

const getUserActivity = async (userId, limit = 20) => {
  try {
    const activities = await Activity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    return activities;
  } catch (error) {
    console.error("Failed to fetch user activity:", error);
    return [];
  }
};

module.exports = {
  createActivity,
  getRecentActivity,
  getUserActivity,
};
