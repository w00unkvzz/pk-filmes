// Player Rave: the reference site exposes a server-rendered page with a
// schema.org VideoObject (contentUrl/embedUrl). Rave reads that metadata and
// opens its own player, so we only need to link at the item id.
export function raveHref(item) {
  const id = item?.id || "";
  return id ? `/rave/${encodeURIComponent(id)}` : "/catalogo";
}
