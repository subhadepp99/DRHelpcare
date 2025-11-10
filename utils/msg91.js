const axios = require("axios");

// Server-side verification of MSG91 access token
// Docs reference: "This access token needs to be sent to MSG91 through the API provided in the Server-Side Integration section".
// Configure via env:
//   MSG91_AUTHKEY: Your MSG91 account Auth Key (server-side)
//   MSG91_VERIFY_URL: Full URL for verifying access token (provided in MSG91 panel)
// Fallback URL is a placeholder and should be replaced with the correct one from your panel.

const MSG91_AUTHKEY = process.env.MSG91_AUTHKEY || "";
const MSG91_VERIFY_URL =
  process.env.MSG91_VERIFY_URL ||
  "https://control.msg91.com/api/v5/widget/verifyAccessToken";

async function verifyAccessToken(accessToken) {
  if (!MSG91_AUTHKEY) {
    return {
      success: false,
      message: "MSG91_AUTHKEY not configured",
      code: "CONFIG_MISSING",
    };
  }
  if (!accessToken) {
    return {
      success: false,
      message: "accessToken is required",
      code: "BAD_REQUEST",
    };
  }

  try {
    const response = await axios.post(
      MSG91_VERIFY_URL,
      {
        authkey: MSG91_AUTHKEY,
        "access-token": accessToken,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 10000,
      }
    );

    // Expecting a response that includes a verified/valid flag and optionally the identifier
    const data = response.data || {};
    const isVerified = Boolean(
      data.verified ||
        data.isVerified ||
        data.valid ||
        data.success ||
        data.status === "success" ||
        data.type === "success"
    );

    return {
      success: isVerified,
      message: isVerified ? "Access token verified" : "Verification failed",
      data,
    };
  } catch (error) {
    const status = error.response?.status;
    const errData = error.response?.data;
    return {
      success: false,
      message: "MSG91 verification error",
      status,
      error: errData || error.message,
    };
  }
}

module.exports = {
  verifyAccessToken,
};
