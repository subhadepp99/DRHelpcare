const mongoose = require("mongoose");
require("dotenv").config();

const Doctor = require("./models/Doctor");
const Clinic = require("./models/Clinic");

async function debugSearch() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/healthcare"
    );
    console.log("Connected to MongoDB");

    // Check doctors
    const totalDoctors = await Doctor.countDocuments({});
    const activeDoctors = await Doctor.countDocuments({ isActive: true });
    const inactiveDoctors = await Doctor.countDocuments({ isActive: false });

    console.log("\n=== DOCTORS ===");
    console.log(`Total: ${totalDoctors}`);
    console.log(`Active: ${activeDoctors}`);
    console.log(`Inactive: ${inactiveDoctors}`);

    if (totalDoctors > 0) {
      const sampleDoctors = await Doctor.find({})
        .limit(5)
        .select("name city state address.city address.state isActive")
        .lean();

      console.log("\nSample doctors:");
      sampleDoctors.forEach((doc) => {
        console.log(`  - ${doc.name}`);
        console.log(`    Top-level: city="${doc.city}", state="${doc.state}"`);
        console.log(
          `    Address: city="${doc.address?.city || "N/A"}", state="${
            doc.address?.state || "N/A"
          }"`
        );
        console.log(`    Active: ${doc.isActive}`);
      });

      // Check for "Bidhannagar" or "West Bengal" specifically
      const bidhannagarDoctors = await Doctor.find({
        $or: [
          { city: /bidhannagar/i },
          { "address.city": /bidhannagar/i },
          { city: /west bengal/i },
          { "address.city": /west bengal/i },
          { state: /west bengal/i },
          { "address.state": /west bengal/i },
        ],
      })
        .select("name city state address.city address.state isActive")
        .lean();

      console.log(
        `\nDoctors matching "Bidhannagar" or "West Bengal": ${bidhannagarDoctors.length}`
      );
      bidhannagarDoctors.forEach((doc) => {
        console.log(`  - ${doc.name}`);
        console.log(`    city="${doc.city}", state="${doc.state}"`);
        console.log(
          `    address.city="${doc.address?.city || "N/A"}", address.state="${
            doc.address?.state || "N/A"
          }"`
        );
        console.log(`    Active: ${doc.isActive}`);
      });
    }

    // Check clinics
    const totalClinics = await Clinic.countDocuments({});
    const activeClinics = await Clinic.countDocuments({ isActive: true });

    console.log("\n=== CLINICS ===");
    console.log(`Total: ${totalClinics}`);
    console.log(`Active: ${activeClinics}`);

    if (totalClinics > 0) {
      const sampleClinics = await Clinic.find({})
        .limit(3)
        .select("name city state address.city address.state isActive")
        .lean();

      console.log("\nSample clinics:");
      sampleClinics.forEach((clinic) => {
        console.log(`  - ${clinic.name}`);
        console.log(
          `    Top-level: city="${clinic.city}", state="${clinic.state}"`
        );
        console.log(
          `    Address: city="${clinic.address?.city || "N/A"}", state="${
            clinic.address?.state || "N/A"
          }"`
        );
        console.log(`    Active: ${clinic.isActive}`);
      });
    }

    await mongoose.connection.close();
    console.log("\nDatabase connection closed");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugSearch();

