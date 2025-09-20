const axios = require("axios");

// Fast2SMS API configuration
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const FAST2SMS_SENDER_ID = process.env.FAST2SMS_SENDER_ID || "DRHELP";

// Generate a random 4-digit OTP (legacy fallback when MSG91 Widget is unavailable)
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Send OTP via SMS using Fast2SMS
const sendOTP = async (phoneNumber, otp, messageType = "login") => {
  try {
    if (!FAST2SMS_API_KEY) {
      return { success: false, message: "SMS service not configured" };
    }

    // Remove any non-digit characters from phone number
    const cleanPhone = phoneNumber.replace(/\D/g, "");

    // Ensure phone number starts with country code (91 for India)
    const formattedPhone = cleanPhone.startsWith("91")
      ? cleanPhone
      : `91${cleanPhone}`;

    // Prepare message based on type
    let message;
    let variablesValues;

    switch (messageType) {
      case "login":
        message =
          "Your OTP for DrHelp login is {#var#}. Valid for 10 minutes. Do not share this OTP with anyone.";
        variablesValues = otp;
        break;
      case "password_reset":
        message =
          "Your OTP for DrHelp password reset is {#var#}. Valid for 10 minutes. Do not share this OTP with anyone.";
        variablesValues = otp;
        break;
      case "verification":
        message =
          "Your OTP for DrHelp account verification is {#var#}. Valid for 10 minutes. Do not share this OTP with anyone.";
        variablesValues = otp;
        break;
      default:
        message =
          "Your OTP for DrHelp is {#var#}. Valid for 10 minutes. Do not share this OTP with anyone.";
        variablesValues = otp;
    }

    // Fast2SMS API request using POST method with form data
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        authorization: FAST2SMS_API_KEY,
        variables_values: variablesValues,
        route: "otp", // Using otp route as specified
        numbers: formattedPhone,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    if (response.data && response.data.return === true) {
      //console.log(
      // `SMS sent successfully to ${phoneNumber}. Request ID: ${response.data.request_id}`
      // );
      return {
        success: true,
        message: "SMS sent successfully",
        requestId: response.data.request_id,
      };
    } else {
      console.error("Fast2SMS API error:", response.data);
      return {
        success: false,
        message: response.data?.message?.[0] || "Failed to send SMS",
        error: response.data,
      };
    }
  } catch (error) {
    console.error("SMS sending error:", error.message);

    if (error.response) {
      // Fast2SMS API error response
      console.error("Fast2SMS API error:", error.response.data);
      return {
        success: false,
        message: "SMS service error",
        error: error.response.data,
      };
    } else if (error.request) {
      // Network error
      return {
        success: false,
        message: "Network error while sending SMS",
        error: "Network error",
      };
    } else {
      // Other error
      return {
        success: false,
        message: "Failed to send SMS",
        error: error.message,
      };
    }
  }
};

// Verify OTP (basic validation)
const verifyOTP = (inputOTP, storedOTP) => {
  return inputOTP === storedOTP;
};

// Get SMS balance (optional utility)
const getSMSBalance = async () => {
  try {
    if (!FAST2SMS_API_KEY) {
      return { success: false, message: "API key not configured" };
    }

    const response = await axios.get("https://www.fast2sms.com/dev/wallet", {
      params: {
        authorization: FAST2SMS_API_KEY,
      },
      timeout: 10000,
    });

    if (response.data && response.data.return === true) {
      return {
        success: true,
        balance: response.data.balance,
        currency: response.data.currency || "INR",
      };
    } else {
      return {
        success: false,
        message: "Failed to get balance",
        error: response.data,
      };
    }
  } catch (error) {
    console.error("Error getting SMS balance:", error.message);
    return {
      success: false,
      message: "Failed to get SMS balance",
      error: error.message,
    };
  }
};

module.exports = {
  generateOTP,
  sendOTP,
  verifyOTP,
  getSMSBalance,
};
