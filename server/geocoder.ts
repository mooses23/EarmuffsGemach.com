// Task #263: silent server-side geocoding via Nominatim/OpenStreetMap.
// Operators only enter a postal address; we resolve lat/lng best-effort so the
// public "Find nearest to me" feature can sort by haversine distance.
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

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address || typeof address !== "string") return null;
  const key = normalize(address);
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    await acquireSlot();
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`;
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
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(data) ? data[0] : undefined;
    if (!first?.lat || !first?.lon) {
      cache.set(key, null);
      return null;
    }
    const lat = Number(first.lat);
    const lon = Number(first.lon);
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

// One-shot backfill on startup. Rate-limited by the global throttle above.
export async function backfillMissingGeocodes(): Promise<void> {
  try {
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
