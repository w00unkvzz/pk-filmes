// Player Rave: the reference site publishes a plain "Abrir Player" link that
// Rave's in-app browser can pick up. We keep the same flow but point at a
// minimal page so HLS (.m3u8) also plays instead of downloading a manifest.
export function raveHref(item, title = "") {
  const source = item?.player || item?.stream || "";
  const params = new URLSearchParams();
  if (item?.id) params.set("id", item.id);
  if (source) params.set("src", source);
  const label = title || item?.title || "";
  if (label) params.set("title", label);
  return `/rave.html?${params.toString()}`;
}
