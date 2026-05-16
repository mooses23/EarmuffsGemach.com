import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLocations } from "@/lib/api";
import type { Location } from "@/lib/types";
import UniversalPaymentProcessor from "@/components/payment/universal-payment-processor";
import { FeeCalculator } from "@/components/payment/fee-calculator";
import { CreditCard, DollarSign, MapPin, Phone, Mail, User } from "lucide-react";
import { ContactActionsLight } from "@/components/ui/contact-actions";
import { DirectionsButton } from "@/components/locations/directions-button";
import { SmsConsentText, SmsConsentCheckbox } from "@/components/ui/sms-consent";
import { useSearch } from "wouter";
import { useLanguage } from "@/hooks/use-language";

export function SelfDeposit() {
  const { t, language } = useLanguage();
  const searchParams = useSearch();
  const urlParams = new URLSearchParams(searchParams);
  const locationIdFromUrl = urlParams.get("locationId") || "";

  const [selectedLocation, setSelectedLocation] = useState<string>(locationIdFromUrl);
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    setSelectedLocation(locationIdFromUrl);
  }, [locationIdFromUrl]);

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    queryFn: () => getLocations(),
  });

  const selectedLocationData = locations.find((loc: Location) => loc.id.toString() === selectedLocation);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#location-contact") return;
    if (!selectedLocationData || showPayment) return;
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById("location-contact");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      attempts += 1;
      if (attempts < 20) {
        window.requestAnimationFrame(tryScroll);
      }
    };
    window.requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [selectedLocationData, showPayment]);

  const phoneProvided = borrowerPhone.trim().length > 0;
  const smsConsentOk = !phoneProvided || smsConsent;
  const canProceedToPayment = selectedLocation && borrowerName && borrowerEmail && selectedPaymentMethod && smsConsentOk;

  const handleProceedToPayment = () => {
    if (canProceedToPayment) {
      setShowPayment(true);
    }
  };

  if (showPayment && selectedLocationData) {
    return (
      <section className="py-4 sm:py-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-4">{t("completeYourDeposit")}</h2>
            <p className="text-sm sm:text-base md:text-lg text-slate-400">
              {t("completeDepositFor")
                .replace("{name}", borrowerName)
                .replace("{amount}", String(selectedLocationData.depositAmount))
                .replace("{location}", language === "he" && selectedLocationData.nameHe ? selectedLocationData.nameHe : selectedLocationData.name)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                {t("borrowDetails")}
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{t("location")}</p>
                  <p className="font-semibold text-white">{language === "he" && selectedLocationData.nameHe ? selectedLocationData.nameHe : selectedLocationData.name}</p>
                  <p className="text-sm text-slate-400">{selectedLocationData.locationCode}</p>
                </div>
                {selectedLocationData.phone && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{t("contactLabel2")}</p>
                    <a href={`tel:${selectedLocationData.phone.replace(/[^+\d]/g, "")}`} className="block text-sm text-blue-400 hover:text-blue-300 hover:underline">{selectedLocationData.phone}</a>
                    <div className="mt-2">
                      <ContactActionsLight phone={selectedLocationData.phone} locationName={language === "he" && selectedLocationData.nameHe ? selectedLocationData.nameHe : selectedLocationData.name} />
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{t("borrower")}</p>
                  <p className="font-semibold text-white">{borrowerName}</p>
                  <p className="text-sm text-slate-400">{borrowerEmail}</p>
                  {borrowerPhone && <p className="text-sm text-slate-400">{borrowerPhone}</p>}
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{t("paymentMethod")}</p>
                  <p className="font-semibold text-white">{selectedPaymentMethod === "cash" ? t("cashNoFee") : selectedPaymentMethod === "stripe" ? t("creditDebitCard") : selectedPaymentMethod}</p>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                {t("paymentProcessing")}
              </h3>
              {selectedPaymentMethod && (
                <div className="space-y-4">
                  <FeeCalculator
                    depositAmount={selectedLocationData.depositAmount}
                    processingFeePercent={selectedLocationData.processingFeePercent || 290}
                    processingFeeFixedCents={selectedLocationData.processingFeeFixed ?? 30}
                    selectedPaymentMethod={selectedPaymentMethod}
                  />

                  <UniversalPaymentProcessor
                    locationId={selectedLocationData.id}
                    depositAmount={selectedLocationData.depositAmount}
                    borrowerName={borrowerName}
                    borrowerEmail={borrowerEmail}
                    borrowerPhone={borrowerPhone}
                    paymentMethod={selectedPaymentMethod}
                    processingFeePercent={selectedLocationData.processingFeePercent || 290}
                    processingFeeFixedCents={selectedLocationData.processingFeeFixed ?? 30}
                    onSuccess={() => {
                      setShowPayment(false);
                      setSelectedLocation("");
                      setBorrowerName("");
                      setBorrowerEmail("");
                      setBorrowerPhone("");
                      setSmsConsent(false);
                      setSelectedPaymentMethod("");
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="text-center mt-8">
            <Button
              variant="outline"
              onClick={() => setShowPayment(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              {t("backToDetails")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="self-deposit" className="py-4 sm:py-6">
      <div className="max-w-2xl mx-auto px-3 sm:px-0">
        <div className="glass-card rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-6">{t("recordYourDeposit")}</h2>

          <div className="space-y-5 sm:space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t("selectLocation")}
              </label>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-full bg-slate-800/50 border-slate-600 text-white">
                  <SelectValue placeholder={t("chooseYourGemachLocation")} />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location: Location) => (
                    <SelectItem key={location.id} value={location.id.toString()}>
                      #{location.id} - {language === "he" && location.nameHe ? location.nameHe : location.name} ({location.locationCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedLocationData && (
              <div id="location-contact" className="bg-emerald-950/40 border border-emerald-700/40 p-4 rounded-xl" data-testid="panel-location-contact">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-emerald-300">{t("contactLocation")}</h3>
                </div>
                <p className="text-sm text-emerald-400/80 mb-3">
                  {t("contactLocationPrompt").replace("{location}", language === "he" && selectedLocationData.nameHe ? selectedLocationData.nameHe : selectedLocationData.name)}
                </p>
                <div className="space-y-1.5 mb-3">
                  {(language === "he" && selectedLocationData.contactPersonHe ? selectedLocationData.contactPersonHe : selectedLocationData.contactPerson) && (
                    <div className="flex items-start gap-2 text-sm text-emerald-300">
                      <User className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                      <span><span className="font-medium">{t("contactPerson")}:</span> {language === "he" && selectedLocationData.contactPersonHe ? selectedLocationData.contactPersonHe : selectedLocationData.contactPerson}</span>
                    </div>
                  )}
                  {selectedLocationData.phone && (
                    <div className="flex items-start gap-2 text-sm">
                      <Phone className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                      <a href={`tel:${selectedLocationData.phone.replace(/[^+\d]/g, "")}`} className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline" data-testid="link-location-phone">{selectedLocationData.phone}</a>
                    </div>
                  )}
                  {selectedLocationData.email && (
                    <div className="flex items-start gap-2 text-sm">
                      <Mail className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                      <a href={`mailto:${selectedLocationData.email}`} className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline break-all" data-testid="link-location-email">{selectedLocationData.email}</a>
                    </div>
                  )}
                  {(language === "he" && selectedLocationData.addressHe ? selectedLocationData.addressHe : selectedLocationData.address) && (
                    <div className="flex items-start gap-2 text-sm text-emerald-300">
                      <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                      <span>{language === "he" && selectedLocationData.addressHe ? selectedLocationData.addressHe : selectedLocationData.address}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedLocationData.phone && (
                    <ContactActionsLight phone={selectedLocationData.phone} locationName={language === "he" && selectedLocationData.nameHe ? selectedLocationData.nameHe : selectedLocationData.name} />
                  )}
                  <DirectionsButton
                    address={language === "he" && selectedLocationData.addressHe ? selectedLocationData.addressHe : selectedLocationData.address}
                    variant="light"
                    hasCoords={selectedLocationData.latitude != null && selectedLocationData.longitude != null}
                  />
                </div>
              </div>
            )}

            <div className="bg-blue-950/40 border border-blue-700/40 p-4 rounded-xl">
              <h3 className="font-semibold text-blue-300 mb-2">{t("depositInformation")}</h3>
              <ul className="text-sm text-blue-400/80 space-y-1">
                <li>• {t("depositAmount20")}</li>
                <li>• {t("returnInGoodCondition")}</li>
                <li>• {t("contactCoordinatorArrangements")}</li>
              </ul>
            </div>

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="borrowerName" className="text-slate-300">{t("fullName")} *</Label>
                  <Input
                    id="borrowerName"
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    placeholder={t("enterYourFullName")}
                    required
                    className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <Label htmlFor="borrowerEmail" className="text-slate-300">{t("emailAddress")} *</Label>
                  <Input
                    id="borrowerEmail"
                    type="email"
                    value={borrowerEmail}
                    onChange={(e) => setBorrowerEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                    className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="borrowerPhone" className="text-slate-300">{t("phoneNumber")}</Label>
                <Input
                  id="borrowerPhone"
                  type="tel"
                  value={borrowerPhone}
                  onChange={(e) => setBorrowerPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="bg-slate-800/50 border-slate-600 text-white placeholder:text-slate-500"
                />
                <SmsConsentText className="text-slate-500 mt-2" />
                {phoneProvided && (
                  <div className="mt-3">
                    <SmsConsentCheckbox
                      id="self-deposit-sms-consent"
                      checked={smsConsent}
                      onCheckedChange={setSmsConsent}
                    />
                  </div>
                )}
              </div>

              <div>
                <Label className="text-slate-300">{t("paymentMethod")} *</Label>
                <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-600 text-white">
                    <SelectValue placeholder={t("choosePaymentMethod")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        {t("creditDebitCard")}
                      </div>
                    </SelectItem>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        {t("cashNoFee")}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedLocationData && selectedPaymentMethod && (
                <div className="mt-4 p-4 bg-slate-800/50 border border-slate-600/50 rounded-xl">
                  <FeeCalculator
                    depositAmount={selectedLocationData.depositAmount}
                    processingFeePercent={selectedLocationData.processingFeePercent || 290}
                    processingFeeFixedCents={selectedLocationData.processingFeeFixed ?? 30}
                    selectedPaymentMethod={selectedPaymentMethod}
                  />
                </div>
              )}
            </div>

            <Button
              onClick={handleProceedToPayment}
              disabled={!canProceedToPayment}
              className="w-full h-11 sm:h-12"
              size="lg"
            >
              {selectedPaymentMethod === 'cash' ? t("recordCashDeposit") : t("proceedToCardPayment")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
