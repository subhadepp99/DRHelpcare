const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const { auth, adminAuth, optionalAuth } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

const DEFAULT_BLOG_IMAGE = "/images/blog-default.jpg";
const LOCAL_SOURCE_ROUTE = "/sources";
const BLOG_SOURCE_FEATURE = "blog";
const BLOG_SOURCE_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "client",
  "src",
  "sources",
  BLOG_SOURCE_FEATURE
);
const MAX_BACKFILL_IMAGE_SIZE = 10 * 1024 * 1024;

const contentTypeToExtension = (contentType = "") => {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };

  return extensionMap[normalized] || "";
};

const extensionFromUrl = (imageUrl = "") => {
  try {
    const parsedUrl = new URL(imageUrl, "http://local");
    const ext = path
      .extname(parsedUrl.pathname)
      .replace(".", "")
      .toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
      ? ext.replace("jpeg", "jpg")
      : "";
  } catch {
    return "";
  }
};

const isDefaultImageUrl = (imageUrl) =>
  !imageUrl || imageUrl.trim() === "" || imageUrl === DEFAULT_BLOG_IMAGE;

const isLocalSourceUrl = (imageUrl = "") => {
  if (!imageUrl) return false;

  try {
    const parsedUrl = new URL(imageUrl, "http://local");
    return parsedUrl.pathname.startsWith(
      `${LOCAL_SOURCE_ROUTE}/${BLOG_SOURCE_FEATURE}/`
    );
  } catch {
    return imageUrl.startsWith(`${LOCAL_SOURCE_ROUTE}/${BLOG_SOURCE_FEATURE}/`);
  }
};

const getPublicServerBaseUrl = (req) => {
  if (process.env.PUBLIC_API_ORIGIN) {
    return process.env.PUBLIC_API_ORIGIN.replace(/\/$/, "");
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0] || req.protocol;
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.get("host");

  return `${protocol}://${host}`;
};

const getImageBufferFromBlog = async (blog) => {
  if (blog.image?.data) {
    const buffer = Buffer.isBuffer(blog.image.data)
      ? blog.image.data
      : Buffer.from(blog.image.data.data || blog.image.data);

    return {
      buffer,
      contentType: blog.image.contentType || "image/jpeg",
      source: "database",
    };
  }

  const imageUrl = blog.imageUrl;
  if (isDefaultImageUrl(imageUrl) || isLocalSourceUrl(imageUrl)) {
    return null;
  }

  if (imageUrl.startsWith("data:image/")) {
    const matches = imageUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!matches) return null;

    return {
      buffer: Buffer.from(matches[2], "base64"),
      contentType: matches[1],
      source: "data-url",
    };
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    return null;
  }

  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: MAX_BACKFILL_IMAGE_SIZE,
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8",
    },
  });
  const contentType = response.headers["content-type"]?.split(";")[0] || "";

  if (!contentType.startsWith("image/")) {
    throw new Error(`Remote URL did not return an image (${contentType})`);
  }

  return {
    buffer: Buffer.from(response.data),
    contentType,
    source: "remote-url",
  };
};

const getBlogImageFileName = (blog, contentType) => {
  const baseName =
    Blog.generateSlug(blog.slug || blog.title || String(blog._id)) ||
    String(blog._id);
  const ext =
    contentTypeToExtension(contentType) ||
    extensionFromUrl(blog.imageUrl) ||
    "jpg";

  return `${baseName}-${blog._id}.${ext}`;
};

// Multer configuration for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  },
});

