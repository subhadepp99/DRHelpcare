const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Clinic = require("../models/Clinic");

// Connect to MongoDB
mongoose.connect(
  process.env.MONGODB_URI || "mongodb://localhost:27017/DrHelp",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

async function migrateDoctorStructure() {
  try {
    //console.log("Starting migration...");

    // 1. Update existing doctors to have doctorFees field
    //console.log("Updating doctors with doctorFees...");
    const doctors = await Doctor.find({});

    for (const doctor of doctors) {
      const updates = {};

      // Set doctorFees if not exists
      if (!doctor.doctorFees && doctor.consultationFee) {
        updates.doctorFees = doctor.consultationFee;
      }

      // Set bio if not exists
      if (!doctor.bio) {
        updates.bio = `${doctor.qualification} with ${
          doctor.experience
        } years of experience in ${
          doctor.department?.name || "General Medicine"
        }.`;
      }

      // Convert existing availability to availableDateTime if not exists
      if (
        !doctor.availableDateTime &&
        doctor.availability &&
        doctor.availability.length > 0
      ) {
        updates.availableDateTime = doctor.availability.map((avail) => ({
          day: avail.day,
          slots: avail.slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: slot.isAvailable,
            maxBookings: 1,
            currentBookings: 0,
          })),
          isAvailable: true,
        }));
      }

      // Convert existing clinics to clinicDetails if not exists
      if (
        !doctor.clinicDetails &&
        doctor.clinics &&
        doctor.clinics.length > 0
      ) {
        const clinicDetails = [];

        for (let i = 0; i < doctor.clinics.length; i++) {
          const clinicId = doctor.clinics[i];
          const clinic = await Clinic.findById(clinicId);

          if (clinic) {
            clinicDetails.push({
              clinic: clinicId,
              clinicName: clinic.name,
              clinicAddress: clinic.address,
              isPrimary: i === 0, // First clinic is primary
              consultationFee: doctor.consultationFee,
              availableDays:
                doctor.availability?.map((avail) => avail.day) || [],
              availableSlots:
                doctor.availability?.map((avail) => avail.slots).flat() || [],
            });
          }
        }

        if (clinicDetails.length > 0) {
          updates.clinicDetails = clinicDetails;
        }
      }

      // Update doctor if there are changes
      if (Object.keys(updates).length > 0) {
        await Doctor.findByIdAndUpdate(doctor._id, updates);
        //console.log(`Updated doctor: ${doctor.name}`);
      }
    }

    // 2. Update existing clinics to have the new doctor structure
    //console.log("Updating clinics with new doctor structure...");
    const clinics = await Clinic.find({});

    for (const clinic of clinics) {
      if (clinic.doctors && clinic.doctors.length > 0) {
        // Check if doctors array already has the new structure
        const hasNewStructure =
          clinic.doctors[0] &&
          typeof clinic.doctors[0] === "object" &&
          clinic.doctors[0].doctor;

        if (!hasNewStructure) {
          // Convert old structure to new structure
          const newDoctors = clinic.doctors.map((doctorId) => ({
            doctor: doctorId,
            isActive: true,
            consultationFee: null, // Will be set from doctor data
            availableDays: [],
            availableSlots: [],
            joinedDate: new Date(),
          }));

          await Clinic.findByIdAndUpdate(clinic._id, { doctors: newDoctors });
          //console.log(`Updated clinic: ${clinic.name}`);
        }
      }
    }

    // 3. Update clinic doctor counts
    //console.log("Updating clinic doctor counts...");
    const updatedClinics = await Clinic.find({});

    for (const clinic of updatedClinics) {
      const activeDoctorCount = clinic.getActiveDoctorCount();
      //console.log(`Clinic ${clinic.name}: ${activeDoctorCount} active doctors`);
    }

    //console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    mongoose.connection.close();
  }
}

// Run migration
migrateDoctorStructure();
