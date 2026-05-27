const fs = require("fs");
const path = require("path");
const axios = require("axios");

const LOCAL_SOURCE_ROUTE = "/sources";
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

const extensionToContentType = (ext = "") => {
  const normalized = ext.replace(".", "").toLowerCase();
  const contentTypeMap = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };

  return contentTypeMap[normalized] || "image/jpeg";
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

const safeFeatureName = (featureName = "") =>
  String(featureName)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const isDefaultImageUrl = (imageUrl, defaultImageUrl) =>
  !imageUrl ||
  String(imageUrl).trim() === "" ||
  (defaultImageUrl && imageUrl === defaultImageUrl);

const isLocalSourceUrl = (imageUrl = "", featureName) => {
  if (!imageUrl) return false;

  try {
    const parsedUrl = new URL(imageUrl, "http://local");
    return parsedUrl.pathname.startsWith(
      `${LOCAL_SOURCE_ROUTE}/${featureName}/`
    );
  } catch {
    return String(imageUrl).startsWith(`${LOCAL_SOURCE_ROUTE}/${featureName}/`);
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

const getDocumentValue = (doc, fieldName) => {
  if (!fieldName) return undefined;
  return fieldName.split(".").reduce((value, key) => value?.[key], doc);
};

const dataUrlToPayload = (dataUrl) => {
  const matches = String(dataUrl).match(
    /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/
  );
  if (!matches) return null;

  return {
    buffer: Buffer.from(matches[2], "base64"),
    contentType: matches[1],
    source: "data-url",
  };
};

const bufferFromStoredData = (data, contentType) => {
  if (!data) return null;

  if (Buffer.isBuffer(data)) {
    return { buffer: data, contentType, source: "database" };
  }

  if (typeof data === "string") {
    if (data.startsWith("data:image/")) {
      return dataUrlToPayload(data);
    }

    return {
      buffer: Buffer.from(data, "base64"),
      contentType,
      source: "database",
    };
  }

  if (typeof data === "object") {
    return {
      buffer: Buffer.from(data.data || data),
      contentType,
      source: "database",
    };
  }

  return null;
};

const getImagePayloadFromValue = async (imageValue, defaultImageUrl) => {
  if (!imageValue) return null;

  if (typeof imageValue === "object" && imageValue.data) {
    return bufferFromStoredData(
      imageValue.data,
      imageValue.contentType || "image/jpeg"
    );
  }

  if (typeof imageValue !== "string") return null;

  if (isDefaultImageUrl(imageValue, defaultImageUrl)) {
    return null;
  }

  if (imageValue.startsWith("data:image/")) {
    return dataUrlToPayload(imageValue);
  }

  if (/^https?:\/\//i.test(imageValue)) {
    const response = await axios.get(imageValue, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: MAX_BACKFILL_IMAGE_SIZE,
      headers: {
        Accept:
          "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8",
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
  }

  if (imageValue.startsWith("/uploads/") || imageValue.startsWith("uploads/")) {
    const relativePath = imageValue.replace(/^\/+/, "");
    const filePath = path.resolve(__dirname, "..", relativePath);
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);

    return {
      buffer,
      contentType: extensionToContentType(ext),
      source: "uploads-file",
    };
  }

  return null;
};

const createBackfillQuery = ({
  imageField = "image",
  imageUrlField = "imageUrl",
  defaultImageUrl,
}) => ({
  $or: [
    { [`${imageField}.data`]: { $exists: true, $ne: null } },
    { [imageField]: { $exists: true, $nin: [null, ""] } },
    {
      [imageUrlField]: {
        $exists: true,
        $nin: [null, "", defaultImageUrl].filter(Boolean),
      },
    },
  ],
});

const getBackfillFileName = ({ doc, label, contentType, imageUrl }) => {
  const baseName = slugify(label || doc.slug || doc.title || doc.name || doc.username) || String(doc._id);
  const ext = contentTypeToExtension(contentType) || extensionFromUrl(imageUrl) || "jpg";

  return `${baseName}-${doc._id}.${ext}`;
};

const backfillLocalImages = async ({
  req,
  Model,
  featureName,
  labelField = "name",
  imageField = "image",
  imageUrlField = "imageUrl",
  defaultImageUrl = "",
  query,
}) => {
  const safeFeature = safeFeatureName(featureName);
  const sourceDir = path.resolve(
    __dirname,
    "..",
    "..",
    "client",
    "src",
    "sources",
    safeFeature
  );
  const results = {
    inspected: 0,
    converted: 0,
    skipped: 0,
    failed: 0,
    folder: sourceDir,
    feature: safeFeature,
    items: [],
  };

  await fs.promises.mkdir(sourceDir, { recursive: true });

  const documents = await Model.find(
    query || createBackfillQuery({ imageField, imageUrlField, defaultImageUrl })
  );
  const publicBaseUrl = getPublicServerBaseUrl(req);

  for (const doc of documents) {
    results.inspected += 1;

    try {
      const imageValue = getDocumentValue(doc, imageField);
      const imageUrlValue = getDocumentValue(doc, imageUrlField);
      const label = getDocumentValue(doc, labelField);

      if (!imageValue && isLocalSourceUrl(imageUrlValue, safeFeature)) {
        results.skipped += 1;
        results.items.push({
          id: doc._id,
          title: label,
          status: "skipped",
          reason: "Already using local source image",
        });
        continue;
      }

      const imagePayload =
        (await getImagePayloadFromValue(imageValue, defaultImageUrl)) ||
        (await getImagePayloadFromValue(imageUrlValue, defaultImageUrl));

      if (!imagePayload?.buffer?.length) {
        results.skipped += 1;
        results.items.push({
          id: doc._id,
          title: label,
          status: "skipped",
          reason: "No downloadable image found",
        });
        continue;
      }

      if (imagePayload.buffer.length > MAX_BACKFILL_IMAGE_SIZE) {
        throw new Error("Image is larger than 10MB");
      }

      const fileName = getBackfillFileName({
        doc,
        label,
        contentType: imagePayload.contentType,
        imageUrl: imageUrlValue || imageValue,
      });
      const filePath = path.join(sourceDir, fileName);
      const publicPath = `${LOCAL_SOURCE_ROUTE}/${safeFeature}/${encodeURIComponent(
        fileName
      )}`;
      const publicUrl = `${publicBaseUrl}${publicPath}`;

      await fs.promises.writeFile(filePath, imagePayload.buffer);
      await Model.updateOne(
        { _id: doc._id },
        {
          $set: { [imageUrlField]: publicUrl },
          $unset: { [imageField]: "" },
        }
      );

      results.converted += 1;
      results.items.push({
        id: doc._id,
        title: label,
        status: "converted",
        source: imagePayload.source,
        imageUrl: publicUrl,
      });
    } catch (error) {
      results.failed += 1;
      results.items.push({
        id: doc._id,
        title: getDocumentValue(doc, labelField),
        status: "failed",
        reason: error.message,
      });
    }
  }

  return results;
};

const sendBackfillResponse = async (req, res, options) => {
  let results;

  try {
    results = await backfillLocalImages({ req, ...options });

    res.json({
      success: true,
      message: `Backfill complete: ${results.converted} converted, ${results.skipped} skipped, ${results.failed} failed`,
      ...results,
    });
  } catch (error) {
    console.error(`${options.featureName} image backfill error:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to backfill ${options.featureName} images`,
      error: error.message,
      ...(results || {}),
    });
  }
};

module.exports = {
  backfillLocalImages,
  sendBackfillResponse,
};