// Backfill blog images from MongoDB/remote URLs into client/src/sources/blog
router.post("/backfill-local-images", auth, adminAuth, async (req, res) => {
  const results = {
    inspected: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
    folder: BLOG_SOURCE_DIR,
    feature: BLOG_SOURCE_FEATURE,
    items: [],
  };

  try {
    await fs.promises.mkdir(BLOG_SOURCE_DIR, { recursive: true });

    const blogs = await Blog.find({
      $or: [
        { "image.data": { $exists: true, $ne: null } },
        { imageUrl: { $exists: true, $nin: [null, "", DEFAULT_BLOG_IMAGE] } },
      ],
    });
    const publicBaseUrl = getPublicServerBaseUrl(req);

    for (const blog of blogs) {
      results.inspected += 1;

      try {
        if (!blog.image?.data && isLocalSourceUrl(blog.imageUrl)) {
          results.skipped += 1;
          results.items.push({
            id: blog._id,
            title: blog.title,
            status: "skipped",
            reason: "Already using local source image",
          });
          continue;
        }

        const imagePayload = await getImageBufferFromBlog(blog);
        if (!imagePayload?.buffer?.length) {
          results.skipped += 1;
          results.items.push({
            id: blog._id,
            title: blog.title,
            status: "skipped",
            reason: "No downloadable image found",
          });
          continue;
        }

        if (imagePayload.buffer.length > MAX_BACKFILL_IMAGE_SIZE) {
          throw new Error("Image is larger than 10MB");
        }

        const fileName = getBlogImageFileName(blog, imagePayload.contentType);
        const filePath = path.join(BLOG_SOURCE_DIR, fileName);
        const publicPath = `${LOCAL_SOURCE_ROUTE}/${BLOG_SOURCE_FEATURE}/${encodeURIComponent(
          fileName
        )}`;
        const publicUrl = `${publicBaseUrl}${publicPath}`;

        await fs.promises.writeFile(filePath, imagePayload.buffer);
        await Blog.updateOne(
          { _id: blog._id },
          {
            $set: { imageUrl: publicUrl },
            $unset: { image: "" },
          }
        );

        results.converted += 1;
        results.items.push({
          id: blog._id,
          title: blog.title,
          status: "converted",
          source: imagePayload.source,
          imageUrl: publicUrl,
        });
      } catch (error) {
        results.failed += 1;
        results.items.push({
          id: blog._id,
          title: blog.title,
          status: "failed",
          reason: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Backfill complete: ${results.converted} converted, ${results.skipped} skipped, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error("Blog image backfill error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to backfill blog images",
      error: error.message,
      ...results,
    });
  }
});

// Get all blogs (with pagination and filters)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, isPublished, search } = req.query;

    const query = {};

    // Filter by category
    if (category && category !== "All") {
      query.category = category;
    }

    // Filter by published status
    if (isPublished !== undefined) {
      query.isPublished = isPublished === "true";
    } else if (
      !req.user ||
      (req.user.role !== "admin" && req.user.role !== "superuser")
    ) {
      // By default, only show published blogs to non-admins
      query.isPublished = true;
    }
    // If user is admin/superuser and isPublished is not specified, show all blogs

    // Search functionality
    if (search) {
      query.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const blogs = await Blog.find(query)
      .populate("createdBy", "firstName lastName email")
      .sort({ publishedDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Blog.countDocuments(query);

    // Convert database images to base64 data URLs for frontend
    const blogsWithImages = blogs.map((blog) => {
      const blogObj = { ...blog };
      // If image data exists in database, prioritize it over imageUrl
      if (blogObj.image && blogObj.image.data) {
        blogObj.imageUrl = `data:${
          blogObj.image.contentType
        };base64,${blogObj.image.data.toString("base64")}`;
        // Remove image.data from response to reduce payload size
        delete blogObj.image.data;
      }
      return blogObj;
    });

    res.json({
      success: true,
      blogs: blogsWithImages,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blogs",
      error: error.message,
    });
  }
});

// Get single blog by slug
router.get("/slug/:slug", async (req, res) => {
  try {
    const blog = await Blog.findOne({ slug: req.params.slug })
      .populate("createdBy", "firstName lastName email")
      .lean();

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Convert database image to base64 data URL if it exists (prioritize over imageUrl)
    // Use same approach as list endpoint for consistency
    const blogObj = { ...blog };
    if (blogObj.image && blogObj.image.data) {
      try {
        let base64String;
        // Handle different Buffer formats from Mongoose lean()
        if (Buffer.isBuffer(blogObj.image.data)) {
          base64String = blogObj.image.data.toString("base64");
        } else if (typeof blogObj.image.data === "object" && blogObj.image.data.type === "Buffer" && Array.isArray(blogObj.image.data.data)) {
          // Handle Mongoose lean() serialized Buffer: { type: 'Buffer', data: [1,2,3...] }
          base64String = Buffer.from(blogObj.image.data.data).toString("base64");
        } else {
          // Try direct toString as fallback (works in list endpoint when Buffer is still a Buffer)
          base64String = blogObj.image.data.toString("base64");
        }
        
        if (base64String && blogObj.image.contentType) {
          blogObj.imageUrl = `data:${blogObj.image.contentType};base64,${base64String}`;
        }
        // Remove image.data from response to reduce payload size
        delete blogObj.image.data;
      } catch (error) {
        console.error("Error converting blog image to base64:", error, "Image data type:", typeof blogObj.image.data, "Is Buffer:", Buffer.isBuffer(blogObj.image.data));
        // If conversion fails, keep existing imageUrl or use default
        if (!blogObj.imageUrl || blogObj.imageUrl === "/images/blog-default.jpg") {
          blogObj.imageUrl = "/images/blog-default.jpg";
        }
      }
    }
    
    // Use blogObj instead of blog for response
    const responseBlog = blogObj;

    // Increment views (need to fetch again as lean() returns plain object)
    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

    res.json({
      success: true,
      blog: responseBlog,
    });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
});

// Get single blog by ID
router.get("/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate("createdBy", "firstName lastName email")
      .lean();

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Convert database image to base64 data URL if it exists (prioritize over imageUrl)
    if (blog.image && blog.image.data) {
      blog.imageUrl = `data:${
        blog.image.contentType
      };base64,${blog.image.data.toString("base64")}`;
      // Remove image.data from response to reduce payload size
      delete blog.image.data;
    }

    res.json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error("Error fetching blog:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blog",
      error: error.message,
    });
  }
});

// Create new blog (admin only)
router.post("/", auth, adminAuth, upload.single("image"), async (req, res) => {
  try {
    const {
      title,
      excerpt,
      content,
      author,
      category,
      tags,
      readTime,
      isPublished,
      imageUrl,
    } = req.body;

    // Generate slug from title
    const slug = Blog.generateSlug(title);

    // Check if slug already exists
    const existingBlog = await Blog.findOne({ slug });
    if (existingBlog) {
      return res.status(400).json({
        success: false,
        message: "A blog with this title already exists",
      });
    }

    const blogData = {
      title,
      slug,
      excerpt,
      content,
      author,
      category,
      tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
      readTime: readTime || "5 min read",
      isPublished: isPublished === "true" || isPublished === true,
      publishedDate:
        isPublished === "true" || isPublished === true ? new Date() : null,
      createdBy: req.user?.id || req.body.createdBy,
    };

    // Handle image upload - prioritize file upload over imageUrl
    if (req.file) {
      blogData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
      // Clear imageUrl when uploading a file
      blogData.imageUrl = "/images/blog-default.jpg";
    } else if (imageUrl) {
      // Only use imageUrl if no file is uploaded
      blogData.imageUrl = imageUrl;
    } else {
      blogData.imageUrl = "/images/blog-default.jpg";
    }

    const blog = new Blog(blogData);
    await blog.save();

    res.status(201).json({
      success: true,
      message: "Blog created successfully",
      blog: await Blog.findById(blog._id).select("-image.data"),
    });
  } catch (error) {
    console.error("Error creating blog:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create blog",
      error: error.message,
    });
  }
});

