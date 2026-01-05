const Workshop = require("../models/Workshop");
const { hasAuthority } = require("../middleware/authMiddleware");
const { normalizeWorkshopParticipants } = require("../contracts/workshopContracts");
const { safeAuditLog } = require("../services/SafeAuditLog");
const { AuditEventTypes } = require("../services/AuditEventRegistry");

/**
 * Identity:
 *   - Requires admin authority derived from upstream middleware before any participant data is returned.
 * Storage:
 *   - Queries workshop by workshopKey; Mongo _id never leaves the handler.
 * Notes:
 *   - Defaults to minimal contact-card participant data; contact fields can be included explicitly by admins.
 */
exports.getParticipants = async (req, res) => {
  try {
    if (!hasAuthority(req.user, "admin")) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const includeContact = String(req.query.includeContact || "").toLowerCase() === "true";

    const id = req.params.id;
    const workshop = await Workshop.findOne({ workshopKey: id })
      .populate("participants", "entityKey name city relation email phone")
      .populate("familyRegistrations.familyMemberId", "entityKey name relation city email phone")
      .populate("familyRegistrations.parentUser", "entityKey")
      .lean();

    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    const normalized = normalizeWorkshopParticipants(workshop, {
      adminView: true,
      includeContactFields: includeContact,
    });

    await safeAuditLog({
      eventType: AuditEventTypes.SECURITY,
      subjectType: "workshop",
      subjectKey: workshop.workshopKey || null,
      actorKey: req.user?.entityKey || null,
      metadata: {
        action: "workshop_participants_view_legacy_endpoint",
        includeContact,
        participantsReturned: normalized.participants?.length || 0,
      },
    });

    return res.json({
      success: true,
      participants: normalized.participants || [],
      participantsCount: normalized.participantsCount,
      directCount: normalized.directCount,
      familyCount: normalized.familyCount,
      meta: {
        includeContact,
      },
    });
  } catch (err) {
    console.error("❌ getParticipants error:", err);
    res.status(500).json({ message: "Server error fetching participants" });
  }
};
