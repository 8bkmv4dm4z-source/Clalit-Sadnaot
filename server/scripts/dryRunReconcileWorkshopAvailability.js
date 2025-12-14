require("dotenv").config();
const mongoose = require("mongoose");
const Workshop = require("../models/Workshop"); // ✅ FIXED PATH

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  console.log("🧪 DRY RUN — Workshop availability reconciliation");
  console.log("⚠️  NO DATA WILL BE WRITTEN\n");

  const workshops = await Workshop.find({});
  let wouldFix = 0;

  for (const w of workshops) {
    const participantsCount =
      (w.participants?.length || 0) +
      (w.familyRegistrations?.length || 0);

    const shouldBeAvailable =
      w.maxParticipants === 0 || participantsCount < w.maxParticipants;

    if (w.available !== shouldBeAvailable) {
      wouldFix++;
      console.log({
        workshopId: w._id.toString(),
        title: w.title,
        currentAvailable: w.available,
        computedAvailable: shouldBeAvailable,
        participantsCount,
        maxParticipants: w.maxParticipants,
      });
    }
  }

  console.log("\n📊 SUMMARY");
  console.log(`Workshops that WOULD be updated: ${wouldFix}`);
  console.log("✅ Dry run complete — no changes made");

  await mongoose.disconnect();
})();
