import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Location } from "@/lib/types";
import { User, MapPin, Phone, Package } from "lucide-react";
import { ContactActionsLight } from "@/components/ui/contact-actions";
import { useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";

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
        boxShadow: `inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.12)`,
        border: isLight ? '1px solid #d1d5db' : 'none'
      }}
      title={`${color}: ${quantity}`}
    >
      <span 
        className={`text-[9px] font-bold ${isLight ? 'text-gray-700' : 'text-white'}`}
        style={{ textShadow: isLight ? 'none' : '0 1px 1px rgba(0,0,0,0.4)' }}
      >
        {quantity}
      </span>
    </div>
  );
}

interface LocationCardProps {
  location: Location;
  locationNumber?: number;
}

export function LocationCard({ location, locationNumber }: LocationCardProps) {
  const [, navigate] = useLocation();
  const { t } = useLanguage();
  const { data: inventoryData } = useQuery<{ inventory: { color: string; quantity: number }[]; total: number }>({
    queryKey: ["/api/locations", location.id, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${location.id}/inventory`);
      if (!res.ok) return { inventory: [], total: 0 };
      return res.json();
    },
  });

  const inventory = inventoryData?.inventory?.filter(item => item.quantity > 0) || [];

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a") || target.closest("[data-contact-actions]")) return;
    navigate(`/self-deposit?locationId=${location.id}`);
  };
  
  return (
    <div onClick={handleCardClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/self-deposit?locationId=${location.id}`); }}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-blue-300 hover:bg-blue-50/30">
        <CardContent className="pt-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              {locationNumber && (
                <div className="bg-yellow-400 text-black text-sm font-bold px-3 py-1 rounded-full inline-block mb-2">
                  #{locationNumber}
                </div>
              )}
              <h3 className="text-xl font-semibold">{location.name}</h3>
            </div>
            <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              {location.isActive ? t("active") : t("inactive")}
            </span>
          </div>
          <div className="mb-4 text-neutral-600">
            <p className="flex items-center mb-2">
              <User className="w-5 h-5 mr-2 text-neutral-500" />
              <span>{location.contactPerson}</span>
            </p>
            <p className="flex items-center mb-2">
              <MapPin className="w-5 h-5 mr-2 text-neutral-500" />
              <span>{location.address}</span>
            </p>
            <p className="flex items-center mb-2">
              <Phone className="w-5 h-5 mr-2 text-neutral-500" />
              <a href={`tel:${location.phone?.replace(/[^+\d]/g, "")}`} className="text-blue-600 hover:text-blue-800 hover:underline transition-colors">{location.phone}</a>
            </p>
            <div className="mb-2" data-contact-actions>
              <ContactActionsLight phone={location.phone} locationName={location.name} />
            </div>
            <p className="flex items-center">
              <Package className="w-5 h-5 mr-2 text-neutral-500" />
              {inventory.length > 0 ? (
                <span className="flex items-center gap-1 flex-wrap">
                  {inventory.map(item => (
                    <InventoryCircle key={item.color} color={item.color} quantity={item.quantity} />
                  ))}
                </span>
              ) : (
                <span className="text-neutral-400 text-sm">{t("noStockData")}</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
