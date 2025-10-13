// src/layouts/ProfileContext.jsx — Secure Version using apiFetch()

import React, { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "../../utils/apiFetch";

const log = (msg, data) => {
  const now = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${now}] [PROFILE] ${msg}`, "color:#1e88e5;font-weight:bold;", data ?? "");
};

const ProfileContext = createContext({
  profiles: [],
  setProfiles: () => {},
  selectedProfile: null,
  setSelectedProfile: () => {},
  fetchProfiles: async () => {},
  addProfile: async () => {},
  updateEntity: async () => {},
  deleteProfile: async () => {},
});

export const ProfileProvider = ({ children }) => {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** 🔹 Fetch all profiles (users + families) */
  const fetchProfiles = async () => {
    log("🔄 fetchProfiles() called");

    try {
      setLoading(true);
      setError("");

      // ✅ Secure fetch with automatic token and refresh
      const res = await apiFetch("/api/users", { method: "GET" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load profiles");

      // Normalize data
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
    } catch (err) {
      console.error("❌ [PROFILE] fetchProfiles error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** ➕ Add new profile */
  const addProfile = async (profile) => {
    log("➕ addProfile()", profile);
    try {
      const res = await apiFetch("/api/users", {
        method: "POST",
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

  /** ✏️ Update user or family entity */
  const updateEntity = async (payload) => {
    log("✏️ updateEntity()", payload);
    try {
      const res = await apiFetch("/api/users/update-entity", {
        method: "PUT",
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

  /** 🗑 Delete a profile (user or family) */
  const deleteProfile = async (id) => {
    log(`🗑 deleteProfile(${id})`);
    try {
      const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
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

  // 🚀 Initialize
  useEffect(() => {
    log("🚀 ProfileProvider mounted — initializing fetch");
    fetchProfiles();
  }, []);

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
