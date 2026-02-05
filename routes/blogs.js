const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const { auth, adminAuth, optionalAuth } = require("../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

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

    // Convert database image to base64 data URL if it exists
    if (blog.image && blog.image.data && !blog.imageUrl) {
      blog.imageUrl = `data:${
        blog.image.contentType
      };base64,${blog.image.data.toString("base64")}`;
    }
    // Remove image.data from response to reduce payload size
    if (blog.image && blog.image.data) {
      delete blog.image.data;
    }

    // Increment views (need to fetch again as lean() returns plain object)
    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

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
