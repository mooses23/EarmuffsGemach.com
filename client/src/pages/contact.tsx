import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ContactForm } from "@/components/contact/contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Clock, Info, ArrowRight } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Link, useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getLocations } from "@/lib/api";
import type { Location } from "@/lib/types";

export default function Contact() {
  const { t, language } = useLanguage();
  const [, navigate] = useLocation();
  const [pickedLocationId, setPickedLocationId] = useState<string>("");

  useEffect(() => {
    document.title = "Contact Baby Banz Earmuffs Gemach | Get In Touch";
  }, []);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    queryFn: () => getLocations(),
  });

  const activeLocations = locations.filter((loc) => loc.isActive);

  const handleJumpToLocation = () => {
    if (!pickedLocationId) return;
    navigate(`/self-deposit?locationId=${pickedLocationId}#location-contact`);
  };

  return (
    <>
      <section className="py-12 sm:py-16 bg-primary/10">
        <div className="container mx-auto px-3 sm:px-4 md:px-6">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800 mb-3 sm:mb-4">{t("contactUs")}</h1>
            <p className="text-sm sm:text-base md:text-lg text-neutral-600 max-w-3xl mx-auto">
              {t("contactDescription")}
            </p>
          </div>

          <div className="max-w-3xl mx-auto px-3 sm:px-0">
            <div
              className="mb-6 sm:mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5"
              data-testid="contact-admin-notice"
            >
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm sm:text-base text-amber-900 flex-1">
                  <p className="font-semibold mb-1">{t("contactGoesToAdminTitle")}</p>
                  <p className="mb-3">{t("contactGoesToAdminBody")}</p>

                  <div className="bg-white/70 border border-amber-200 rounded-md p-3 mb-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">
                      {t("findYourLocation")}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select value={pickedLocationId} onValueChange={setPickedLocationId}>
                        <SelectTrigger
                          className="bg-white text-neutral-800 sm:flex-1"
                          data-testid="select-contact-location-picker"
                        >
                          <SelectValue placeholder={t("chooseYourGemachLocation")} />
                        </SelectTrigger>
                        <SelectContent>
                          {activeLocations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id.toString()}>
                              {language === "he" && loc.nameHe ? loc.nameHe : loc.name} ({loc.locationCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={handleJumpToLocation}
                        disabled={!pickedLocationId}
                        data-testid="button-jump-to-location-contact"
                      >
                        {t("goToContactPanel")}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Link
                    href="/locations"
                    className="text-sm font-medium underline hover:no-underline"
                    data-testid="link-browse-all-locations"
                  >
                    {t("browseAllLocations")} →
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {/* Email */}
              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="mb-3 sm:mb-4 text-primary text-2xl sm:text-3xl">
                    <Mail className="h-8 w-8 mx-auto" />
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-2">{t("emailUs")}</h3>
                  <p className="text-xs sm:text-sm md:text-base text-neutral-600">
                    <a href="mailto:earmuffsgemach@gmail.com" className="hover:text-primary transition-colors">
                      earmuffsgemach@gmail.com
                    </a>
                  </p>
                </CardContent>
              </Card>

              {/* Hours */}
              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="mb-3 sm:mb-4 text-primary text-2xl sm:text-3xl">
                    <Clock className="h-8 w-8 mx-auto" />
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-2">{t("responseHours")}</h3>
                  <p className="text-xs sm:text-sm md:text-base text-neutral-600">
                    {t("responseHoursDescription")}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                <h3 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6">{t("sendUsMessage")}</h3>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
