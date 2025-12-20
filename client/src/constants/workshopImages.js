// src/constants/workshopImages.js

export const WORKSHOP_IMAGES = [
  // ==========================================
  // 1. STRENGTH & HIGH INTENSITY
  // ==========================================
  {
    id: 'weightlifting_heavy',
    label: 'Weightlifting',
    // VERIFIED: Girl with Kettlebell (moved from old functional slot)
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
    // REPLACED: "More Action" -> Sled Push / High Intensity movement
    src: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=80',
  },

  // ==========================================
  // 2. PILATES
  // ==========================================
  {
    id: 'pilates_reformer',
    label: 'Pilates (Reformer)',
    // REPLACED: New high-quality studio Reformer shot (Close up/Clean)
    src: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_reformer_action',
    label: 'Pilates (Reformer Action)',
    // REPLACED: Person actively using the machine (Side view/Stretch)
    src: 'https://images.unsplash.com/photo-1522845036863-9d79367e6871?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_mat',
    label: 'Pilates (Mat)',
    // VERIFIED: Standard Mat
    src: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_core',
    label: 'Pilates (Core/Ball)',
    // REPLACED: Woman balancing on pink exercise ball (Clearer subject)
    src: 'https://images.unsplash.com/photo-1597452485669-2c7bb5fef90d?auto=format&fit=crop&w=600&q=80',
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
    id: 'yoga_vinyasa',
    label: 'Vinyasa Flow',
    // VERIFIED: Sunset/Warm Flow
    src: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'yoga_ashtanga',
    label: 'Ashtanga / Power',
    // REPLACED: Male doing advanced strong pose (Hand balance)
    src: 'https://images.unsplash.com/photo-1562088287-b9c3de7b897e?auto=format&fit=crop&w=600&q=80',
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
    // VERIFIED: You explicitly liked this
    src: 'https://images.unsplash.com/photo-1544367563-12123d8965cd?auto=format&fit=crop&w=600&q=80',
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
  // 5. MOOD & FUNNY
  // ==========================================
  {
    id: 'funny_yoga_baby',
    label: 'Yoga Baby',
    // REPLACED: Funny baby legs in air (classic "Happy Baby" pose)
    src: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80',
  },
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
