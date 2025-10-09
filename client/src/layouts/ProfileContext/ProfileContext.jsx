/**
 * ProfileContext.jsx — Full Server-Connected Version
 * --------------------------------------------------
 * - Loads all users (with familyMembers)
 * - Provides CRUD operations (fetch, add, update, delete)
 * - Unified data model for users and family members
 * - Used by AllProfiles, EditProfile, and admin components
 */

import React, { createContext, useContext, useEffect, useState } from "react";

const ProfileContext = createContext({
  profiles: [],
  setProfiles: () => {},
  selectedProfile: null,
  setSelectedProfile: () => {},
  fetchProfiles: () => {},
  addProfile: () => {},
  updateProfile: () => {},
  deleteProfile: () => {},
});

export const ProfileProvider = ({ children }) => {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** 🔹 Fetch all profiles (users + familyMembers) */
  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load profiles");

      // 🧩 Flatten all family members into unified list
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
      setError("");
    } catch (err) {
      console.error("❌ Error fetching profiles:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** 🔹 Add new user */
  const addProfile = async (profile) => {
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
      await fetchProfiles();
      return { success: true };
    } catch (err) {
      console.error("❌ addProfile error:", err);
      return { success: false, message: err.message };
    }
  };

  /** 🔹 Update existing user or family member */
  const updateProfile = async (updated) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/users/${updated._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update profile");
      await fetchProfiles();
      return { success: true };
    } catch (err) {
      console.error("❌ updateProfile error:", err);
      return { success: false, message: err.message };
    }
  };

  /** 🔹 Delete user */
  const deleteProfile = async (id) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete profile");
      setProfiles((prev) => prev.filter((p) => p._id !== id));
      return { success: true };
    } catch (err) {
      console.error("❌ deleteProfile error:", err);
      return { success: false, message: err.message };
    }
  };

  /** 🔁 Initial fetch on mount */
  useEffect(() => {
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
        updateProfile,
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
