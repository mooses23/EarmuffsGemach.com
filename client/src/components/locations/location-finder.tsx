import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLocations, getRegions } from "@/lib/api";
import { Region, Location } from "@/lib/types";
import { LocationCard } from "./location-card";
import { RegionTabs } from "./region-tabs";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useCardDensity } from "@/hooks/use-card-density";
import { CardDensityToggle } from "./card-density-toggle";
interface LocationFinderProps {
  initialRegion?: string;
}

export function LocationFinder({ initialRegion = "united-states" }: LocationFinderProps) {
  const [activeRegion, setActiveRegion] = useState(initialRegion);
  const [searchTerm, setSearchTerm] = useState("");
  const [cardDensity, setCardDensity] = useCardDensity();
  
  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  // When initialRegion prop changes, update the active region
  useEffect(() => {
    if (initialRegion) {
      setActiveRegion(initialRegion);
    }
  }, [initialRegion]);

  // Filter locations by active region and search term
  const filteredLocations = locations.filter(location => {
    const matchesRegion = regions.find(r => r.slug === activeRegion)?.id === location.regionId;
    
    if (!matchesRegion) return false;
    
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      location.name.toLowerCase().includes(searchLower) ||
      (location.nameHe && location.nameHe.toLowerCase().includes(searchLower)) ||
      location.address.toLowerCase().includes(searchLower) ||
      (location.addressHe && location.addressHe.toLowerCase().includes(searchLower)) ||
      location.contactPerson.toLowerCase().includes(searchLower) ||
      (location.contactPersonHe && location.contactPersonHe.toLowerCase().includes(searchLower))
    );
  });

  return (
    <section id="find-gemach" className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-neutral-800 mb-4">Find a Location Near You</h2>
          <p className="text-lg text-neutral-600 max-w-3xl mx-auto">
            Browse our worldwide network of Baby Banz Earmuffs locations
          </p>
        </div>
        
        {/* Region Tabs */}
        <RegionTabs 
          regions={regions} 
          activeRegion={activeRegion} 
          setActiveRegion={setActiveRegion} 
        />
        
        {/* Search Box */}
        <div className="max-w-md mx-auto mb-8">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search by city, zip code, or location name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
            />
            <Search className="absolute right-3 top-3 text-neutral-500 h-5 w-5" />
          </div>
        </div>
        
        {/* Density toggle */}
        {filteredLocations.length > 0 && (
          <div className="max-w-6xl mx-auto mb-4 flex justify-center md:justify-end">
            <CardDensityToggle density={cardDensity} onChange={setCardDensity} variant="light" />
          </div>
        )}

        {/* Locations Grid */}
        <div id="locations-results">
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${cardDensity === "compact" ? "gap-3" : "gap-6"}`}>
            {filteredLocations.length > 0 ? (
              filteredLocations.map((location, index) => (
                <LocationCard key={location.id} location={location} locationNumber={index + 1} density={cardDensity} />
              ))
            ) : (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 py-8 text-center">
                <p className="text-lg text-neutral-600">
                  {searchTerm 
                    ? "No locations found matching your search. Please try a different search term." 
                    : "No locations found in this region yet."}
                </p>
              </div>
            )}
          </div>
          
          {filteredLocations.length > 9 && (
            <div className="col-span-1 md:col-span-2 lg:col-span-3 mt-8 text-center">
              <button className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-primary hover:text-primary-dark">
                View more locations
                <svg xmlns="http://www.w3.org/2000/svg" className="ml-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
