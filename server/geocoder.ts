// Task #263 + #268: silent server-side geocoding via Nominatim/OpenStreetMap.
// Operators only enter a postal address; we resolve lat/lng best-effort so the
// public "Find nearest to me" feature can sort by haversine distance.
//
// Task #268: only persist coordinates when Nominatim returns a street-level
// match (house_number present, or a building-class result). Area-level matches
// like "Miami Beach, FL" or "Detroit, MI" are dropped on the floor so the
// public "Directions" button stays hidden — area coords led people to the
// wrong place.
//
// Notes:
//  - Nominatim usage policy: <= 1 req/sec, must set a descriptive User-Agent.
//  - Never throw to caller — geocoding failures must not break create/update.
//  - In-process result cache (address -> coords) to avoid re-hitting the API
//    when an admin saves a row without changing the address.

import { storage } from "./storage";

interface GeocodeResult {
  latitude: number;
  longitude: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "BabyBanzEarmuffsGemach/1.0 (admin@earmuffsgemach.com)";
const MIN_INTERVAL_MS = 1100; // be polite — slightly over 1 req/sec

// Nominatim address-result categories we consider "precise enough" for
// turn-by-turn directions even when house_number is absent (e.g. a named
// building/amenity). Anything else (city, town, suburb, county, state,
// neighbourhood, etc.) is treated as area-level and discarded.
const PRECISE_ADDRESS_TYPES = new Set([
  "house", "building", "amenity", "shop", "office",
  "school", "hospital", "place_of_worship", "synagogue",
]);
const PRECISE_CLASSES = new Set([
  "building", "amenity", "shop", "office",
]);

const cache = new Map<string, GeocodeResult | null>();
let lastRequestAt = 0;
// Serialize all outbound requests so concurrent callers cannot overlap inside
// the 1 req/sec window. Each new request chains onto the tail of this promise.
let requestQueue: Promise<void> = Promise.resolve();

function normalize(address: string): string {
  return address.trim().replace(/\s+/g, " ").toLowerCase();
}

async function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// Acquire a serialized slot honoring the >=1.1s gap between requests.
async function acquireSlot(): Promise<void> {
  const myTurn = requestQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_INTERVAL_MS) {
      await wait(MIN_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
  });
  // Swallow errors so a single failure doesn't poison the chain.
  requestQueue = myTurn.catch(() => undefined);
  return myTurn;
}

interface NominatimRow {
  lat?: string;
  lon?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  address?: {
    house_number?: string;
    [k: string]: unknown;
  };
}

function isPrecise(row: NominatimRow): boolean {
  if (row.address?.house_number) return true;
  const at = row.addresstype?.toLowerCase();
  if (at && PRECISE_ADDRESS_TYPES.has(at)) return true;
  const cls = row.class?.toLowerCase();
  if (cls && PRECISE_CLASSES.has(cls)) return true;
  return false;
}

// Clear the in-process cache entry for a given address. Used when an admin
// triggers a re-geocode and we want to force a fresh hit on Nominatim.
export function clearGeocodeCacheForAddress(address: string): void {
  if (!address || typeof address !== "string") return;
  cache.delete(normalize(address));
}

