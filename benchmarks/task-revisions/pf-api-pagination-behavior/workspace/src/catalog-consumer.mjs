import { collectItems } from "./pagination.mjs";

export async function loadCatalogIds(request, url) {
  return (await collectItems(request, url, { pageSize: 2 })).map(item => item.id);
}
