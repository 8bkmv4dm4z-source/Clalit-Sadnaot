export function getGoogleMapsLink(city, address) {
  if (!city && !address) return null;
  const query = encodeURIComponent(`${address || ""}, ${city || ""}`.trim());
  return `https://www.google.com/maps?q=${query}`;
}
