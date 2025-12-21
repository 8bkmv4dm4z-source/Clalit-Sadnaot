// src/components/ImageSelector.jsx
/* global File, URL */
import React, { useRef } from 'react';
import { WORKSHOP_IMAGES } from '../constants/workshopImages';
import { Upload } from 'lucide-react';

export default function ImageSelector({ selectedValue, onChange }) {
  const fileInputRef = useRef(null);

  // Check if current value is a known preset
  const isPreset = WORKSHOP_IMAGES.some((img) => img.id === selectedValue);
  
  // Check if current value is a File object (pending upload)
  const isFileObject = selectedValue instanceof File;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onChange(e.target.files[0]);
    }
  };

  return (
    <div className="space-y-3 mb-6">
      <label className="block text-sm font-medium text-gray-700">
        תמונת סדנה (בחר מהרשימה או העלה מהמחשב)
      </label>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* 1. Presets */}
        {WORKSHOP_IMAGES.map((img) => (
          <div
            key={img.id}
            onClick={() => onChange(img.id)}
            className={`
              cursor-pointer relative rounded-xl overflow-hidden border-2 transition-all h-20 group
              ${selectedValue === img.id ? 'border-indigo-600 ring-2 ring-indigo-200 scale-95' : 'border-transparent opacity-80 hover:opacity-100'}
            `}
          >
            <img src={img.src} alt={img.label} className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] text-center py-1 truncate px-1">
              {img.label}
            </div>
          </div>
        ))}

        {/* 2. Upload Button */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`
            cursor-pointer relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center h-20 transition-all
            ${(!isPreset && selectedValue) ? 'border-indigo-600 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
          `}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
          />

          {isFileObject ? (
            <img
              src={URL.createObjectURL(selectedValue)}
              alt="Preview"
              className="w-full h-full object-cover rounded-lg opacity-80"
            />
          ) : (!isPreset && selectedValue && typeof selectedValue === 'string') ? (
             <img
              src={selectedValue}
              alt="Custom"
              className="w-full h-full object-cover rounded-lg opacity-80"
            />
          ) : (
            <>
              <Upload size={20} className="text-gray-400 mb-1" />
              <span className="text-[10px] text-gray-500 font-semibold">העלה תמונה</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
