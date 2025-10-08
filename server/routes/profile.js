// server/routes/profile.js
const express = require("express");
const router = express.Router();
const { authenticate, authorizeAdmin } = require("../middleware/authMiddleware");
const { getUserProfile } = require("../controllers/authController");
const {
  getAllUsers,
  deleteUser,
  updateUser,
} = require("../controllers/userController");

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
router.put("/edit", authenticate, async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized - no user in token" });
    }

    console.log("✏️ [Profile/Edit] Authenticated user:", req.user._id);

    // נשתמש בפונקציה updateUser אבל נגדיר ידנית את ה-id
    req.params.id = req.user._id.toString();

    // נריץ את הפונקציה של userController ישירות
    await updateUser(req, res);
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
 * ✅ DELETE /api/profile/:id
 * מוחק משתמש לפי ID (רק אדמין)
 */
router.delete("/:id", authenticate, authorizeAdmin, deleteUser);

module.exports = router;