// Update blog (admin only)
router.put(
  "/:id",
  auth,
  adminAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      const {
        title,
        excerpt,
        content,
        author,
        category,
        tags,
        readTime,
        isPublished,
        imageUrl,
      } = req.body;

      const blog = await Blog.findById(req.params.id);

      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found",
        });
      }

      // Update fields
      if (title && title !== blog.title) {
        blog.title = title;
        blog.slug = Blog.generateSlug(title);
      }
      if (excerpt) blog.excerpt = excerpt;
      if (content) blog.content = content;
      if (author) blog.author = author;
      if (category) blog.category = category;
      if (tags) blog.tags = Array.isArray(tags) ? tags : JSON.parse(tags);
      if (readTime) blog.readTime = readTime;

      // Handle published status
      if (isPublished !== undefined) {
        const newIsPublished = isPublished === "true" || isPublished === true;
        if (newIsPublished && !blog.isPublished) {
          blog.publishedDate = new Date();
        }
        blog.isPublished = newIsPublished;
      }

      // Handle image upload - prioritize file upload over imageUrl
      if (req.file) {
        blog.image = {
          data: req.file.buffer,
          contentType: req.file.mimetype,
        };
        // Clear imageUrl when uploading a new file
        blog.imageUrl = "/images/blog-default.jpg";
      } else if (imageUrl) {
        // Only update imageUrl if no file is uploaded
        blog.imageUrl = imageUrl;
      }

      await blog.save();

      res.json({
        success: true,
        message: "Blog updated successfully",
        blog: await Blog.findById(blog._id).select("-image.data"),
      });
    } catch (error) {
      console.error("Error updating blog:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update blog",
        error: error.message,
      });
    }
  }
);

// Delete blog (admin only)
router.delete("/:id", auth, adminAuth, async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    res.json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting blog:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete blog",
      error: error.message,
    });
  }
});

// Get blog image from database
router.get("/:id/image", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog || !blog.image || !blog.image.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", blog.image.contentType);
    res.send(blog.image.data);
  } catch (error) {
    console.error("Get blog image error:", error);
    res.status(500).json({ message: "Error fetching image" });
  }
});

// Get blog categories
router.get("/meta/categories", async (req, res) => {
  try {
    const categories = [
      "Healthcare",
      "Digital Health",
      "Health Tips",
      "Medical News",
      "Wellness",
      "Disease Prevention",
      "Nutrition",
      "Mental Health",
      "Other",
    ];

    res.json({
      success: true,
      categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
      error: error.message,
    });
  }
});

module.exports = router;
