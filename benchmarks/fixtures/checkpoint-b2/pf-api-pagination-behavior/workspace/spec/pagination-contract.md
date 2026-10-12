# Catalog API v2

`collectItems(request, initialUrl, { pageSize = 2 } = {})` returns the ordered concatenation of item arrays. `request(url)` is injected and returns a promise for one page. A page is `{ items: [...], links: { next: absoluteUrlOrNull } }`; the fixed decoder checks this shape. Items may have additional fields and must be retained unchanged, including duplicate IDs and order.

The caller supplies a valid v2 base URL without retired parameters. On the first request, preserve the initial URL's path and other query parameters, set `limit` to the configured page size, and do not introduce the retired `page_size` parameter. A size must be an integer from 1 through 100; the default and caller signature stay unchanged.

Subsequent requests use the supplied `links.next` string exactly. It can contain an opaque cursor and its own query parameters. Do not calculate a page number, reconstruct a URL, or reapply the first-request options to it. An empty `items` array can still have a continuation. Stop only when the decoded continuation is null.

Preserve the existing bound of ten requests and reject a repeated request URL before making that request again. Propagate request/decoder failures. The decoder's same-origin HTTPS boundary is fixed. This is a fictional local API contract; the request doubles use only example.test URLs and never access the network.
