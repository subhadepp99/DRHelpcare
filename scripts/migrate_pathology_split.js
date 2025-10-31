// Migration: classify Pathology documents into packages vs single tests
// Heuristics:
// - isPackage stays if already true
// - name/category/description contains package-like terms → isPackage=true
// - components length >= 3 → isPackage=true
// Otherwise → isPackage=false

require("dotenv").config();
const mongoose = require("mongoose");

const Pathology = require("../models/Pathology");

async function run() {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://127.0.0.1:27017/healthcare";
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });

  const termRegex =
    /(package|panel|profile|bundle|checkup|full\s*body|comprehensive)/i;
  const all = await Pathology.find({});

  const ops = [];
  for (const doc of all) {
    const isAlready = !!doc.isPackage;
    const hasManyComponents =
      Array.isArray(doc.components) && doc.components.length >= 3;
    const text = `${doc.name || ""} ${doc.category || ""} ${
      doc.description || ""
    }`;
    const looksLikePackage = termRegex.test(text);
    const nextIsPackage =
      isAlready || hasManyComponents || looksLikePackage ? true : false;

    // Normalize discountedPrice
    let discountedPrice = doc.discountedPrice;
    if (
      discountedPrice != null &&
      doc.price != null &&
      discountedPrice > doc.price
    ) {
      discountedPrice = doc.price;
    }

    // Only write when there is a change
    if (
      doc.isPackage !== nextIsPackage ||
      discountedPrice !== doc.discountedPrice
    ) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              isPackage: nextIsPackage,
              ...(discountedPrice != null ? { discountedPrice } : {}),
            },
          },
        },
      });
    }
  }

  if (ops.length) {
    const res = await Pathology.bulkWrite(ops);
    // eslint-disable-next-line no-console
    console.log(
      `Migration complete. Matched: ${res.matchedCount}, Modified: ${res.modifiedCount}`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("Migration complete. No changes needed.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", err);
  process.exit(1);
});
