import React, { createContext, useContext, useEffect, useState } from "react";

const log = (msg, data) => {
  const now = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${now}] [PROFILE] ${msg}`, "color:#1e88e5;font-weight:bold;", data ?? "");
};

const ProfileContext = createContext({
  profiles: [],
  setProfiles: () => {},
  selectedProfile: null,
  setSelectedProfile: () => {},
  fetchProfiles: () => {},
  addProfile: () => {},
  updateEntity: () => {},
  deleteProfile: () => {},
});

export const ProfileProvider = ({ children }) => {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchProfiles = async () => {
    log("🔄 fetchProfiles() called");
    const token = localStorage.getItem("token");
    if (!token) {
      log("No token → skipping fetchProfiles");
      setProfiles([]);
      setError("");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load profiles");

      const unified = data.flatMap((user) => {
        const userRow = { ...user, isFamily: false, parentName: null };
        const familyRows = (user.familyMembers || []).map((f) => ({
          ...f,
          isFamily: true,
          parentId: user._id,
          parentName: user.name,
          parentEmail: user.email,
        }));
        return [userRow, ...familyRows];
      });

      setProfiles(unified);
      log(`✅ Profiles loaded (${unified.length})`, unified);
      setError("");
    } catch (err) {
      console.error("❌ [PROFILE] fetchProfiles error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addProfile = async (profile) => {
    log("➕ addProfile()", profile);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create profile");
      log("✅ Profile created", data);
      await fetchProfiles();
      return { success: true, data };
    } catch (err) {
      console.error("❌ addProfile error:", err);
      return { success: false, message: err.message };
    }
  };

  const updateEntity = async (payload) => {
    log("✏️ updateEntity()", payload);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users/update-entity", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update entity");

      log("✅ Entity updated successfully", data);
      await fetchProfiles();
      return { success: true, data };
    } catch (err) {
      console.error("❌ updateEntity error:", err);
      return { success: false, message: err.message };
    }
  };

  const deleteProfile = async (id) => {
    log(`🗑 deleteProfile(${id})`);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete profile");
      setProfiles((prev) => prev.filter((p) => p._id !== id));
      log("✅ Profile deleted", id);
      return { success: true };
    } catch (err) {
      console.error("❌ deleteProfile error:", err);
      return { success: false, message: err.message };
    }
  };

  useEffect(() => {
    log("🚀 ProfileProvider mounted — initializing fetch");
    fetchProfiles();
  }, []);

  useEffect(() => {
    log("📊 State update | profiles count:", profiles.length);
  }, [profiles]);

  useEffect(() => {
    if (selectedProfile) log("🎯 Selected profile changed", selectedProfile.name);
  }, [selectedProfile]);

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        setProfiles,
        selectedProfile,
        setSelectedProfile,
        fetchProfiles,
        addProfile,
        updateEntity,
        deleteProfile,
        loading,
        error,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfiles = () => useContext(ProfileContext);
