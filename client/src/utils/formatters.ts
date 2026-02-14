/**
 * Build a Google Maps search URL for a given city/address pair.
 *
 * @param city - City name from backend data.
 * @param address - Street address from backend data.
 * @returns Google Maps query URL or null when no location is available.
 */
export function getGoogleMapsLink(city?: string | null, address?: string | null): string | null {
  if (!city && !address) return null;
  const query = encodeURIComponent(`${address || ""}, ${city || ""}`.trim());
  return `https://www.google.com/maps?q=${query}`;
}
