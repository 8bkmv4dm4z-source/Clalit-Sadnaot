// src/constants/workshopImages.js

export const WORKSHOP_IMAGES = [
  // --- STRENGTH & HIGH INTENSITY ---
  {
    id: 'weightlifting_heavy',
    label: 'Weightlifting',
    // Preserved: The one you liked (Girl with Kettlebell)
    src: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'crossfit_box',
    label: 'Crossfit & HIIT',
    // Preserved: The working gym/box shot
    src: 'https://images.unsplash.com/photo-1599058945522-28d584b6f0ff?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'functional_training',
    label: 'Functional Training',
    // New: True action shot (Battle Ropes/High Intensity) to replace the "girl" photo
    src: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=80',
  },

  // --- PILATES (Specifics) ---
  {
    id: 'pilates_reformer',
    label: 'Pilates (Reformer)',
    // New: Clear, high-quality Reformer machine shot
    src: 'https://images.unsplash.com/photo-1616279967983-ec411479438d?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_reformer_action',
    label: 'Pilates (Reformer Action)',
    // New: Woman actually performing an exercise on the machine
    src: 'https://images.unsplash.com/photo-1522845036863-9d79367e6871?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_mat',
    label: 'Pilates (Mat)',
    // Preserved: Working Mat photo
    src: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_core',
    label: 'Pilates (Core/Ball)',
    // New: Specific Swiss Ball / Core focus
    src: 'https://images.unsplash.com/photo-1517130038641-a777d04af3a6?auto=format&fit=crop&w=600&q=80',
  },

  // --- YOGA (Expanded Types) ---
  {
    id: 'yoga_flow',
    label: 'Yoga (General)',
    // New: Reliable studio flow shot
    src: 'https://images.unsplash.com/photo-1552196563-55cd4e45efb3?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'yoga_vinyasa',
    label: 'Vinyasa Flow',
    // Preserved: Working Vinyasa shot
    src: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'yoga_ashtanga',
    label: 'Ashtanga / Power',
    // New: Strong, advanced pose to represent "Power"
    src: 'https://images.unsplash.com/photo-1599447421405-0e32096d30fd?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'yoga_hatha',
    label: 'Hatha / Stretch',
    // Preserved: Working Hatha shot
    src: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80',
  },

  // --- WELLNESS & SPECIALTY (Preserved) ---
  {
    id: 'wellness_mind',
    label: 'Wellness',
    // Preserved: You said this one is good
    src: 'https://images.unsplash.com/photo-1544367563-12123d8965cd?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'baby_development',
    label: 'Baby Development',
    src: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'swimming_water',
    label: 'Swimming',
    src: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=80',
  },

  // --- MOOD & FUNNY (Refined) ---
  {
    id: 'funny_yoga_baby',
    label: 'Yoga Baby',
    // New: Classic funny baby doing yoga pose
    src: 'https://images.unsplash.com/photo-1510766153920-569b9148d479?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'funny_gym_dog',
    label: 'Gym Dog',
    // Preserved: The funny dog
    src: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&q=80',
  }
];

// --- SMART HELPER ---
export const getWorkshopImage = (identifier) => {
  // 1. Fallback if empty
  if (!identifier) return WORKSHOP_IMAGES[0].src; 

  // 2. Check if it's a Preset ID
  const preset = WORKSHOP_IMAGES.find((img) => img.id === identifier);
  if (preset) return preset.src;

  // 3. Otherwise, it's a custom URL/Path
  return identifier;
};
