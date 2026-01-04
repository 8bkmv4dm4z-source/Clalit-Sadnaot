// server/routes/profile.js
const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");
const { getUserProfile } = require("../controllers/authController");
const {
  getAllUsers,
  deleteUser,
  updateEntity, // ⬅️ זה השם הנכון!
} = require("../controllers/userController");
// 🎛 Validation middleware
const { validateProfile } = require("../middleware/validation");
/**
 * ✅ GET /api/profile
 * מחזיר את פרופיל המשתמש המחובר לפי ה־token
 */
router.get("/", authenticate, getUserProfile);

/**
 * ✅ PUT /api/profile/edit
 * מעדכן את המשתמש המחובר עצמו.
 * משתמש בפונקציה updateUser מתוך userController,
 * אך "מזריק" את userId מה־token לתוך req.params.id
 */
router.put("/edit", authenticate, validateProfile, async (req, res) => {
  try {
    if (!req.user?.entityKey) {
      return res.status(401).json({ message: "Unauthorized - no user in token" });
    }

    const allowed = ["name", "phone", "city", "email", "birthDate", "idNumber"];
    const updates = allowed.reduce((acc, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});

    req.body.entityKey = req.user.entityKey; // ⬅️ משתמשים בזהות האפליקטיבית, לא ב-_id
    req.body.updates = updates; // ⬅️ כי updateEntity מצפה ל-updates

    await updateEntity(req, res); // ⬅️ קורא לפונקציה הקיימת שלך
  } catch (e) {
    console.error("❌ [Profile/Edit] Server error:", e);
    res.status(500).json({
      message: "Server error updating profile",
      error: e.message,
    });
  }
});


/**
 * ✅ GET /api/profile/all
 * מחזיר את רשימת כל המשתמשים (לאדמין בלבד)
 */
router.get("/all", authenticate, authorizeAdmin, getAllUsers);

/**
 * ✅ DELETE /api/profile/by-entity/:entityKey
 * מוחק משתמש לפי entityKey (רק אדמין)
 */
router.delete("/by-entity/:entityKey", authenticate, authorizeAdmin, deleteUser);
// Legacy: treat :id as entityKey until clients migrate
router.delete("/:id", authenticate, authorizeAdmin, deleteUser);

module.exports = router;