export async function geocodeAddress(
  address: string,
  options: { force?: boolean } = {},
): Promise<GeocodeResult | null> {
  if (!address || typeof address !== "string") return null;
  const key = normalize(address);
  if (options.force) {
    cache.delete(key);
  } else if (cache.has(key)) {
    return cache.get(key) ?? null;
  }

  try {
    await acquireSlot();
    // Task #268: ask for several candidates and pick the first street-level
    // one. Nominatim's top hit for "123 Main St, Brooklyn" is often the
    // city-level result, with the actual street lower in the list.
    const url = `${NOMINATIM_URL}?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(address)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const data = (await res.json()) as NominatimRow[];
    const candidates = Array.isArray(data) ? data : [];
    const precise = candidates.find((row) => row?.lat && row?.lon && isPrecise(row));
    if (!precise) {
      // No street-level match in the top results — keep coords unset so the
      // public "Directions" button stays hidden for this gemach.
      cache.set(key, null);
      return null;
    }
    const lat = Number(precise.lat);
    const lon = Number(precise.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      cache.set(key, null);
      return null;
    }
    const result = { latitude: lat, longitude: lon };
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn(`[geocoder] failed for "${address}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// Fire-and-forget geocode + persist. Called from create/update location paths
// when the address changes.
export function geocodeAndStore(locationId: number, address: string): void {
  void (async () => {
    const coords = await geocodeAddress(address);
    if (!coords) return;
    try {
      await storage.updateLocation(locationId, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        geocodedAt: new Date(),
      });
    } catch (err) {
      console.warn(`[geocoder] failed to persist coords for location ${locationId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
}

const STRICT_FLAG_KEY = "geocoder.strictRevalidationDoneAt";

// Task #268: one-time pass on startup. Clears coordinates on every existing
// location whose address is obviously area-level (doesn't start with a street
// number), and re-runs the regular backfill so the strict precision filter in
// geocodeAddress() re-evaluates them. Gated by a global_settings flag so it
// only happens once per environment.
async function clearLegacyImpreciseCoords(): Promise<number> {
  const all = await storage.getAllLocations();
  // Heuristic: a real street address starts with a house-number token
  // (e.g. "1234 Main St"). Anything that begins with letters
  // ("Pico Area, …", "Detroit, MI", "Western Run Drive, …") is treated as
  // area-level and gets its stale coords cleared.
  const streetNumberRe = /^\s*\d+\s/;
  let cleared = 0;
  for (const loc of all) {
    if (loc.latitude == null || loc.longitude == null) continue;
    if (streetNumberRe.test(loc.address || "")) continue;
    try {
      await storage.updateLocation(loc.id, {
        latitude: null,
        longitude: null,
        geocodedAt: null,
      });
      cleared += 1;
    } catch (err) {
      console.warn(`[geocoder] failed to clear stale coords for ${loc.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return cleared;
}

// One-shot backfill on startup. Rate-limited by the global throttle above.
export async function backfillMissingGeocodes(): Promise<void> {
  try {
    // Task #268: first-run strict revalidation — clear stale area-level
    // coords once, then let the precision-filtered backfill repopulate.
    try {
      const flag = await storage.getGlobalSetting(STRICT_FLAG_KEY);
      if (!flag?.value) {
        // Claim the flag *before* running the expensive pass so a concurrent
        // startup on another instance skips it. If the pass fails partway,
        // an admin can clear the flag in global_settings to re-run.
        await storage.setGlobalSetting(STRICT_FLAG_KEY, new Date().toISOString());
        const cleared = await clearLegacyImpreciseCoords();
        if (cleared > 0) {
          console.log(`[geocoder] strict revalidation: cleared ${cleared} area-level coordinate(s).`);
        }
      }
    } catch (err) {
      console.warn(`[geocoder] strict revalidation skipped: ${err instanceof Error ? err.message : String(err)}`);
    }

    const all = await storage.getAllLocations();
    const missing = all.filter((l) => l.latitude == null && l.address && l.address.trim().length > 0);
    if (missing.length === 0) return;
    console.log(`[geocoder] backfilling ${missing.length} location(s) missing coordinates…`);
    let ok = 0;
    for (const loc of missing) {
      const coords = await geocodeAddress(loc.address);
      if (!coords) continue;
      try {
        await storage.updateLocation(loc.id, {
          latitude: coords.latitude,
          longitude: coords.longitude,
          geocodedAt: new Date(),
        });
        ok += 1;
      } catch (err) {
        console.warn(`[geocoder] backfill persist failed for ${loc.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.log(`[geocoder] backfill complete: ${ok}/${missing.length} succeeded.`);
  } catch (err) {
    console.warn(`[geocoder] backfill aborted: ${err instanceof Error ? err.message : String(err)}`);
  }
}
