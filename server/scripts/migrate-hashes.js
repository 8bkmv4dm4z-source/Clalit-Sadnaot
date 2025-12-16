/**
 * Database Hash Migration Script
 * Location: server/scripts/migrate-hashes.js
 * Usage: 
 * node migrate-hashes.js           (Dry Run)
 * node migrate-hashes.js --write   (Commit changes)
 */

// Point to the .env file in the parent directory
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const crypto = require("node:crypto");

// ==========================================================
// 1. CONFIGURATION & IMPORTS (Paths updated for scripts/ folder)
// ==========================================================

try {
  // We use ../ because we are inside the 'scripts' folder
  var User = require('../models/User'); 
  var Workshop = require('../models/Workshop');
} catch (e) {
  console.error("❌ Error loading models. Make sure you are running this from the 'server/scripts' folder.");
  console.error(e);
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
const SECRET = process.env.PUBLIC_ID_SECRET;

if (!SECRET) {
  console.error("❌ Error: PUBLIC_ID_SECRET is missing from env variables.");
  process.exit(1);
}

// ----------------------------------------------------------
// Hashing Logic
// ----------------------------------------------------------
function hashId(type, id) {
  if (!type || !id) throw new Error("hashId requires type and id");
  
  return crypto
    .createHmac("sha256", SECRET)
    .update(`${type}:${id.toString()}`)
    .digest("base64url")
    .slice(0, 22);
}

// Check arguments
const args = process.argv.slice(2);
const IS_DRY_RUN = !args.includes('--write');

console.log(`\n==================================================`);
console.log(`MODE: ${IS_DRY_RUN ? '🛡️  DRY RUN (No changes)' : '⚠️  WRITE (Updating DB)'}`);
console.log(`SECRET FINGERPRINT: ${crypto.createHash("sha256").update(SECRET).digest("hex").slice(0, 10)}`);
console.log(`==================================================\n`);

// ==========================================================
// 2. MIGRATION LOGIC
// ==========================================================

async function connect() {
  if (!MONGO_URI) throw new Error("Missing MongoDB Connection String");
  
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // --- DEBUGGING START ---
  const dbName = mongoose.connection.name;
  const host = mongoose.connection.host;
  console.log(`🔎  Connected to DB: "${dbName}" on host: "${host}"`);

  // List all collections to see if we are in the right place
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  console.log(`📂  Collections found:`, collectionNames.length > 0 ? collectionNames.join(', ') : 'NONE (Database is empty)');
  
  if (!collectionNames.includes('users') && !collectionNames.includes('workshops')) {
    console.warn('⚠️  WARNING: "users" or "workshops" collections not found. Check your MONGO_URI database name.');
  }
  // --- DEBUGGING END ---
}

/**
 * Process Workshops
 */
async function migrateWorkshops() {
  console.log(`\n🔄 Processing Workshops...`);
  
  const cursor = Workshop.find({}).lean().cursor();
  let stats = { checked: 0, updated: 0, missing: 0 };
  let bulkOps = [];
  const BATCH_SIZE = 500;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    stats.checked++;
    
    const expectedHash = hashId("workshop", doc._id);
    const currentHash = doc.hashedId;

    if (currentHash !== expectedHash) {
      if (!currentHash) stats.missing++;
      stats.updated++;

      if (IS_DRY_RUN) {
        console.log(`   [DryRun] Workshop ${doc._id} | Old: ${currentHash ? currentHash.substring(0,10)+'...' : 'NULL'} -> New: ${expectedHash}`);
      } else {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { hashedId: expectedHash } }
          }
        });
      }
    }

    if (bulkOps.length >= BATCH_SIZE) {
      if (!IS_DRY_RUN) await Workshop.bulkWrite(bulkOps);
      bulkOps = [];
    }
  }

  if (bulkOps.length > 0 && !IS_DRY_RUN) await Workshop.bulkWrite(bulkOps);
  console.log(`   Result: Checked ${stats.checked}, Found ${stats.updated} needing update.`);
}

/**
 * Process Users & Embedded Family Members
 */
async function migrateUsers() {
  console.log(`\n🔄 Processing Users & Embedded Families...`);
  
  const cursor = User.find({})
    .select('_id entityKey hashedId familyMembers')
    .lean()
    .cursor();

  let stats = { usersChecked: 0, usersUpdated: 0, familyUpdated: 0 };
  let bulkOps = [];
  const BATCH_SIZE = 200; 

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    stats.usersChecked++;
    let docModified = false;
    const updateSet = {};

    // 1. Check User Hash
    const expectedUserHash = hashId("user", doc._id);
    
    if (doc.entityKey !== expectedUserHash) {
      updateSet['entityKey'] = expectedUserHash;
      docModified = true;
      if (IS_DRY_RUN) console.log(`   [DryRun] User ${doc._id} (entityKey) mismatch.`);
    }

    if (doc.hashedId && doc.hashedId !== expectedUserHash) {
      updateSet['hashedId'] = expectedUserHash;
      docModified = true;
      if (IS_DRY_RUN) console.log(`   [DryRun] User ${doc._id} (hashedId) mismatch.`);
    }

    // 2. Check Embedded Family Members
    if (doc.familyMembers && doc.familyMembers.length > 0) {
      // Need to convert to object to avoid Mongoose locking arrays
      let familyArray = doc.familyMembers.map(m => m.toObject ? m.toObject() : m);
      let familyChanged = false;

      const updatedFamily = familyArray.map(member => {
        const expectedFamHash = hashId("family", member._id);
        
        if (member.entityKey !== expectedFamHash) {
          stats.familyUpdated++;
          familyChanged = true;
          if (IS_DRY_RUN) console.log(`   [DryRun] FamilyMember ${member._id} hash mismatch.`);
          return { ...member, entityKey: expectedFamHash }; 
        }
        return member;
      });

      if (familyChanged) {
        updateSet['familyMembers'] = updatedFamily;
        docModified = true;
      }
    }

    // 3. Queue Updates
    if (docModified) {
      stats.usersUpdated++;
      if (!IS_DRY_RUN) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: updateSet }
          }
        });
      }
    }

    if (bulkOps.length >= BATCH_SIZE) {
      if (!IS_DRY_RUN) await User.bulkWrite(bulkOps);
      bulkOps = [];
    }
  }

  if (bulkOps.length > 0 && !IS_DRY_RUN) await User.bulkWrite(bulkOps);
  console.log(`   Result: Checked ${stats.usersChecked} Users.`);
  console.log(`           Identified ${stats.usersUpdated} Users needing updates.`);
  console.log(`           Identified ${stats.familyUpdated} Family Members needing updates.`);
}

async function run() {
  try {
    await connect();
    await migrateWorkshops();
    await migrateUsers();
    console.log(`\n✅ Migration Complete.`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration Failed:', err);
    process.exit(1);
  }
}

run();