import { ConnectorError } from "./errors";

/**
 * The vendor-aware HTTP helper (S03). Connectors NEVER call `fetch` directly — they go through
 * `ctx.http`, the one chokepoint where auth injection, error normalization, and (later) rate limiting
 * (S11) all hang. Centralizing network access here is what lets us change all of those in one place;
 * a lint rule (documented in the authoring guide) forbids raw `fetch` in connectors.
 */

/** How a vendor wants its token attached. The three farm vendors all differ — this absorbs that. */
export interface AuthScheme {
  type: "header";
  name: string;
  format: (token: string) => string;
}

export interface HttpRequestSpec {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface ConnectorHttp {
  /** Perform a request; on any failure THROW a normalized ConnectorError. */
  request(spec: HttpRequestSpec): Promise<HttpResponse>;
  /** Iterate a paginated collection as one flat stream, regardless of the vendor's paging style. */
  paginate<T>(spec: HttpRequestSpec, adapter: PaginationAdapter<T>): AsyncIterable<T>;
}

export interface HttpOptions {
  baseUrl: string;
  auth: AuthScheme;
  token: string;
  /** injectable for tests; defaults to global fetch */
  fetchImpl?: typeof fetch;
}

function buildUrl(baseUrl: string, spec: HttpRequestSpec): string {
  const url = new URL(baseUrl + spec.path);
  for (const [k, v] of Object.entries(spec.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Map a raw HTTP outcome onto the closed taxonomy. This is the heart of the SDK. */
function normalize(status: number, retryAfter: string | null, body: unknown): ConnectorError {
  if (status === 429) {
    const secs = retryAfter ? Number(retryAfter) : undefined;
    return new ConnectorError("RateLimited", "vendor rate limited", secs ? secs * 1000 : undefined);
  }
  if (status === 401 || status === 403) return new ConnectorError("AuthFailed", "vendor rejected our credentials");
  if (status >= 500) return new ConnectorError("VendorDown", `vendor error ${status}`);
  if (status >= 400) return new ConnectorError("BadInput", `bad request ${status}`, undefined, body);
  return new ConnectorError("Unknown", `unexpected status ${status}`);
}

export function makeHttp(opts: HttpOptions): ConnectorHttp {
  const fetchImpl = opts.fetchImpl ?? fetch;

  const request = async (spec: HttpRequestSpec): Promise<HttpResponse> => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      [opts.auth.name]: opts.auth.format(opts.token),
      ...spec.headers,
    };
    let res: Response;
    try {
      res = await fetchImpl(buildUrl(opts.baseUrl, spec), {
        method: spec.method,
        headers,
        body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
      });
    } catch (err) {
      // A network-level failure (DNS, connection reset, timeout) is a transient VendorDown.
      throw new ConnectorError("VendorDown", "network error reaching vendor", undefined, err);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      // A 200 with an unparseable body (the farm's malformed-JSON chaos) is NOT success — the vendor
      // promised JSON and broke that promise. Treat it as transient rather than trusting the status.
      throw new ConnectorError("VendorDown", "vendor returned malformed JSON", undefined, err);
    }

    if (res.status >= 400) throw normalize(res.status, res.headers.get("retry-after"), body);
    return { status: res.status, body };
  };

  async function* paginate<T>(spec: HttpRequestSpec, adapter: PaginationAdapter<T>): AsyncIterable<T> {
    let current: HttpRequestSpec | null = spec;
    while (current) {
      const res = await request(current);
      for (const item of adapter.items(res.body)) yield item;
      current = adapter.next(res.body, current);
    }
  }

  return { request, paginate };
}

/**
 * One iterator interface over every vendor's paging style. Each adapter is ~a dozen lines and connector
 * authors never think about pagination again. (See `cursorPaginer` / `pagePaginer` below.)
 */
export interface PaginationAdapter<T> {
  items: (body: unknown) => T[];
  next: (body: unknown, current: HttpRequestSpec) => HttpRequestSpec | null;
}

/** Cursor paging (SheetLite): body has `{ [itemsKey], next_cursor }`; pass the cursor as a query param. */
export function cursorPaginer<T>(opts: {
  itemsKey: string;
  nextCursorKey: string;
  cursorParam: string;
}): PaginationAdapter<T> {
  return {
    items: (body) => ((body as Record<string, unknown>)[opts.itemsKey] as T[]) ?? [],
    next: (body, current) => {
      const cursor = (body as Record<string, unknown>)[opts.nextCursorKey];
      if (cursor === null || cursor === undefined) return null;
      return { ...current, query: { ...current.query, [opts.cursorParam]: String(cursor) } };
    },
  };
}

/** Page-number paging (MailPost): body has `{ [itemsKey], has_more }`; increment `?page`. */
export function pagePaginer<T>(opts: {
  itemsKey: string;
  hasMoreKey: string;
  pageParam: string;
}): PaginationAdapter<T> {
  return {
    items: (body) => ((body as Record<string, unknown>)[opts.itemsKey] as T[]) ?? [],
    next: (body, current) => {
      if (!(body as Record<string, unknown>)[opts.hasMoreKey]) return null;
      const page = Number(current.query?.[opts.pageParam] ?? 1) + 1;
      return { ...current, query: { ...current.query, [opts.pageParam]: page } };
    },
  };
}
