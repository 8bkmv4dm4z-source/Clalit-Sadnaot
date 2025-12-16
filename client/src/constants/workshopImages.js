// src/constants/workshopImages.js

export const WORKSHOP_IMAGES = [
  // --- STRENGTH & HIGH INTENSITY ---
  {
    id: 'weightlifting_heavy',
    label: 'Weightlifting',
    src: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'crossfit_box',
    label: 'Crossfit & HIIT',
    src: 'https://images.unsplash.com/photo-1517963879466-e925ac6943f6?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'functional_training',
    label: 'Functional Training',
    src: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=600&q=80',
  },

  // --- PILATES & CONTROL ---
  {
    id: 'pilates_reformer',
    label: 'Pilates (Reformer)',
    src: 'https://images.unsplash.com/photo-1518611012118-696072aa8795?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'pilates_mat',
    label: 'Pilates (Mat)',
    src: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=600&q=80',
  },

  // --- YOGA & WELLNESS ---
  {
    id: 'yoga_flow',
    label: 'Yoga',
    src: 'https://images.unsplash.com/photo-1599447421405-0c323d27bc5d?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'wellness_mind',
    label: 'Wellness',
    src: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
  },

  // --- SPECIALTY ---
  {
    id: 'baby_development',
    label: 'Baby Development',
    src: 'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'swimming_water',
    label: 'Swimming',
    src: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?auto=format&fit=crop&w=600&q=80',
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