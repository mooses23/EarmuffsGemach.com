import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Phone, Mail, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLocations, getRegions } from "@/lib/api";
import type { Location, Region } from "@/lib/types";
import { useLanguage } from "@/hooks/use-language";
import { pickLocalized } from "@/lib/localized-record";

export function LocationSearch() {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations", language],
    queryFn: () => getLocations(),
  });

  const { data: regions = [] } = useQuery({
    queryKey: ["/api/regions", language],
    queryFn: () => getRegions(),
  });

  const regionsMap = useMemo(() => {
    return regions.reduce((acc: Record<number, Region>, region: Region) => {
      acc[region.id] = region;
      return acc;
    }, {} as Record<number, Region>);
  }, [regions]);

  const filteredLocations = useMemo(() => {
    if (!searchQuery.trim()) return locations;
    
    const query = searchQuery.toLowerCase();
    return locations.filter((location: Location) => {
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
  }, [locations, searchQuery, regionsMap]);

  const groupedLocations = useMemo(() => {
    return filteredLocations.reduce((acc: Record<string, Location[]>, location: Location) => {
      const region = regionsMap[location.regionId];
      if (!region) return acc;
      
      const regionLabel = pickLocalized(region as any, "name", language);
      if (!acc[regionLabel]) {
        acc[regionLabel] = [];
      }
      acc[regionLabel].push(location);
      return acc;
    }, {} as Record<string, Location[]>);
  }, [filteredLocations, regionsMap]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Search Bar */}
      <div className="mb-6 md:mb-8 px-4 md:px-0">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <Input
            type="text"
            placeholder="Search by zip code, city, or location code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-4 py-4 md:py-6 text-base md:text-lg rounded-full border-2 border-gray-200 focus:border-blue-500 shadow-lg w-full touch-manipulation"
          />
        </div>
      </div>

      {/* Results count */}
      <div className="text-center mb-8">
        <p className="text-gray-600">
          Showing <span className="font-semibold">{filteredLocations.length}</span> locations
        </p>
      </div>

      {/* Results */}
      <div className="space-y-8">
        {Object.entries(groupedLocations).map(([regionName, regionLocations]) => (
          <div key={regionName}>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {regionName} ({(regionLocations as Location[]).length})
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-4 md:px-0">
              {(regionLocations as Location[]).map((location: Location, index: number) => (
                <LocationCard 
                  key={location.id} 
                  location={location} 
                  locationNumber={index + 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {filteredLocations.length === 0 && searchQuery && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Search className="h-16 w-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-gray-600 mb-2">
            No locations found
          </h3>
          <p className="text-gray-500">
            Try searching with a different zip code or city name
          </p>
        </div>
      )}
    </div>
  );
}

interface LocationCardProps {
  location: Location;
  locationNumber: number;
}

function LocationCard({ location, locationNumber }: LocationCardProps) {
  const { language } = useLanguage();
  const locName = pickLocalized(location as any, "name", language);
  const locAddress = pickLocalized(location as any, "address", language);
  return (
    <Card className="hover:shadow-lg transition-shadow duration-200 border-2 hover:border-blue-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <Badge variant="secondary" className="mb-2">
              #{locationNumber}
            </Badge>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {locName}
            </h3>
            <p className="text-sm font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
              {location.locationCode}
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start">
            <MapPin className="h-4 w-4 text-gray-400 mt-1 mr-2 flex-shrink-0" />
            <p className="text-sm text-gray-600">{locAddress}</p>
          </div>
          
          <div className="flex items-center">
            <Phone className="h-4 w-4 text-gray-400 mr-2" />
            <a 
              href={`tel:${location.phone}`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {location.phone}
            </a>
          </div>
          
          <div className="flex items-center">
            <Mail className="h-4 w-4 text-gray-400 mr-2" />
            <a 
              href={`mailto:${location.email}`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {location.email}
            </a>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-center">
            <span className="text-xs text-gray-500">
              Items available
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}