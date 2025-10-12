const Workshop = require("../models/Workshop");

// Return participants with clean separation of user participants vs family registrations
exports.getParticipants = async (req, res) => {
  try {
    const w = await Workshop.findById(req.params.id)
      .populate("participants", "name email phone city birthDate canCharge")
      .lean();
    if (!w) return res.status(404).json({ message: "Workshop not found" });

    return res.json({
      participants: (w.participants || []).map((p) => ({
        _id: String(p._id),
        name: p.name,
        email: p.email,
        phone: p.phone,
        city: p.city,
        birthDate: p.birthDate,
        canCharge: !!p.canCharge,
      })),
      familyRegistrations: (w.familyRegistrations || []).map((fr) => ({
        familyMemberId: String(fr.familyMemberId),
        parentUser: String(fr.parentUser),
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
