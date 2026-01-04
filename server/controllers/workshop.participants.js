const Workshop = require("../models/Workshop");

/**
 * Identity:
 *   - Assumes caller authorized upstream via entityKey-bearing middleware; does not gate on _id.
 * Storage:
 *   - Queries workshop by workshopKey and uses Mongo _id only inside population.
 * Notes:
 *   - Responds with entityKey-based participant data to avoid leaking _id values.
 */
exports.getParticipants = async (req, res) => {
  try {
    const id = req.params.id;
    const workshop = await Workshop.findOne({ workshopKey: id })
      .populate("participants", "entityKey name email phone city birthDate canCharge")
      .populate("familyRegistrations.familyMemberId", "entityKey name relation phone birthDate")
      .populate("familyRegistrations.parentUser", "entityKey")
      .lean();

    if (!workshop) return res.status(404).json({ message: "Workshop not found" });

    return res.json({
      participants: (workshop.participants || []).map((p) => ({
        entityKey: p.entityKey || null,
        name: p.name,
        email: p.email,
        phone: p.phone,
        city: p.city,
        birthDate: p.birthDate,
        canCharge: !!p.canCharge,
      })),
      familyRegistrations: (workshop.familyRegistrations || []).map((fr) => ({
        familyMemberKey: fr.familyMemberId?.entityKey || null,
        parentKey: fr.parentUser?.entityKey || null,
        name: fr.name,
        relation: fr.relation,
        phone: fr.phone,
        birthDate: fr.birthDate,
      })),
    });
  } catch (err) {
    console.error("❌ getParticipants error:", err);
    res.status(500).json({ message: "Server error fetching participants" });
  }
};
