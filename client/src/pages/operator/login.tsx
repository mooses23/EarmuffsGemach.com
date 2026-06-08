import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Loader2, MapPin, Lock, HelpCircle, Search } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function OperatorLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [locationCode, setLocationCode] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<Array<{ id: number; name: string; nameHe?: string | null; locationCode: string }>>([]);
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleLookupSearch = async (q: string) => {
    setLookupQuery(q);
    if (q.trim().length < 2) {
      setLookupResults([]);
      return;
    }
    setLookupLoading(true);
    try {
      const res = await fetch(`/api/locations/lookup?q=${encodeURIComponent(q.trim())}`, { credentials: "include" });
      const data = await res.json();
      setLookupResults(Array.isArray(data) ? data : []);
    } catch {
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!locationCode.trim() || !pin.trim()) {
      toast({
        title: t("missingInformation"),
        description: t("enterLocationCodeAndPIN"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/api/operator/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ locationCode: locationCode.trim(), pin: pin.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      // Store location in localStorage for persistence
      localStorage.setItem("operatorLocation", JSON.stringify(data.location));
      
      toast({
        title: t("welcome"),
        description: `${t("loggedInTo")} ${language === "he" && data.location.nameHe ? data.location.nameHe : data.location.name}`,
      });

      // Redirect to operator dashboard
      setLocation("/operator/dashboard");
    } catch (error) {
      toast({
        title: t("loginFailed"),
        description: error instanceof Error ? error.message : t("invalidLocationCodeOrPIN"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("operatorLogin")}</CardTitle>
          <CardDescription>
            {t("operatorLoginDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="locationCode">{t("locationCode")}</Label>
                <button
                  type="button"
                  onClick={() => { setLookupOpen(true); setLookupQuery(""); setLookupResults([]); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Can't find your code?
                </button>
              </div>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="locationCode"
                  placeholder={t("locationCodePlaceholder")}
                  value={locationCode}
                  onChange={(e) => setLocationCode(e.target.value.toUpperCase())}
                  className="pl-10"
                  autoComplete="off"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="pin">{t("pin")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pin"
                  type="password"
                  placeholder={t("enterYourPIN")}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="pl-10"
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("loggingIn")}
                </>
              ) : (
                t("login")
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>{t("needLocationCode")}</p>
            <p className="mt-1">
              <Link href="/apply" className="text-primary hover:underline">
                {t("applyToBecomeOperator")}
              </Link>
            </p>
          </div>
          
          <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
            <Link href="/auth" className="text-primary hover:underline">
              {t("adminLogin")}
            </Link>
          </div>
        </CardContent>
      </Card>

      <Dialog open={lookupOpen} onOpenChange={(open) => { setLookupOpen(open); if (!open) { setLookupQuery(""); setLookupResults([]); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Find your location code</DialogTitle>
            <DialogDescription>
              Type your phone number, city, or gemach name to look up your code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="e.g. Brooklyn, +1 718 555…, Shira's Gemach"
                value={lookupQuery}
                onChange={(e) => handleLookupSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {lookupLoading && (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Searching…
              </div>
            )}

            {!lookupLoading && lookupQuery.trim().length >= 2 && lookupResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No locations found. Try a different name, city, or phone number.
              </p>
            )}

            {lookupResults.length > 0 && (
              <div className="space-y-2">
                {lookupResults.map((loc) => (
                  <div
                    key={loc.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{language === "he" && loc.nameHe ? loc.nameHe : loc.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-primary">{loc.locationCode}</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Enter your code above, then close this dialog.
                </p>
              </div>
            )}

            {!lookupQuery.trim() && (
              <p className="text-sm text-muted-foreground text-center py-2">
                Start typing to search…
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
