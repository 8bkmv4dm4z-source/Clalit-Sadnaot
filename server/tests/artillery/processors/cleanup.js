/**
 * processors/cleanup.js
 * ---------------------------------------------------
 * Deletes old test users before any scenario runs.
 * Uses /api/dev/cleanup-user (disabled in production).
 */
export async function cleanupUsers() {
  const base = "http://localhost:5000";
  const emails = Array.from({ length: 20 }, (_, i) => `u${i + 1}@test.com`);

  console.log("🧹 Starting cleanup of old test users...");

  let deleted = 0;

  for (const email of emails) {
    try {
      const res = await fetch(`${base}/api/dev/cleanup-user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.status === 200) {
        deleted++;
        console.log(`✅ Deleted ${email}`);
      } else if (res.status === 404) {
        console.log(`⚠️ Not found (already clean): ${email}`);
      } else {
        console.warn(`❌ Failed ${email}: ${res.status}`);
      }
    } catch (err) {
      console.error(`🔥 Error deleting ${email}:`, err.message);
    }
  }

  console.log(`✅ Cleanup complete: ${deleted}/${emails.length} users deleted.`);
}
