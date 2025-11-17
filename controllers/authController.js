const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { createActivity } = require("../utils/activity");
const {
  hashPassword,
  comparePassword,
  validatePassword,
} = require("../utils/passwordUtils");
const { generateOTP, sendOTP, verifyOTP } = require("../utils/sms");
const { verifyAccessToken: verifyMsg91AccessToken } = require("../utils/msg91");

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

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || "healthcare_secret_key_2024",
    { expiresIn: "24h" }
  );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || "healthcare_refresh_secret_2024",
    { expiresIn: "7d" }
  );
};

// Register new user
exports.register = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      firstName,
      lastName,
      phone,
      role = "user",
      otp,
    } = req.body;

    // Validation - email is now optional, phone is mandatory
    if (!username || !password || !firstName || !lastName || !phone) {
      return res.status(400).json({
        success: false,
        message:
          "Username, password, first name, last name, and phone are required",
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.success) {
      return res
        .status(400)
        .json({ success: false, message: passwordValidation.message });
    }

    // If OTP is provided, verify it
    if (otp) {
      console.log(`[Registration] Verifying OTP for phone: ${phone}`);

      // Find the OTP record from database
      const otpRecord = await OTP.findOne({
        identifier: phone,
        type: "verification",
        isUsed: false,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: 3 },
      });

      if (!otpRecord) {
        console.log(
          `[Registration] No valid OTP record found for phone: ${phone}`
        );
        return res.status(400).json({
          success: false,
          message: "Invalid or expired OTP. Please request a new one.",
        });
      }

      console.log(
        `[Registration] OTP Record found. Input OTP: ${otp}, Stored OTP: ${otpRecord.otp}`
      );

      // Verify OTP matches (ensure both are strings)
      const inputOtpStr = String(otp).trim();
      const storedOtpStr = String(otpRecord.otp).trim();

      if (inputOtpStr !== storedOtpStr) {
        // Increment attempts
        await otpRecord.incrementAttempts();
        console.log(
          `[Registration] OTP mismatch. Attempts: ${otpRecord.attempts + 1}`
        );

        return res.status(400).json({
          success: false,
          message: "Invalid OTP. Please check and try again.",
        });
      }

      console.log(
        `[Registration] OTP verified successfully for phone: ${phone}`
      );

      // Mark OTP as used and delete
      otpRecord.isUsed = true;
      await otpRecord.save();
      await OTP.deleteMany({ identifier: phone, type: "verification" });
    }

    // Check if user already exists
    const queryConditions = [{ username: username.toLowerCase() }, { phone }];

    // Only check email if it's provided
    if (email) {
      queryConditions.push({ email: email.toLowerCase() });
    }

    const existingUser = await User.findOne({
      $or: queryConditions,
    });

    if (existingUser) {
      let field = "phone number";
      if (existingUser.username === username.toLowerCase()) field = "username";
      if (email && existingUser.email === email.toLowerCase()) field = "email";

      return res.status(400).json({
        success: false,
        message: `User with this ${field} already exists`,
      });
    }

    // Only allow admin/superuser creation by existing admins
    if (["admin", "superuser"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Cannot create admin users through registration",
      });
    }

    // Create new user - only include email if it has a value
    const userData = {
      username: username.toLowerCase(),
      password: await hashPassword(password),
      firstName,
      lastName,
      phone,
      role: "user", // Force user role for registration
    };
    
    // Only add email if it's provided and not empty
    if (email && email.trim()) {
      userData.email = email.toLowerCase().trim();
    }
    
    const user = new User(userData);

    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Create activity log
    await createActivity({
      type: "user_registered",
      message: `New user registration: ${user.firstName} ${user.lastName}`,
      user: user._id,
      targetId: user._id,
      targetModel: "User",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Remove password from response
    const userResponse = user.toObject();
    if (userResponse.profileImage) {
      const url = buildDataUrl(userResponse.profileImage);
      if (url && url.length > "data:image/".length)
        userResponse.profileImageUrl = url;
      else delete userResponse.profileImageUrl;
    }
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: userResponse,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `User with this ${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    // Ensure body is an object
    const body =
      req && req.body && typeof req.body === "object" ? req.body : {};

    // Support multiple shapes but prefer flat payload
    const identifier =
      body.identifier ??
      body.email ??
      body.username ??
      body.phone ??
      body?.data?.identifier ??
      req.query?.identifier;
    const password =
      body.password ?? body?.data?.password ?? req.query?.password;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Email/username/phone and password are required",
      });
    }

    const ident = String(identifier).trim();

    // Find user by email, username, or phone
    let user = await User.findOne({
      $or: [
        { email: ident.toLowerCase() },
        { username: ident.toLowerCase() },
        { phone: ident },
      ],
      isActive: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "This number is not registered with us. Kindly sign up and try again.",
      });
    }

    // Validate password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Auto-downgrade admin-like login to userDoctor/userClinic if identifier matches doctor/clinic contact
    try {
      const Doctor = require("../models/Doctor");
      const Clinic = require("../models/Clinic");
      const normalizedIdent = ident.toLowerCase();
      const byPhone = { phone: ident };
      const byEmail = { email: normalizedIdent };
      const isDoctorMatch = await Doctor.findOne({
        $or: [byPhone, byEmail],
        isActive: true,
      }).select("_id");
      const isClinicMatch = await Clinic.findOne({
        $or: [byPhone, byEmail],
        isActive: true,
      }).select("_id");
      if (isDoctorMatch && user.role === "user") {
        user.role = "userDoctor";
        await user.save();
      } else if (isClinicMatch && user.role === "user") {
        user.role = "userClinic";
        await user.save();
      }
    } catch (_) {}

    // Update last login
    await user.updateLastLogin();

    // Tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Activity log
    await createActivity({
      type:
        user.role === "admin" || user.role === "superuser"
          ? "admin_login"
          : "user_login",
      message: `User ${user.username} logged in`,
      user: user._id,
      targetId: user._id,
      targetModel: "User",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Prepare response user
    const userResponse = user.toObject();
    if (userResponse.profileImage) {
      const url = buildDataUrl(userResponse.profileImage);
      if (url) userResponse.profileImageUrl = url;
    }
    delete userResponse.password;

    return res.json({
      success: true,
      message: "Login successful",
      data: { user: userResponse, token, refreshToken },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Login failed", error: error.message });
  }
};

// Refresh token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || "healthcare_refresh_secret_2024"
    );

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Find user
    const user = await User.findById(decoded.userId).select("-password");
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Generate new tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        user,
        token: newToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
};

// Get current user
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -__v");

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "This number is not registered with us. Kindly sign up and try again.",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get current user error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user data",
      error: error.message,
    });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token
    // For now, we'll just return a success response

    // Create activity log
    await createActivity({
      type: "user_logout",
      message: `User ${req.user.username} logged out`,
      user: req.user.id,
      targetId: req.user.id,
      targetModel: "User",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed",
      error: error.message,
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, otp } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    const newPasswordValidation = validatePassword(newPassword);
    if (!newPasswordValidation.success) {
      return res
        .status(400)
        .json({ success: false, message: newPasswordValidation.message });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Require OTP for password change
    const otpRecord = await OTP.findOne({
      identifier: user.phone,
      type: "change_password",
      isUsed: false,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 3 },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "OTP required. Please request OTP to change password.",
      });
    }

    if (!otp || !verifyOTP(otp, otpRecord.otp)) {
      await otpRecord.incrementAttempts();
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password
    user.password = await hashPassword(newPassword);
    await user.save();

    await otpRecord.markAsUsed();

    res.json({
      success: true,
      message: "Password changed successfully",
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

// Send OTP to change password
exports.sendChangePasswordOTP = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.phone) {
      return res
        .status(400)
        .json({ success: false, message: "Phone number not set" });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const otp = new OTP({
      identifier: user.phone,
      otp: otpCode,
      type: "change_password",
      expiresAt,
    });
    await otp.save();

    const smsResult = await sendOTP(user.phone, otpCode, "change_password");
    if (smsResult.success) {
      return res.json({ success: true, message: "OTP sent successfully" });
    }
    return res.json({
      success: true,
      message: "OTP sent successfully",
      warning: "SMS delivery may be delayed",
    });
  } catch (error) {
    console.error("Send change password OTP error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to send OTP" });
  }
};

// Send OTP for login
exports.sendLoginOTP = async (req, res) => {
  try {
    const { identifier } = req.body; // Can be email, username, or phone

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Email, username, or phone is required",
      });
    }

    // Find user by identifier
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
        { phone: identifier },
      ],
      isActive: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    const otp = new OTP({
      identifier: identifier,
      otp: otpCode,
      type: "login",
      expiresAt: expiresAt,
    });

    await otp.save();

    // Send OTP via SMS
    const smsResult = await sendOTP(user.phone, otpCode, "login");

    if (smsResult.success) {
      res.json({
        success: true,
        message: "OTP sent successfully to your registered phone number",
        expiresIn: "10 minutes",
      });
    } else {
      // If SMS fails, still return success but log the error
      console.error("SMS sending failed:", smsResult);
      res.json({
        success: true,
        message: "OTP sent successfully to your registered phone number",
        expiresIn: "10 minutes",
        warning: "SMS delivery may be delayed",
      });
    }
  } catch (error) {
    console.error("Send login OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

// Verify OTP and login
exports.verifyOTPAndLogin = async (req, res) => {
  try {
    const { identifier, otp } = req.body;

    if (!identifier || !otp) {
      return res.status(400).json({
        success: false,
        message: "Identifier and OTP are required",
      });
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({
      identifier: identifier,
      type: "login",
      isUsed: false,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 3 },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Verify OTP
    if (!verifyOTP(otp, otpRecord.otp)) {
      // Increment attempts
      await otpRecord.incrementAttempts();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Find user
    let user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
        { phone: identifier },
      ],
      isActive: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Auto-assign userDoctor/userClinic role based on identifier
    try {
      const Doctor = require("../models/Doctor");
      const Clinic = require("../models/Clinic");
      const normalizedIdent = String(identifier).toLowerCase();
      const byPhone = { phone: identifier };
      const byEmail = { email: normalizedIdent };
      const isDoctorMatch = await Doctor.findOne({
        $or: [byPhone, byEmail],
        isActive: true,
      }).select("_id");
      const isClinicMatch = await Clinic.findOne({
        $or: [byPhone, byEmail],
        isActive: true,
      }).select("_id");
      if (isDoctorMatch && user.role === "user") {
        user.role = "userDoctor";
        await user.save();
      } else if (isClinicMatch && user.role === "user") {
        user.role = "userClinic";
        await user.save();
      }
    } catch (_) {}

    // Mark OTP as used
    await otpRecord.markAsUsed();

    // If MSG91 login, also normalize user role based on identifier match
    await user.updateLastLogin();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Create activity log
    await createActivity({
      type: "user_login_otp",
      message: `User ${user.username} logged in via OTP`,
      user: user._id,
      targetId: user._id,
      targetModel: "User",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Prepare response user
    const userResponse = user.toObject();
    if (userResponse.profileImage) {
      const url = buildDataUrl(userResponse.profileImage);
      if (url) userResponse.profileImageUrl = url;
    }
    delete userResponse.password;

    res.json({
      success: true,
      message: "Login successful",
      data: { user: userResponse, token, refreshToken },
    });
  } catch (error) {
    console.error("Verify OTP and login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// Login using MSG91 (frontend verified). No server-side verify.
exports.loginWithMsg91 = async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Identifier is required",
      });
    }

    // Find user
    const ident = String(identifier).trim();
    const user = await User.findOne({
      $or: [
        { email: ident.toLowerCase() },
        { username: ident.toLowerCase() },
        { phone: ident.replace(/\D/g, "") },
      ],
      isActive: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "This number is not registered with us. Kindly sign up and try again.",
      });
    }

    await user.updateLastLogin();
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    await createActivity({
      type: "user_login_otp",
      message: `User ${user.username} logged in via MSG91`,
      user: user._id,
      targetId: user._id,
      targetModel: "User",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    const userResponse = user.toObject();
    if (userResponse.profileImage) {
      const url = buildDataUrl(userResponse.profileImage);
      if (url && url.length > "data:image/".length)
        userResponse.profileImageUrl = url;
      else delete userResponse.profileImageUrl;
    }
    delete userResponse.password;

    return res.json({
      success: true,
      message: "Login successful",
      data: { user: userResponse, token, refreshToken },
    });
  } catch (error) {
    console.error("Login with MSG91 error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
};

// Registration: verify MSG91 access token and create user if not exists
exports.registerWithMsg91 = async (req, res) => {
  try {
    const { accessToken, user: userPayload } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "accessToken is required",
      });
    }

    const verification = await verifyMsg91AccessToken(accessToken);

    const verificationData = verification.data || {};
    const phoneRaw =
      verificationData.mobile ||
      verificationData.phone ||
      userPayload?.phone ||
      "";
    const phone = phoneRaw ? phoneRaw.toString().replace(/\D/g, "") : "";
    
    // Process email - ensure it's either a valid email string or completely omitted
    const emailRaw = verificationData.email || userPayload?.email || "";
    let email = null;
    if (emailRaw && typeof emailRaw === 'string') {
      const trimmed = emailRaw.trim().toLowerCase();
      if (trimmed && trimmed.length > 0 && trimmed.includes('@')) {
        email = trimmed;
      }
    }

    if (!verification.success) {
      console.warn(
        "[MSG91] Access token verification failed:",
        verification.message,
        verification.error || ""
      );

      if (!phone && !email) {
        return res.status(401).json({
          success: false,
          message:
            "Unable to verify your phone or email. Please retry the OTP flow or contact the administrator.",
        });
      }
    }

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        message: "Phone or email required from MSG91 or registration form",
      });
    }

    // Build query to find existing user - only include email if it's valid
    const queryConditions = [];
    if (phone && phone.trim()) {
      queryConditions.push({ phone: phone.trim() });
    }
    if (email && typeof email === 'string' && email.length > 0) {
      queryConditions.push({ email });
    }
    
    let user = null;
    if (queryConditions.length > 0) {
      user = await User.findOne({ $or: queryConditions });
    }

    const firstName =
      (userPayload?.firstName || verificationData.name || "User")
        .toString()
        .split(" ")[0]
        .trim() || "User";
    const lastName =
      (
        userPayload?.lastName ||
        verificationData.lastName ||
        verificationData.name?.split(" ")[1]
      )?.trim() || "Account";

    if (!user) {
      const baseCandidate = (
        userPayload?.username ||
        (email ? email.split("@")[0] : null) ||
        (phone ? phone.slice(-6) : null) ||
        `user${Date.now()}`
      )
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      const usernameBase =
        baseCandidate.length > 0 ? baseCandidate : `user${Date.now()}`;
      let username = usernameBase;
      let suffix = 1;
      // Ensure username uniqueness
      while (await User.findOne({ username })) {
        username = `${usernameBase}${suffix}`;
        suffix += 1;
      }

      const passwordSource =
        userPayload?.password || `${Math.random().toString(36).slice(2)}A1!`;

      // Build user data object - only include email if it has a value
      const userData = {
        username,
        password: await hashPassword(passwordSource),
        firstName,
        lastName,
        role: "user",
      };
      
      // Only add email if it's a valid non-empty string
      if (email && typeof email === 'string' && email.length > 0) {
        userData.email = email;
      }
      // Explicitly do NOT include email field if it's null/undefined/empty
      
      // Only add phone if it's provided
      if (phone && phone.trim()) {
        userData.phone = phone.trim();
      }
      
      user = new User(userData);
      await user.save();
      await createActivity({
        type: "user_registered",
        message: `New user registration via MSG91: ${username}`,
        user: user._id,
        targetId: user._id,
        targetModel: "User",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });
    } else {
      // Update missing fields if provided now
      let shouldSave = false;
      if (!user.email && email) {
        user.email = email;
        shouldSave = true;
      }
      if (!user.phone && phone) {
        user.phone = phone;
        shouldSave = true;
      }
      if (!user.firstName && firstName) {
        user.firstName = firstName;
        shouldSave = true;
      }
      if (!user.lastName && lastName) {
        user.lastName = lastName;
        shouldSave = true;
      }
      if (shouldSave) {
        await user.save();
      }
    }

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: { user: userResponse, token, refreshToken },
    });
  } catch (error) {
    console.error("Register with MSG91 error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
};

// Send OTP for password reset
exports.sendPasswordResetOTP = async (req, res) => {
  try {
    const { identifier } = req.body; // Can be email, username, or phone

    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: "Email, username, or phone is required",
      });
    }

    // Find user by identifier
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
        { phone: identifier },
      ],
      isActive: true,
    });

    if (!user) {
      // Always return success to prevent enumeration
      return res.json({
        success: true,
        message:
          "If the account exists, you will receive an OTP for password reset",
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    const otp = new OTP({
      identifier: identifier,
      otp: otpCode,
      type: "password_reset",
      expiresAt: expiresAt,
    });

    await otp.save();

    // Send OTP via SMS
    const smsResult = await sendOTP(user.phone, otpCode, "password_reset");

    if (smsResult.success) {
      res.json({
        success: true,
        message: "OTP sent successfully to your registered phone number",
        expiresIn: "10 minutes",
      });
    } else {
      console.error("SMS sending failed:", smsResult);
      res.json({
        success: true,
        message: "OTP sent successfully to your registered phone number",
        expiresIn: "10 minutes",
        warning: "SMS delivery may be delayed",
      });
    }
  } catch (error) {
    console.error("Send password reset OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

// Send OTP for registration verification
exports.sendRegistrationOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    console.log(`[SendOTP] Sending registration OTP for phone: ${phone}`);

    // Check if user already exists with this phone
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      console.log(`[SendOTP] User already exists with phone: ${phone}`);
      return res.status(400).json({
        success: false,
        message: "User with this phone number already exists",
      });
    }

    // Delete any existing OTPs for this phone number to avoid confusion
    await OTP.deleteMany({ identifier: phone, type: "verification" });

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    console.log(`[SendOTP] Generated OTP: ${otpCode} for phone: ${phone}`);

    // Save OTP to database
    const otp = new OTP({
      identifier: phone,
      otp: otpCode,
      type: "verification",
      expiresAt: expiresAt,
    });

    await otp.save();
    console.log(`[SendOTP] OTP saved to database for phone: ${phone}`);

    // Send OTP via SMS
    const smsResult = await sendOTP(phone, otpCode, "verification");

    if (smsResult.success) {
      res.json({
        success: true,
        message: "Verification OTP sent successfully to your phone number",
        expiresIn: "10 minutes",
      });
    } else {
      console.error("SMS sending failed:", smsResult);
      res.json({
        success: true,
        message: "Verification OTP sent successfully to your phone number",
        expiresIn: "10 minutes",
        warning: "SMS delivery may be delayed",
      });
    }
  } catch (error) {
    console.error("Send registration OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

// Reset password with OTP
exports.resetPasswordWithOTP = async (req, res) => {
  try {
    const { identifier, otp, newPassword } = req.body;

    if (!identifier || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Identifier, OTP, and new password are required",
      });
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.success) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message,
      });
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({
      identifier: identifier,
      type: "password_reset",
      isUsed: false,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 3 },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Verify OTP
    if (!verifyOTP(otp, otpRecord.otp)) {
      // Increment attempts
      await otpRecord.incrementAttempts();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() },
        { phone: identifier },
      ],
      isActive: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update password
    user.password = await hashPassword(newPassword);
    await user.save();

    // Mark OTP as used
    await otpRecord.markAsUsed();

    // Create activity log
    await createActivity({
      type: "password_reset",
      message: `User ${user.username} reset their password`,
      user: user._id,
      targetId: user._id,
      targetModel: "User",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password with OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Password reset failed",
      error: error.message,
    });
  }
};

// Forgot password (basic implementation)
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    });

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message:
        "If the email exists, you will receive password reset instructions",
    });

    // In production, implement actual email sending here
    if (user) {
      console.log(`Password reset requested for user: ${user.email}`);
      // Generate reset token and send email
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process password reset request",
      error: error.message,
    });
  }
};
