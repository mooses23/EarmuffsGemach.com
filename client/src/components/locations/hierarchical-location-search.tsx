import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Search, Phone, MapPin, ChevronRight, ArrowLeft, Home, Package } from "lucide-react";
import { ContactActions } from "@/components/ui/contact-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLocations, getRegions } from "@/lib/api";
import { useLanguage } from "@/hooks/use-language";
import type { Location, Region } from "@/lib/types";

type CityCategory = {
  id: number;
  name: string;
  slug: string;
  regionId: number;
  displayOrder: number;
  isPopular: boolean;
  description?: string;
  stateCode?: string | null;
};

const US_STATE_NAMES: Record<string, string> = {
  CA: "California",
  NY: "New York",
  NJ: "New Jersey",
  FL: "Florida",
  IL: "Illinois",
  MD: "Maryland",
  MI: "Michigan",
  OH: "Ohio",
  PA: "Pennsylvania"
};

const CA_PROVINCE_NAMES: Record<string, string> = {
  ON: "Ontario",
  QC: "Quebec"
};

const IL_REGION_NAMES: Record<string, string> = {
  JER: "Jerusalem",
  TEL: "Tel Aviv Area",
  CEN: "Central",
  SHA: "Shomron"
};

const UK_REGION_NAMES: Record<string, string> = {
  LON: "London",
  MAN: "Manchester"
};

const AU_STATE_NAMES: Record<string, string> = {
  VIC: "Victoria",
  NSW: "New South Wales"
};

// Threshold for when a state is considered "high-density" and shows community view
const HIGH_DENSITY_THRESHOLD = 3;

export function HierarchicalLocationSearch() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityCategory | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedSubRegion, setSelectedSubRegion] = useState<string | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<CityCategory | null>(null);
  const [showCommunityView, setShowCommunityView] = useState(false);
  const [initialRegionApplied, setInitialRegionApplied] = useState(false);

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    queryFn: () => getLocations(),
  });

  const { data: regions = [] } = useQuery({
    queryKey: ["/api/regions"],
    queryFn: () => getRegions(),
  });

  const { data: cityCategories = [] } = useQuery<CityCategory[]>({
    queryKey: ["/api/city-categories"],
  });

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
          location.address.toLowerCase().includes(query) ||
          location.locationCode.toLowerCase().includes(query) ||
          location.phone.includes(query) ||
          (location.zipCode && location.zipCode.toLowerCase().includes(query)) ||
          region?.name.toLowerCase().includes(query)
        );
      });
    }

    if (selectedRegion) {
      filtered = filtered.filter((location: Location) => location.regionId === selectedRegion.id);
    }

    return filtered;
  }, [locations, searchQuery, regionsMap, selectedRegion]);

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
      const nameA = US_STATE_NAMES[a] || a;
      const nameB = US_STATE_NAMES[b] || b;
      return nameA.localeCompare(nameB);
    });
  }, [selectedRegion, cityCategories]);

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
        names: citiesInRegion.reduce((acc, c) => ({ ...acc, [c.slug]: c.name }), {} as Record<string, string>),
        labelType: "Cities"
      };
    }
    
    return { codes: [], names: {} as Record<string, string>, labelType: "" };
  }, [selectedRegion, cityCategories]);

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
              className="w-full pl-12 pr-4 py-4 md:py-5 text-base md:text-lg rounded-full input-glass placeholder:text-slate-500"
            />
          </div>
        </div>

        {searchQuery ? (
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-slate-400">
                {t("showing")} <span className="font-semibold text-white">{filteredLocations.length}</span> {t("locations")}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-4 md:px-0">
              {filteredLocations.map((location: Location) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  region={regionsMap[location.regionId]}
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
                        {region.name}
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
                              {city.name}
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
          {selectedRegion.name}
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
            placeholder={`${t("searchLocationsIn")} ${selectedRegion.name}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 text-base rounded-full input-glass placeholder:text-slate-500"
          />
        </div>
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
                  {US_STATE_NAMES[selectedState] || selectedState}
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
                    {community.name}
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
                      {US_STATE_NAMES[stateCode] || stateCode}
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
              {t("all")} {subRegions.labelType}
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

      <div className="space-y-8">
        {Object.entries(groupedByCity).map(([citySlug, { city, locations: cityLocations }]) => (
          <div key={citySlug}>
            <div className="flex items-center justify-between mb-6 px-4 md:px-0">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {city.name}
                </h3>
                {city.description && (
                  <p className="text-sm text-slate-400">{city.description}</p>
                )}
              </div>
              <span className="px-3 py-1 text-sm rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {cityLocations.length} {t("locations")}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-4 md:px-0">
              {cityLocations.map((location: Location) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  region={selectedRegion}
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
}

function LocationCard({ location, region }: LocationCardProps) {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
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
    if (target.closest("a") || target.closest("[data-contact-actions]")) return;
    navigate(`/self-deposit?locationId=${location.id}`);
  };

  return (
    <div onClick={handleCardClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/self-deposit?locationId=${location.id}`); }}>
      <div className="glass-card glass-card-hover glass-highlight rounded-2xl cursor-pointer p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="inline-block px-2 py-1 mb-2 text-xs font-mono rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {location.locationCode}
            </span>
            <h3 className="text-lg font-semibold text-white">
              {location.name}
            </h3>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start">
            <MapPin className="h-4 w-4 text-slate-400 mt-1 mr-2 flex-shrink-0" />
            <p className="text-sm text-slate-300">{location.address}</p>
          </div>
          
          <div className="flex items-center">
            <Phone className="h-4 w-4 text-slate-400 mr-2 flex-shrink-0" />
            <a href={`tel:${location.phone?.replace(/[^+\d]/g, "")}`} className="text-sm text-slate-300 hover:text-white transition-colors">{location.phone}</a>
          </div>
          <div data-contact-actions>
            <ContactActions phone={location.phone} locationName={location.name} compact />
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
        </div>
        
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-slate-400">{t("contactLabel")}</span>
              <span className="font-medium text-slate-300 ml-1">{location.contactPerson}</span>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full ${
              location.isActive 
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
            }`}>
              {location.isActive ? t("active") : t("inactive")}
            </span>
          </div>
          
          <div className="mt-2 text-sm">
            <span className="text-slate-400">{t("depositLabel")}</span>
            <span className="font-medium text-white ml-1">${location.depositAmount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
