const multer = require("multer");
const path = require("path");

/**
 * Image upload utility functions for handling doctor profile images
 * Images are stored directly in MongoDB as Buffer data
 */

/**
 * Validate image file type
 * @param {Object} file - Multer file object
 * @returns {boolean} - True if valid image type
 */
const isValidImageType = (file) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
  ];
  return allowedTypes.includes(file.mimetype);
};

/**
 * Validate image file size (max 5MB)
 * @param {Object} file - Multer file object
 * @returns {boolean} - True if valid size
 */
const isValidImageSize = (file) => {
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  return file.size <= maxSize;
};

/**
 * Process and validate uploaded image
 * @param {Object} file - Multer file object
 * @returns {Object} - Processed image data or error
 */
const processImage = (file) => {
  try {
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    if (!isValidImageType(file)) {
      return {
        success: false,
        error:
          "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.",
      };
    }

    if (!isValidImageSize(file)) {
      return {
        success: false,
        error: "File size too large. Maximum size allowed is 5MB.",
      };
    }

    return {
      success: true,
      data: {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: "Error processing image: " + error.message,
    };
  }
};

/**
 * Convert image buffer to base64 string for frontend display
 * @param {Buffer} buffer - Image buffer data
 * @param {string} mimetype - Image MIME type
 * @returns {string} - Base64 data URL
 */
const bufferToBase64 = (buffer, mimetype) => {
  if (!buffer || !mimetype) {
    return null;
  }

  const base64 = buffer.toString("base64");
  return `data:${mimetype};base64,${base64}`;
};

/**
 * Generate unique filename for image
 * @param {string} originalname - Original filename
 * @returns {string} - Unique filename
 */
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = path.extname(originalname);
  return `doctor_${timestamp}_${randomString}${extension}`;
};

/**
 * Create image metadata object for database storage
 * @param {Object} file - Multer file object
 * @param {string} doctorId - Doctor's ID
 * @returns {Object} - Image metadata
 */
const createImageMetadata = (file, doctorId) => {
  return {
    doctorId,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    uploadedAt: new Date(),
    filename: generateUniqueFilename(file.originalname),
  };
};

/**
 * Resize image buffer (requires sharp package - optional enhancement)
 * Uncomment and install sharp if you want image resizing functionality
 */
/*
const sharp = require('sharp');

const resizeImage = async (buffer, width = 400, height = 400) => {
  try {
    const resizedBuffer = await sharp(buffer)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return { success: true, buffer: resizedBuffer };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
*/

/**
 * Delete image data (for cleanup operations)
 * @param {string} doctorId - Doctor's ID
 * @returns {Object} - Success/error response
 */
const deleteImage = async (doctorId) => {
  try {
    const Doctor = require("../models/Doctor");

    await Doctor.findByIdAndUpdate(
      doctorId,
      { $unset: { image: 1 } },
      { new: true }
    );

    return { success: true, message: "Image deleted successfully" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Get image statistics
 * @param {Array} doctors - Array of doctor documents
 * @returns {Object} - Image statistics
 */
const getImageStats = (doctors) => {
  const totalDoctors = doctors.length;
  const doctorsWithImages = doctors.filter(
    (doctor) => doctor.image && doctor.image.data
  ).length;
  const doctorsWithoutImages = totalDoctors - doctorsWithImages;

  return {
    totalDoctors,
    doctorsWithImages,
    doctorsWithoutImages,
    imagePercentage:
      totalDoctors > 0
        ? ((doctorsWithImages / totalDoctors) * 100).toFixed(2)
        : 0,
  };
};

/**
 * Validate and prepare image for database storage
 * @param {Object} file - Multer file object
 * @returns {Object} - Database-ready image object or error
 */
const prepareImageForDB = (file) => {
  const processResult = processImage(file);

  if (!processResult.success) {
    return processResult;
  }

  return {
    success: true,
    imageData: {
      data: processResult.data.buffer,
      contentType: processResult.data.mimetype,
      originalName: processResult.data.originalname,
      size: processResult.data.size,
      uploadedAt: new Date(),
    },
  };
};

/**
 * Extract image info from database document
 * @param {Object} doctor - Doctor document from database
 * @returns {Object} - Image information
 */
const getImageInfo = (doctor) => {
  if (!doctor.image || !doctor.image.data) {
    return {
      hasImage: false,
      message: "No image available",
    };
  }

  return {
    hasImage: true,
    contentType: doctor.image.contentType,
    size: doctor.image.size || doctor.image.data.length,
    originalName: doctor.image.originalName || "doctor-image",
    uploadedAt: doctor.image.uploadedAt || doctor.createdAt,
  };
};

module.exports = {
  processImage,
  bufferToBase64,
  generateUniqueFilename,
  createImageMetadata,
  deleteImage,
  getImageStats,
  prepareImageForDB,
  getImageInfo,
  isValidImageType,
  isValidImageSize,
  // resizeImage // Uncomment if using sharp for image resizing
};
