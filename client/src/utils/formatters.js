/**
 * Build a Google Maps search URL for a given city/address pair.
 *
 * DATA FLOW
 * • Source: Display components (workshop cards, profile addresses) call this helper when rendering anchor tags.
 * • Flow: Receives raw strings from API responses → URL-encodes them → returns a string the caller can place in
 *   an `<a href>`.
 * • Downstream: The returned URL is read-only and does not modify the component state; if both inputs are missing
 *   the function returns `null` so callers can conditionally skip rendering the link.
 *
 * @param {string | undefined | null} city - City name from backend data.
 * @param {string | undefined | null} address - Street address from backend data.
 * @returns {string | null} Google Maps query URL or null when no location is available.
 */
export function getGoogleMapsLink(city, address) {
  if (!city && !address) return null;
  const query = encodeURIComponent(`${address || ""}, ${city || ""}`.trim());
  return `https://www.google.com/maps?q=${query}`;
}
