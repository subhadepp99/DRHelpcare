const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// Create upload directory if it doesn't exist
const ensureUploadDir = async (uploadPath) => {
  try {
    await fs.mkdir(uploadPath, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directory:", error);
    throw error;
  }
};

// Configure multer storage
const createStorage = (folder) => {
  return multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadPath = path.join(__dirname, "..", "uploads", folder);
      try {
        await ensureUploadDir(uploadPath);
        cb(null, uploadPath);
      } catch (error) {
        cb(error, null);
      }
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const filename =
        file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname);
      cb(null, filename);
    },
  });
};

// File filter for images
const imageFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, JPG, PNG, GIF) are allowed!"), false);
  }
};

// File filter for documents
const documentFileFilter = (req, file, cb) => {
  const allowedTypes = /pdf|doc|docx|txt/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype =
    /application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)|text\/plain/.test(
      file.mimetype
    );

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(
      new Error("Only document files (PDF, DOC, DOCX, TXT) are allowed!"),
      false
    );
  }
};

// Create upload middleware
const createUploadMiddleware = (
  folder,
  fileFilter = imageFileFilter,
  limits = {}
) => {
  const defaultLimits = {
    fileSize: 5 * 1024 * 1024, // 5MB default
    files: 1,
  };

  return multer({
    storage: createStorage(folder),
    limits: { ...defaultLimits, ...limits },
    fileFilter,
  });
};

// Delete file utility
const deleteFile = async (filePath) => {
  try {
    const fullPath = path.join(
      __dirname,
      "..",
      filePath.replace("/uploads/", "uploads/")
    );
    await fs.unlink(fullPath);
    console.log("File deleted successfully:", filePath);
  } catch (error) {
    console.error("Failed to delete file:", filePath, error.message);
  }
};

module.exports = {
  createStorage,
  imageFileFilter,
  documentFileFilter,
  createUploadMiddleware,
  deleteFile,
  ensureUploadDir,
};
