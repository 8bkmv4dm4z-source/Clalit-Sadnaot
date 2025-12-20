// src/constants/workshopImages.js

export const WORKSHOP_IMAGES = [
  // ==========================================
  // 1. STRENGTH & HIGH INTENSITY
  // ==========================================
  {
    id: 'weightlifting_heavy',
    label: 'Weightlifting',
    // VERIFIED: Girl with Kettlebell
    src: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'crossfit_box',
    label: 'Crossfit & HIIT',
    // VERIFIED: Dynamic Gym Box
    src: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'functional_training',
    label: 'Functional Training',
    // VERIFIED: Sled Push / High Intensity
    src: 'https://images.unsplash.com/photo-1550259979-ed79b48d2a30?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTB8fGZ1bmN0aW9uYWwlMjB0cmFpbmluZ3xlbnwwfHwwfHx8MA%3D%3D',
  },
  // ==========================================
  // 2. PILATES (Simplified)
  // ==========================================
  {
    id: 'pilates_mat',
    label: 'Pilates (Mat)',
    // VERIFIED: Standard Mat
    src: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=600&q=80',
  },

  // ==========================================
  // 3. YOGA
  // ==========================================
  {
    id: 'yoga_flow',
    label: 'Yoga (General)',
    // VERIFIED: Studio Flow
    src: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'yoga_hatha',
    label: 'Hatha / Stretch',
    // VERIFIED: Gentle Stretch
    src: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80',
  },

  // ==========================================
  // 4. WELLNESS & SPECIALTY
  // ==========================================
  {
    id: 'wellness_mind',
    label: 'Wellness',
    // SWAPPED: Now using the "Sunset Flow" image you liked from the old Vinyasa slot
    src: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'baby_development',
    label: 'Baby Development',
    // VERIFIED: Mom and baby
    src: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'swimming_water',
    label: 'Swimming',
    // VERIFIED: Pool/Water
    src: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=80',
  },

  // ==========================================
  // 5. HIGH RESOLUTION EXTRAS (New)
  // ==========================================
  {
    id: 'high_res_gym',
    label: 'Cinematic Gym',
    // NEW: Dark, moody, high-quality gym aesthetic
    src: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'high_res_outdoor',
    label: 'Outdoor Zen',
    // NEW: Crisp outdoor nature workout/meditation
    src: 'https://images.unsplash.com/photo-1552674605-4696041720bd?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'high_res_athletic',
    label: 'Focused Athletics',
    // NEW: High detail runner/track shot
    src: 'https://images.unsplash.com/photo-1486218119243-13883505764c?auto=format&fit=crop&w=600&q=80',
  },

  // ==========================================
  // 6. MOOD & FUNNY
  // ==========================================
  {
    id: 'funny_gym_dog',
    label: 'Gym Dog',
    // VERIFIED: Dog
    src: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=600&q=80',
  }
];

// --- SMART HELPER ---
export const getWorkshopImage = (identifier) => {
  if (!identifier) return WORKSHOP_IMAGES[0].src; 
  const preset = WORKSHOP_IMAGES.find((img) => img.id === identifier);
  if (preset) return preset.src;
  return identifier;
};
