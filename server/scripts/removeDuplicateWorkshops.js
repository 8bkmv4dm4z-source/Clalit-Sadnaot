const mongoose = require("mongoose");
require("dotenv").config(); // Ensure you have a .env file in your root or server directory
const Workshop = require("../models/Workshop");

// ⚠️ SAFETY: Set this to false to actually delete documents
const DRY_RUN = false;

async function removeDuplicateWorkshops() {
  console.log(`🚀 Starting Workshop Deduplication Script (Dry Run: ${DRY_RUN})...`);

  try {
    // 1. Connect to Database
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error("❌ MONGO_URI is missing in environment variables.");
    
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB.");

    // 2. Aggregate to find titles with more than 1 occurrence
    const duplicates = await Workshop.aggregate([
      {
        $group: {
          _id: "$title", // Group by title
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 } // Only duplicate titles
        }
      }
    ]);

    console.log(`🔍 Found ${duplicates.length} titles with duplicates.\n`);

    if (duplicates.length === 0) {
      console.log("🎉 No duplicates found.");
      return;
    }

    let totalDeleted = 0;

    // 3. Process each group of duplicates
    for (const group of duplicates) {
      const title = group._id;
      const ids = group.ids;

      // Fetch full documents to decide which one to keep
      const workshops = await Workshop.find({ _id: { $in: ids } });

      // SORTING LOGIC:
      // 1. Most participants first (preserve data)
      // 2. Newest 'updatedAt' first (preserve latest edits)
      workshops.sort((a, b) => {
        const aParticipants = (a.participants || []).length;
        const bParticipants = (b.participants || []).length;
        if (bParticipants !== aParticipants) return bParticipants - aParticipants;

        const aDate = new Date(a.updatedAt || 0).getTime();
        const bDate = new Date(b.updatedAt || 0).getTime();
        return bDate - aDate;
      });

      const [keeper, ...toRemove] = workshops;

      console.log(`Title: "${title}"`);
      console.log(`   ✅ KEEPING: ID ${keeper._id} | Participants: ${(keeper.participants || []).length} | Updated: ${keeper.updatedAt}`);
      
      for (const remove of toRemove) {
        console.log(`   ❌ REMOVING: ID ${remove._id} | Participants: ${(remove.participants || []).length} | Updated: ${remove.updatedAt}`);
        
        if (!DRY_RUN) {
          await Workshop.deleteOne({ _id: remove._id });
        }
      }
      
      totalDeleted += toRemove.length;
      console.log("---------------------------------------------------");
    }

    // 4. Summary
    if (DRY_RUN) {
      console.log(`\n🏁 [DRY RUN] Would have deleted ${totalDeleted} workshops.`);
      console.log(`👉 Set 'const DRY_RUN = false;' in the script to execute deletion.`);
    } else {
      console.log(`\n🗑️  Successfully deleted ${totalDeleted} duplicate workshops.`);
    }

  } catch (err) {
    console.error("❌ Error executing script:", err);
  } finally {
    await mongoose.disconnect();
    console.log("👋 Disconnected.");
    process.exit();
  }
}

removeDuplicateWorkshops();