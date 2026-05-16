import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, Phone, MapPin, ChevronRight, ArrowLeft, Home, Package, Mail, Star, User, Navigation2, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { ContactActions } from "@/components/ui/contact-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";
import { localizeUSState } from "@/lib/location-names";
import { pickLocalized } from "@/lib/localized-record";
import type { Location, Region } from "@/lib/types";
import { DirectionsButton, formatDistance } from "./directions-button";
import { useCardDensity } from "@/hooks/use-card-density";
import { CardDensityToggle } from "./card-density-toggle";

// Task #263: haversine distance in km between two lat/lng pairs.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

type CityCategory = {
  id: number;
  name: string;
  nameHe?: string | null;
  slug: string;
  regionId: number;
  displayOrder: number;
  isPopular: boolean;
  description?: string;
  descriptionHe?: string | null;
  stateCode?: string | null;
};

// Threshold for when a state is considered "high-density" and shows community view
const HIGH_DENSITY_THRESHOLD = 3;

export function HierarchicalLocationSearch() {
  const { t, language } = useLanguage();
  const [cardDensity, setCardDensity] = useCardDensity();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityCategory | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedSubRegion, setSelectedSubRegion] = useState<string | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<CityCategory | null>(null);
  const [showCommunityView, setShowCommunityView] = useState(false);
  const [initialRegionApplied, setInitialRegionApplied] = useState(false);

  // Task #263: "Find nearest to me" — browser geolocation + client-side
  // haversine sort. Coords never leave the browser. The user's preferred sort
  // mode + last-known coords are persisted in localStorage so the choice
  // survives reloads within the session.
  // Session-scoped persistence with freshness check: coords expire after 30 min
  // so stale locations don't silently reorder the list after long idle periods.
  const NEAREST_STORAGE_KEY = "gemach:nearest";
  const NEAREST_MAX_AGE_MS = 30 * 60 * 1000;
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(NEAREST_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { lat?: number; lon?: number; mode?: string; savedAt?: number };
      if (
        parsed?.mode === "nearest" &&
        typeof parsed?.lat === "number" &&
        typeof parsed?.lon === "number" &&
        typeof parsed?.savedAt === "number" &&
        Date.now() - parsed.savedAt < NEAREST_MAX_AGE_MS
      ) {
        return { lat: parsed.lat, lon: parsed.lon };
      }
      window.sessionStorage.removeItem(NEAREST_STORAGE_KEY);
    } catch {}
    return null;
  });
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (userCoords) {
        window.sessionStorage.setItem(
          NEAREST_STORAGE_KEY,
          JSON.stringify({ mode: "nearest", lat: userCoords.lat, lon: userCoords.lon, savedAt: Date.now() }),
        );
      } else {
        window.sessionStorage.removeItem(NEAREST_STORAGE_KEY);
      }
    } catch {}
  }, [userCoords]);

  const requestNearest = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocError(t("locationPermissionError"));
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setUserCoords(null);
        setLocError(err.code === err.PERMISSION_DENIED ? t("locationPermissionDenied") : t("locationPermissionError"));
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const clearNearest = () => {
    setUserCoords(null);
    setLocError(null);
  };

  const nearestActive = !!userCoords;

  // Single combined fetch — the server returns regions, city categories and
  // sanitised locations in one round-trip. This replaces three separate
  // `/api/regions`, `/api/city-categories` and `/api/locations` requests on
  // landing-page cold starts.
  const { data: tree, isLoading: treeLoading } = useQuery<{
    regions: Region[];
    cityCategories: CityCategory[];
    locations: Location[];
  }>({
    queryKey: ["/api/location-tree"],
    staleTime: 0,
  });

  const locations = tree?.locations ?? [];
  const regions = tree?.regions ?? [];
  const cityCategories = tree?.cityCategories ?? [];
  const isInitialLoading = treeLoading;

  useEffect(() => {
    if (regions.length > 0 && !initialRegionApplied) {
      const params = new URLSearchParams(window.location.search);
      const regionParam = params.get("region");
      
      if (regionParam) {
        const matchingRegion = regions.find((r: Region) => r.slug === regionParam);
        if (matchingRegion) {
          setSelectedRegion(matchingRegion);
        }
      }
      setInitialRegionApplied(true);
    }
  }, [regions, initialRegionApplied]);

  const cityCategoryMap = useMemo(() => {
    return cityCategories.reduce((acc: Record<number, CityCategory>, cat: CityCategory) => {
      acc[cat.id] = cat;
      return acc;
    }, {} as Record<number, CityCategory>);
  }, [cityCategories]);

  const regionsMap = useMemo(() => {
    return regions.reduce((acc: Record<number, Region>, region: Region) => {
      acc[region.id] = region;
      return acc;
    }, {} as Record<number, Region>);
  }, [regions]);

  const filteredLocations = useMemo(() => {
    let filtered = locations;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((location: Location) => {
        const region = regionsMap[location.regionId];
        return (
          location.name.toLowerCase().includes(query) ||
          (location.nameHe && location.nameHe.toLowerCase().includes(query)) ||
          location.address.toLowerCase().includes(query) ||
          (location.addressHe && location.addressHe.toLowerCase().includes(query)) ||
          location.locationCode.toLowerCase().includes(query) ||
          location.phone.includes(query) ||
          (location.zipCode && location.zipCode.toLowerCase().includes(query)) ||
          region?.name.toLowerCase().includes(query) ||
          (region?.nameHe && region.nameHe.toLowerCase().includes(query))
        );
      });
    }

    if (selectedRegion) {
      filtered = filtered.filter((location: Location) => location.regionId === selectedRegion.id);
    }

    return filtered;
  }, [locations, searchQuery, regionsMap, selectedRegion]);

  // Task #263: compute distance + sorted list when "Find nearest" is active.
  // Locations without coordinates sink to the bottom in their original order.
  const distanceMap = useMemo(() => {
    if (!userCoords) return new Map<number, number>();
    const m = new Map<number, number>();
    for (const loc of locations) {
      const anyLoc = loc as Location & { latitude?: number | null; longitude?: number | null };
      if (typeof anyLoc.latitude === "number" && typeof anyLoc.longitude === "number") {
        m.set(loc.id, haversineKm(userCoords.lat, userCoords.lon, anyLoc.latitude, anyLoc.longitude));
      }
    }
    return m;
  }, [userCoords, locations]);

  const sortedByDistance = useMemo(() => {
    if (!userCoords) return [] as Location[];
    const withCoords: Location[] = [];
    const withoutCoords: Location[] = [];
    for (const loc of filteredLocations) {
      if (distanceMap.has(loc.id)) withCoords.push(loc);
      else withoutCoords.push(loc);
    }
    withCoords.sort((a, b) => (distanceMap.get(a.id) ?? Infinity) - (distanceMap.get(b.id) ?? Infinity));
    return [...withCoords, ...withoutCoords];
  }, [userCoords, filteredLocations, distanceMap]);

  const usStates = useMemo(() => {
    if (!selectedRegion || selectedRegion.slug !== "united-states") return [];
    
    const citiesInRegion = cityCategories.filter((city: CityCategory) => city.regionId === selectedRegion.id);
    const statesSet = new Set<string>();
    
    citiesInRegion.forEach((city: CityCategory) => {
      if (city.stateCode) {
        statesSet.add(city.stateCode);
      }
    });
    
    return Array.from(statesSet).sort((a, b) => {
      const nameA = localizeUSState(language, a);
      const nameB = localizeUSState(language, b);
      return nameA.localeCompare(nameB);
    });
  }, [selectedRegion, cityCategories, language]);

  // Get communities (cityCategories) within selected state with location counts
  const stateCommunitiesWithCounts = useMemo(() => {
    if (!selectedState || !selectedRegion) return [];
    
    const communitiesInState = cityCategories.filter(
      (city: CityCategory) => city.regionId === selectedRegion.id && city.stateCode === selectedState
    );
    
    // Add location counts for each community
    return communitiesInState.map(community => {
      const locationCount = locations.filter(
        (loc: Location) => loc.cityCategoryId === community.id
      ).length;
      return { ...community, locationCount };
    }).filter(c => c.locationCount > 0) // Only show communities with locations
      .sort((a, b) => b.locationCount - a.locationCount); // Sort by location count desc
  }, [selectedState, selectedRegion, cityCategories, locations]);

  // Determine if current state is high-density (should show community bubbles)
  const isHighDensityState = useMemo(() => {
    return stateCommunitiesWithCounts.length >= HIGH_DENSITY_THRESHOLD;
  }, [stateCommunitiesWithCounts]);

  const subRegions = useMemo(() => {
    if (!selectedRegion) return { codes: [], names: {} as Record<string, string>, labelType: "" };
    
    const citiesInRegion = cityCategories.filter((city: CityCategory) => city.regionId === selectedRegion.id);
    
    if (selectedRegion.slug !== "united-states" && citiesInRegion.length > 0) {
      return {
        codes: citiesInRegion.map(c => c.slug),
        names: citiesInRegion.reduce((acc, c) => ({ ...acc, [c.slug]: pickLocalized(c, "name", language) }), {} as Record<string, string>),
        labelType: "Cities"
      };
    }
    
    return { codes: [], names: {} as Record<string, string>, labelType: "" };
  }, [selectedRegion, cityCategories, language]);

  const groupedByCity = useMemo(() => {
    if (!selectedRegion) return {};
    
    let citiesInRegion = cityCategories.filter((city: CityCategory) => city.regionId === selectedRegion.id);
    
    if (selectedRegion.slug === "united-states" && selectedState) {
      citiesInRegion = citiesInRegion.filter((city: CityCategory) => city.stateCode === selectedState);
      
      // If community is selected, filter to just that community
      if (selectedCommunity) {
        citiesInRegion = citiesInRegion.filter((city: CityCategory) => city.id === selectedCommunity.id);
      }
    }
    
    if (selectedRegion.slug !== "united-states" && selectedSubRegion) {
      citiesInRegion = citiesInRegion.filter((city: CityCategory) => city.slug === selectedSubRegion);
    }
    
    const result: Record<string, { city: CityCategory; locations: Location[] }> = {};

    citiesInRegion.forEach((city: CityCategory) => {
      const cityLocations = filteredLocations.filter((location: Location) => 
        location.cityCategoryId === city.id
      );
      
      if (cityLocations.length > 0) {
        result[city.slug] = { city, locations: cityLocations };
      }
    });

    return result;
  }, [selectedRegion, cityCategories, filteredLocations, selectedState, selectedSubRegion, selectedCommunity]);

  if (!selectedRegion) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 md:mb-8 px-4 md:px-0">
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-14 py-4 md:py-5 text-base md:text-lg rounded-full input-glass placeholder:text-slate-300/80"
            />
            {/* Task #268: small pin icon inside the search bar replaces the
                large "Find nearest to me" pill. Click toggles geolocation sort. */}
            <button
              type="button"
              onClick={nearestActive ? clearNearest : requestNearest}
              disabled={locating}
              aria-label={nearestActive ? t("clearNearest") : t("findNearestToMe")}
              aria-pressed={nearestActive}
              title={nearestActive ? t("sortedByDistance") : t("findNearestToMe")}
              className={`absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full transition-colors disabled:opacity-60 ${
                nearestActive
                  ? "bg-blue-500/30 text-blue-100 border border-blue-400/40 hover:bg-blue-500/40"
                  : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white"
              }`}
              data-testid="button-find-nearest"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="h-4 w-4" />
              )}
            </button>
          </div>
          {(nearestActive || locError) && (
            <div className="max-w-2xl mx-auto mt-2 flex flex-col items-center gap-1">
              {nearestActive && (
                <div className="inline-flex items-center gap-2 text-xs text-blue-200">
                  <Navigation2 className="h-3 w-3" />
                  <span>{t("sortedByDistance")}</span>
                  <button
                    type="button"
                    onClick={clearNearest}
                    className="inline-flex items-center gap-0.5 text-blue-300 hover:text-white"
                    data-testid="button-clear-nearest"
                  >
                    <X className="h-3 w-3" />
                    {t("clearNearest")}
                  </button>
                </div>
              )}
              {locError && (
                <p className="text-xs text-red-300" data-testid="text-location-error">{locError}</p>
              )}
            </div>
          )}
        </div>

        {isInitialLoading ? (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <div className="h-9 md:h-10 w-72 mx-auto rounded-lg bg-white/10 animate-pulse mb-4" />
              <div className="h-5 w-56 mx-auto rounded bg-white/5 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 md:px-0">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="glass-card glass-highlight rounded-2xl p-6 animate-pulse"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="h-6 w-32 rounded bg-white/10" />
                    <div className="h-5 w-5 rounded bg-white/10" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 w-40 rounded bg-white/5" />
                    <div className="flex gap-2">
                      <div className="h-6 w-16 rounded-full bg-white/5" />
                      <div className="h-6 w-20 rounded-full bg-white/5" />
                      <div className="h-6 w-14 rounded-full bg-white/5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : nearestActive ? (
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-slate-400">
                {t("showing")} <span className="font-semibold text-white">{sortedByDistance.length}</span> {t("locations")}
              </p>
            </div>
            <div className="flex justify-start px-4 md:px-0 opacity-60 hover:opacity-90 transition-opacity">
              <CardDensityToggle density={cardDensity} onChange={setCardDensity} variant="dark" className="scale-[0.85] origin-left" />
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 px-4 md:px-0 ${cardDensity === "compact" ? "gap-2 md:gap-3" : "gap-4 md:gap-6"}`}>
              {sortedByDistance.map((location: Location) => (
                <LocationCard
                  key={location.id}
                  location={location}
                  region={regionsMap[location.regionId]}
                  distanceKm={distanceMap.get(location.id) ?? null}
                  density={cardDensity}
                />
              ))}
            </div>
          </div>
        ) : searchQuery ? (
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-slate-400">
                {t("showing")} <span className="font-semibold text-white">{filteredLocations.length}</span> {t("locations")}
              </p>
            </div>
            <div className="flex justify-start px-4 md:px-0 opacity-60 hover:opacity-90 transition-opacity">
              <CardDensityToggle density={cardDensity} onChange={setCardDensity} variant="dark" className="scale-[0.85] origin-left" />
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 px-4 md:px-0 ${cardDensity === "compact" ? "gap-2 md:gap-3" : "gap-4 md:gap-6"}`}>
              {filteredLocations.map((location: Location) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  region={regionsMap[location.regionId]}
                  density={cardDensity}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                {t("chooseYourContinent")}
              </h2>
              <p className="text-slate-400">
                {t("selectContinentBrowse")}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4 md:px-0">
              {regions.map((region: Region) => {
                const regionLocations = locations.filter((l: Location) => l.regionId === region.id);
                const regionCities = cityCategories.filter((c: CityCategory) => c.regionId === region.id);
                
                return (
                  <div 
                    key={region.id} 
                    className="glass-card glass-card-hover glass-highlight rounded-2xl cursor-pointer p-6"
                    onClick={() => setSelectedRegion(region)}
                    data-region={region.slug}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-white">
                        {pickLocalized(region, "name", language)}
                      </h3>
                      <ChevronRight className="h-5 w-5 text-slate-300" />
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-sm text-slate-200">
                        {regionLocations.length} {t("locationsAvailable")}
                      </p>
                      {regionCities.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {regionCities.slice(0, 3).map(city => (
                            <span key={city.id} className="px-2 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {pickLocalized(city, "name", language)}
                            </span>
                          ))}
                          {regionCities.length > 3 && (
                            <span className="px-2 py-1 text-xs rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              +{regionCities.length - 3} {t("more")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 px-4 md:px-0">
        <div className="flex items-center gap-2 mb-4">
          <button 
            onClick={() => { 
              setSelectedRegion(null); 
              setSelectedState(null); 
              setSelectedSubRegion(null);
              setSelectedCommunity(null);
              setShowCommunityView(false);
            }}
            className="btn-glass-outline px-4 py-2 rounded-xl flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backToContinents")}
          </button>
          <button 
            onClick={() => window.location.href = '/'}
            className="btn-glass-outline px-4 py-2 rounded-xl flex items-center gap-2 text-sm"
          >
            <Home className="h-4 w-4" />
            {t("home")}
          </button>
        </div>
        
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
          {pickLocalized(selectedRegion, "name", language)}
        </h2>
        <p className="text-slate-400">
          {t("choosePopularCity")}
        </p>
      </div>

      <div className="mb-6 px-4 md:px-0">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
          <input
            type="text"
            placeholder={`${t("searchLocationsIn")} ${pickLocalized(selectedRegion, "name", language)}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-14 py-4 text-base rounded-full input-glass placeholder:text-slate-300/80"
          />
          {/* Task #268: same pin toggle as the continent landing bar. */}
          <button
            type="button"
            onClick={nearestActive ? clearNearest : requestNearest}
            disabled={locating}
            aria-label={nearestActive ? t("clearNearest") : t("findNearestToMe")}
            aria-pressed={nearestActive}
            title={nearestActive ? t("sortedByDistance") : t("findNearestToMe")}
            className={`absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full transition-colors disabled:opacity-60 ${
              nearestActive
                ? "bg-blue-500/30 text-blue-100 border border-blue-400/40 hover:bg-blue-500/40"
                : "bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white"
            }`}
            data-testid="button-find-nearest-region"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </button>
        </div>
        {(nearestActive || locError) && (
          <div className="max-w-2xl mx-auto mt-2 flex flex-col items-center gap-1">
            {nearestActive && (
              <div className="inline-flex items-center gap-2 text-xs text-blue-200">
                <Navigation2 className="h-3 w-3" />
                <span>{t("sortedByDistance")}</span>
                <button
                  type="button"
                  onClick={clearNearest}
                  className="inline-flex items-center gap-0.5 text-blue-300 hover:text-white"
                  data-testid="button-clear-nearest-region"
                >
                  <X className="h-3 w-3" />
                  {t("clearNearest")}
                </button>
              </div>
            )}
            {locError && (
              <p className="text-xs text-red-300" data-testid="text-location-error-region">{locError}</p>
            )}
          </div>
        )}
      </div>

      {selectedRegion.slug === "united-states" && usStates.length > 0 && (
        <div className="mb-8 px-4 md:px-0">
          <div className="flex flex-wrap justify-center gap-2 transition-all duration-300">
            {/* When community view is active for high-density state, show community bubbles */}
            {showCommunityView && selectedState && isHighDensityState ? (
              <>
                {/* Back to States button */}
                <button
                  onClick={() => {
                    setShowCommunityView(false);
                    setSelectedCommunity(null);
                  }}
                  className="px-4 py-2 rounded-full text-sm font-medium btn-glass-outline flex items-center gap-2"
                >
                  <ArrowLeft className="h-3 w-3" />
                  {localizeUSState(language, selectedState)}
                </button>
                
                {/* All Communities in this state button */}
                <button
                  onClick={() => setSelectedCommunity(null)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedCommunity === null
                      ? "btn-glass-amber"
                      : "btn-glass-outline"
                  }`}
                >
                  {t("all")} {t("communities")}
                </button>
                
                {/* Community bubbles */}
                {stateCommunitiesWithCounts.map((community) => (
                  <button
                    key={community.id}
                    onClick={() => setSelectedCommunity(community)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      selectedCommunity?.id === community.id
                        ? "btn-glass-amber"
                        : "btn-glass-outline"
                    }`}
                  >
                    {pickLocalized(community, "name", language)}
                    <span className="ml-1 text-xs opacity-75">({community.locationCount})</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                {/* Normal state view */}
                <button
                  onClick={() => {
                    setSelectedState(null);
                    setShowCommunityView(false);
                    setSelectedCommunity(null);
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    selectedState === null
                      ? "btn-glass-amber"
                      : "btn-glass-outline"
                  }`}
                >
                  {t("allStates")}
                </button>
                {usStates.map((stateCode) => {
                  // Check if this state is high-density
                  const communitiesInThisState = cityCategories.filter(
                    (c: CityCategory) => c.regionId === selectedRegion.id && c.stateCode === stateCode
                  );
                  const communitiesWithLocations = communitiesInThisState.filter(c => 
                    locations.some((loc: Location) => loc.cityCategoryId === c.id)
                  );
                  const isThisStateHighDensity = communitiesWithLocations.length >= HIGH_DENSITY_THRESHOLD;
                  
                  return (
                    <button
                      key={stateCode}
                      onClick={() => {
                        setSelectedState(stateCode);
                        setSelectedCommunity(null);
                        // Auto-show community view for high-density states
                        if (isThisStateHighDensity) {
                          setShowCommunityView(true);
                        } else {
                          setShowCommunityView(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        selectedState === stateCode && !showCommunityView
                          ? "btn-glass-amber"
                          : "btn-glass-outline"
                      }`}
                    >
                      {localizeUSState(language, stateCode)}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {selectedRegion.slug !== "united-states" && subRegions.codes.length > 1 && (
        <div className="mb-8 px-4 md:px-0">
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setSelectedSubRegion(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                selectedSubRegion === null
                  ? "btn-glass-primary"
                  : "btn-glass-outline"
              }`}
            >
              {t("all")} {t("cities")}
            </button>
            {subRegions.codes.map((code) => (
              <button
                key={code}
                onClick={() => setSelectedSubRegion(code)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedSubRegion === code
                    ? "btn-glass-primary"
                    : "btn-glass-outline"
                }`}
              >
                {subRegions.names[code] || code}
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.keys(groupedByCity).length > 0 && (
        <div className="flex justify-start px-4 md:px-0 mb-4 opacity-60 hover:opacity-90 transition-opacity">
          <CardDensityToggle density={cardDensity} onChange={setCardDensity} variant="dark" className="scale-[0.85] origin-left" />
        </div>
      )}

      <div className="space-y-8">
        {Object.entries(groupedByCity).map(([citySlug, { city, locations: cityLocations }]) => (
          <div key={citySlug}>
            <div className="flex items-center justify-between mb-6 px-4 md:px-0">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {pickLocalized(city, "name", language)}
                </h3>
                {(city.description || city.descriptionHe) && (
                  <p className="text-sm text-slate-400">{pickLocalized(city, "description", language)}</p>
                )}
              </div>
              <span className="px-3 py-1 text-sm rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {cityLocations.length} {t("locations")}
              </span>
            </div>
            
            <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 px-4 md:px-0 ${cardDensity === "compact" ? "gap-2 md:gap-3" : "gap-4 md:gap-6"}`}>
              {cityLocations.map((location: Location) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  region={selectedRegion}
                  density={cardDensity}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(groupedByCity).length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-500 mb-4">
            <Search className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-slate-300 mb-2">
            {t("noLocationsFound")}
          </h3>
          <p className="text-slate-500">
            {t("tryAdjustingSearch")}
          </p>
        </div>
      )}
    </div>
  );
}

const COLOR_SWATCHES: Record<string, string> = {
  red: "#EF4444",
  blue: "#3B82F6",
  black: "#1F2937",
  white: "#F9FAFB",
  pink: "#EC4899",
  purple: "#8B5CF6",
  green: "#22C55E",
  orange: "#F97316",
  yellow: "#EAB308",
  gray: "#6B7280",
};

function InventoryCircle({ color, quantity }: { color: string; quantity: number }) {
  const bgColor = COLOR_SWATCHES[color] || "#9CA3AF";
  const isLight = color === "white" || color === "yellow";
  
  return (
    <div 
      className="relative w-6 h-6 rounded-full flex items-center justify-center"
      style={{ 
        backgroundColor: bgColor,
        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)`,
        border: isLight ? '1px solid #d1d5db' : 'none'
      }}
      title={`${color}: ${quantity}`}
    >
      <span 
        className={`text-[9px] font-bold ${isLight ? 'text-gray-700' : 'text-white'}`}
        style={{ textShadow: isLight ? 'none' : '0 1px 1px rgba(0,0,0,0.3)' }}
      >
        {quantity}
      </span>
    </div>
  );
}

interface LocationCardProps {
  location: Location;
  region: Region;
  distanceKm?: number | null;
  density?: "compact" | "full";
}

function LocationCard({ location, region, distanceKm, density = "full" }: LocationCardProps) {
  const { t, language } = useLanguage();
  const [, navigate] = useLocation();
  const [locallyExpanded, setLocallyExpanded] = useState(false);
  const isCompact = density === "compact" && !locallyExpanded;
  const locName = pickLocalized(location, "name", language);
  const locAddress = pickLocalized(location, "address", language);
  const locContact = pickLocalized(location, "contactPerson", language);
  // Task #271: short city/region label so geography stays visible in compact mode.
  const regionName = region ? pickLocalized(region, "name", language) : "";
  const cityRegionLabel = [location.city, regionName].filter(Boolean).join(", ");
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery<{ inventory: { color: string; quantity: number }[]; total: number }>({
    queryKey: ["/api/locations", location.id, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${location.id}/inventory`);
      if (!res.ok) return { inventory: [], total: 0 };
      return res.json();
    },
    staleTime: 60_000,
  });

  const inventory = inventoryData?.inventory?.filter(item => item.quantity > 0) || [];

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("[data-contact-actions]") || target.closest("[data-expand-toggle]")) return;
    navigate(`/self-deposit?locationId=${location.id}`);
  };

  const showExpanded = density === "full" || locallyExpanded;

  return (
    <div onClick={handleCardClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/self-deposit?locationId=${location.id}`); }}>
      <div className={`glass-card glass-card-hover glass-highlight rounded-2xl cursor-pointer ${density === "compact" ? "p-3" : "p-6"}`}>

        {/* Always-visible header */}
        <div className={`flex items-start justify-between gap-2 ${density === "compact" ? "mb-2" : "mb-4"}`}>
          <div className="min-w-0">
            <span className={`inline-block font-mono rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 ${density === "compact" ? "px-1.5 py-0.5 mb-1 text-[10px]" : "px-2 py-1 mb-2 text-xs"}`}>
              {location.locationCode}
            </span>
            <h3 className={`${density === "compact" ? "text-sm" : "text-lg"} font-semibold text-white truncate`}>
              {locName}
            </h3>
            {density === "compact" && cityRegionLabel && (
              <p className="text-xs text-slate-400 mt-0.5 truncate" data-testid={`text-city-region-${location.id}`}>
                {cityRegionLabel}
              </p>
            )}
            {typeof distanceKm === "number" && Number.isFinite(distanceKm) && (
              <p className="text-xs text-blue-300 font-medium mt-1" data-testid={`text-distance-${location.id}`}>
                {formatDistance(distanceKm, language, t)}
              </p>
            )}
          </div>
          <DirectionsButton address={locAddress} variant="dark" hasCoords={location.latitude != null && location.longitude != null} />
        </div>

        {/* Always-visible: phone + contact person */}
        <div className={density === "compact" ? "space-y-1.5" : "space-y-3"}>
          {location.phone && (
            <div className="flex items-center">
              <Phone className={`h-4 w-4 mr-2 flex-shrink-0 ${location.contactPreference === "phone" || location.contactPreference === "whatsapp" ? "text-blue-400" : "text-slate-400"}`} />
              <a href={`tel:${location.phone.replace(/[^+\d]/g, "")}`} className="text-sm text-slate-300 hover:text-white transition-colors">{location.phone}</a>
            </div>
          )}
          {locContact && (
            <div className="flex items-center">
              <User className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
              <span className="text-sm text-slate-300 truncate">{locContact}</span>
            </div>
          )}
        </div>

        {/* Animated expanded content */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${showExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="space-y-3 pt-3">
              <div className="flex items-start">
                <MapPin className="h-4 w-4 text-slate-400 mt-1 mr-2 flex-shrink-0" />
                <p className="text-sm text-slate-300 break-words" data-testid={`text-location-address-${location.id}`}>{locAddress}</p>
              </div>
              {location.phone && (location.contactPreference === "phone" || location.contactPreference === "whatsapp") && (
                <p className="ml-6 text-xs text-blue-400 font-medium flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-current" /> {t("preferred")}
                </p>
              )}
              {location.email && (
                <div className="flex items-start">
                  <Mail className={`h-4 w-4 mr-2 mt-1 flex-shrink-0 ${location.contactPreference === "email" ? "text-blue-400" : "text-slate-400"}`} />
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1 min-w-0">
                    <a href={`mailto:${location.email}`} className="text-sm text-slate-300 hover:text-white transition-colors break-all" data-testid={`link-location-email-${location.id}`}>
                      {location.email}
                    </a>
                    {location.contactPreference === "email" && (
                      <span className="text-xs text-blue-400 font-medium flex items-center gap-0.5 flex-shrink-0 self-start mt-0.5">
                        <Star className="w-3 h-3 fill-current" /> {t("preferred")}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div data-contact-actions>
                <ContactActions phone={location.phone} locationName={locName} compact />
              </div>
              <div className="flex items-center min-h-[28px]">
                <Package className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
                {inventoryLoading ? (
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-6 h-6 rounded-full bg-white/10 animate-pulse" />
                    ))}
                  </div>
                ) : inventory.length > 0 ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {inventory.map(item => (
                      <InventoryCircle key={item.color} color={item.color} quantity={item.quantity} />
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">{t("noStockInfo")}</span>
                )}
              </div>
              <div className="pt-1 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-slate-400">{t("depositLabel")}</span>
                    <span className="font-medium text-white ml-1">${location.depositAmount}</span>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${location.isActive ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-slate-500/20 text-slate-400 border border-slate-500/30"}`}>
                    {location.isActive ? t("active") : t("inactive")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expand / collapse — compact density only */}
        {density === "compact" && (
          <div className="mt-2 pt-2 border-t border-white/10" data-expand-toggle>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLocallyExpanded(v => !v); }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors w-full justify-center"
            >
              {locallyExpanded ? (
                <><ChevronUp className="w-3.5 h-3.5" /><span>Show less</span></>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /><span>Show more</span></>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
