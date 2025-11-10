const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
require("dotenv").config();

async function fixDoctorIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Drop all indexes on the doctors collection
    console.log("Dropping existing indexes...");
    await Doctor.collection.dropIndexes();

    // Recreate indexes based on the current schema
    console.log("Recreating indexes...");
    await Doctor.ensureIndexes();

    console.log("Doctor indexes fixed successfully!");

    // List current indexes
    const indexes = await Doctor.collection.listIndexes().toArray();
    console.log("Current indexes:");
    indexes.forEach((index) => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
    });
  } catch (error) {
    console.error("Error fixing doctor indexes:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

fixDoctorIndexes();
