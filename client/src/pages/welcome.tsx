import { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useOperatorAuth } from "@/hooks/use-operator-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Check, MapPin, ArrowRight, Phone, MessageCircle, Mail, Package, Repeat2, BellRing, ShieldCheck, type LucideIcon } from "lucide-react";
import { Location, OPERATOR_CONTACT_PREFERENCES, type OperatorContactPreference } from "@shared/schema";

interface WelcomeResolveResponse {
  // The server strips claimToken/operatorPin/error fields before returning,
  // so the public shape is a Location subset plus the derived `pinIsDefault`.
  location: Partial<Location> & {
    id: number;
    name: string;
    locationCode: string;
    address: string;
    pinIsDefault?: boolean;
  };
  alreadyOnboarded: boolean;
}

type Step = "confirm" | "details" | "pin" | "tour" | "done";

export default function WelcomePage() {
  const [, params] = useRoute<{ token: string }>("/welcome/:token");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refreshLocation } = useOperatorAuth();
  const token = params?.token || "";

  const { data, isLoading, error } = useQuery<WelcomeResolveResponse>({
    queryKey: ["/api/welcome", token],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/welcome/${encodeURIComponent(token)}`);
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const loc = data?.location;
  const isHebrew = !!loc?.nameHe;
  const localizedName = isHebrew ? (loc?.nameHe || loc?.name) : loc?.name;

  const [step, setStep] = useState<Step>("confirm");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [contactPreference, setContactPreference] = useState<OperatorContactPreference>("phone");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [tourIdx, setTourIdx] = useState(0);

  // Pre-fill name/email if the operator has previously partially-onboarded.
  useEffect(() => {
    if (!loc) return;
    if (loc.contactPerson && loc.contactPerson !== "Location Coordinator") {
      setContactPerson(loc.contactPerson);
    }
    if (loc.email && !loc.email.toLowerCase().includes("earmuffsgemach@gmail.com")) {
      setEmail(loc.email);
    }
    if (loc.contactPreference && (OPERATOR_CONTACT_PREFERENCES as readonly string[]).includes(loc.contactPreference)) {
      setContactPreference(loc.contactPreference as OperatorContactPreference);
    }
  }, [loc]);

  // Already-onboarded re-entry: establish the server session via the public
  // /session endpoint (so session-protected operator APIs accept this device),
  // mirror it into localStorage for useOperatorAuth, then redirect.
  // Spec: tokens are durable, re-opening the link should not bounce them
  // back to a manual login screen.
  const [reentryError, setReentryError] = useState<string | null>(null);
  const reentryFiredRef = useRef(false);
  useEffect(() => {
    if (!data?.alreadyOnboarded || !loc || reentryFiredRef.current) return;
    reentryFiredRef.current = true;
    (async () => {
      try {
        const res = await apiRequest("POST", `/api/welcome/${encodeURIComponent(token)}/session`, {});
        const json = await res.json().catch(() => ({}));
        const sessionLoc = json?.location || loc;
        try {
          localStorage.setItem("operatorLocation", JSON.stringify(sessionLoc));
        } catch {
          // ignore localStorage errors
        }
        refreshLocation();
        setLocation("/operator/dashboard");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not open your dashboard.";
        setReentryError(msg);
      }
    })();
  }, [data?.alreadyOnboarded, loc, refreshLocation, setLocation, token]);

  const completeMutation = useMutation({
    mutationFn: async (payload: { contactPerson: string; email: string; contactPreference: OperatorContactPreference; newPin: string; confirmPin: string }) => {
      const res = await apiRequest("POST", `/api/welcome/${encodeURIComponent(token)}/complete`, payload);
      return res.json();
    },
    onSuccess: (resp: { success: boolean; location: Location }) => {
      // Same shape as /api/operator/login response — drop into localStorage so
      // the dashboard's useOperatorAuth picks it up on the next mount.
      try {
        localStorage.setItem("operatorLocation", JSON.stringify(resp.location));
      } catch (_e) {
        // ignore
      }
      refreshLocation();
      queryClient.invalidateQueries({ queryKey: ["/api/welcome", token] });
      setStep("tour");
      setTourIdx(0);
    },
    onError: (e: any) => {
      toast({ title: "Could not save", description: e?.message || "Please try again.", variant: "destructive" });
    },
  });

  const tourSlides = useMemo(() => isHebrew ? [
    { icon: Package, title: "מלאי וחידוש מלאי", body: "במסך הראשי תראי את כמות האוזניות בכל צבע. הוראות ההזמנה החוזרת מ-Banz נמצאות תחת \"הוראות חידוש מלאי\" — עם קוד הנחה ושילוח חינם." },
    { icon: Repeat2, title: "השאלה והחזרה", body: "להשאלה: \"השאלה חדשה\" → שם, טלפון, צבע, פיקדון. להחזרה: לחצי על \"החזרה\" בעסקה הפתוחה." },
    { icon: BellRing, title: "תזכורות החזרה", body: "אם משאיל איחר, אפשר לשלוח לו תזכורת ידידותית בלחיצה אחת — באימייל או SMS." },
  ] : [
    { icon: Package, title: "Stock & restocking", body: "Your dashboard shows headband stock by color. Restocking instructions (with free shipping + discount codes for the Baby Banz site) live under \"Restocking Instructions\" on the main screen." },
    { icon: Repeat2, title: "Lend & return wizards", body: "Use \"New Loan\" to record a borrower (name, phone, color, deposit). When they bring it back, hit \"Return\" on that row to wrap up." },
    { icon: BellRing, title: "Return reminders", body: "If a borrower runs late, you can send them a soft reminder in one tap — by email or SMS, in their language." },
  ], [isHebrew]);

  if (isLoading) {
    return (
      <FullScreenShell>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your welcome…
        </div>
      </FullScreenShell>
    );
  }

  if (error || !loc) {
    return (
      <FullScreenShell>
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>This welcome link is no longer active. Please contact the gemach for a fresh one.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setLocation("/")}>Back to home</Button>
          </CardContent>
        </Card>
      </FullScreenShell>
    );
  }

  if (data?.alreadyOnboarded) {
    // The useEffect above establishes the server session and redirects; this
    // is just a brief in-flight state shown between resolution and the wouter
    // setLocation kicking in. Surface a recoverable error if /session failed.
    return (
      <FullScreenShell>
        {reentryError ? (
          <Card className="max-w-md w-full" data-testid="welcome-reentry-error">
            <CardHeader>
              <CardTitle>Couldn't open your dashboard</CardTitle>
              <CardDescription>{reentryError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/operator/login")} data-testid="welcome-go-login">
                Go to login <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground" data-testid="welcome-already-onboarded">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening your dashboard…
          </div>
        )}
      </FullScreenShell>
    );
  }

  return (
    <FullScreenShell>
      <Card className="max-w-md w-full" data-testid="welcome-card">
        <CardHeader>
          <ProgressDots step={step} />
          {step === "confirm" && (
            <>
              <CardTitle className="text-xl">You're {localizedName}?</CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="h-3.5 w-3.5" />
                {loc.address} · code {loc.locationCode}
              </CardDescription>
            </>
          )}
          {step === "details" && (
            <>
              <CardTitle className="text-xl">A few quick details</CardTitle>
              <CardDescription>So we know who to contact when something comes up.</CardDescription>
            </>
          )}
          {step === "pin" && (
            <>
              <CardTitle className="text-xl">Pick your PIN</CardTitle>
              <CardDescription>4–6 digits. The temporary <strong>1234</strong> stops working once you save.</CardDescription>
            </>
          )}
          {step === "tour" && (
            <>
              <CardTitle className="text-xl">A quick tour</CardTitle>
              <CardDescription>{tourIdx + 1} of {tourSlides.length}</CardDescription>
            </>
          )}
          {step === "done" && (
            <>
              <CardTitle className="text-xl flex items-center gap-2"><Check className="h-5 w-5 text-green-600" /> You're in</CardTitle>
              <CardDescription>Welcome aboard, {contactPerson || "operator"}.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "confirm" && (
            <>
              <p className="text-sm text-muted-foreground">
                We're rolling out a small dashboard to all earmuffs gemach locations. This is your personal welcome — just confirm it's you, set up your details, and you're done.
              </p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setStep("details")} data-testid="welcome-confirm-yes">
                  That's me <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Not your location? Please reply to the message you received so we can fix our records.
              </p>
            </>
          )}

          {step === "details" && (
            <DetailsForm
              contactPerson={contactPerson}
              email={email}
              contactPreference={contactPreference}
              setContactPerson={setContactPerson}
              setEmail={setEmail}
              setContactPreference={setContactPreference}
              onNext={() => setStep("pin")}
            />
          )}

          {step === "pin" && (
            <PinForm
              newPin={newPin}
              confirmPin={confirmPin}
              setNewPin={setNewPin}
              setConfirmPin={setConfirmPin}
              isPending={completeMutation.isPending}
              onSave={() => completeMutation.mutate({ contactPerson, email, contactPreference, newPin, confirmPin })}
              onBack={() => setStep("details")}
            />
          )}

          {step === "tour" && (
            <TourSlide
              icon={tourSlides[tourIdx].icon}
              title={tourSlides[tourIdx].title}
              body={tourSlides[tourIdx].body}
              isLast={tourIdx === tourSlides.length - 1}
              onNext={() => {
                if (tourIdx < tourSlides.length - 1) {
                  setTourIdx(tourIdx + 1);
                } else {
                  // Spec: end of tour lands the operator straight in their
                  // dashboard. No intermediate "you're in" tap-through.
                  setStep("done");
                  setLocation("/operator/dashboard");
                }
              }}
              onBack={tourIdx > 0 ? () => setTourIdx(tourIdx - 1) : undefined}
            />
          )}

          {step === "done" && (
            <div className="flex items-center gap-2 text-muted-foreground" data-testid="welcome-redirecting">
              <Loader2 className="h-4 w-4 animate-spin" /> Opening your dashboard…
            </div>
          )}
        </CardContent>
      </Card>
    </FullScreenShell>
  );
}

function FullScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-start sm:items-center justify-center px-4 py-8">
      {children}
    </div>
  );
}

function ProgressDots({ step }: { step: Step }) {
  const steps: Step[] = ["confirm", "details", "pin", "tour", "done"];
  const idx = steps.indexOf(step);
  return (
    <div className="flex gap-1 mb-3" aria-label="Progress">
      {steps.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-primary" : "bg-muted"}`}
          data-testid={`welcome-progress-${s}`}
        />
      ))}
    </div>
  );
}

function DetailsForm({
  contactPerson, email, contactPreference,
  setContactPerson, setEmail, setContactPreference, onNext,
}: {
  contactPerson: string; email: string; contactPreference: OperatorContactPreference;
  setContactPerson: (v: string) => void; setEmail: (v: string) => void;
  setContactPreference: (v: OperatorContactPreference) => void;
  onNext: () => void;
}) {
  const valid = contactPerson.trim().length >= 2 && /\S+@\S+\.\S+/.test(email);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (valid) onNext(); }}
      className="space-y-3"
      data-testid="welcome-details-form"
    >
      <div>
        <Label htmlFor="welcome-name">Your name</Label>
        <Input id="welcome-name" autoComplete="name" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Sarah Goldberg" data-testid="welcome-input-name" />
      </div>
      <div>
        <Label htmlFor="welcome-email">Personal email</Label>
        <Input id="welcome-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" data-testid="welcome-input-email" />
        <p className="text-xs text-muted-foreground mt-1">Replaces the shared earmuffsgemach@gmail.com so messages reach <em>you</em>.</p>
      </div>
      <div>
        <Label>Best way to reach you</Label>
        <RadioGroup
          value={contactPreference}
          onValueChange={(v) => setContactPreference(v as OperatorContactPreference)}
          className="grid grid-cols-3 gap-2 mt-1"
        >
          {[
            { v: "phone" as const, label: "Phone", icon: Phone },
            { v: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle },
            { v: "email" as const, label: "Email", icon: Mail },
          ].map(({ v, label, icon: Icon }) => (
            <Label
              key={v}
              htmlFor={`pref-${v}`}
              className={`flex flex-col items-center gap-1 border rounded-md p-2 cursor-pointer text-xs ${contactPreference === v ? "border-primary bg-primary/5" : "border-input"}`}
              data-testid={`welcome-pref-${v}`}
            >
              <RadioGroupItem id={`pref-${v}`} value={v} className="sr-only" />
              <Icon className="h-4 w-4" />
              {label}
            </Label>
          ))}
        </RadioGroup>
      </div>
      <Button type="submit" className="w-full" disabled={!valid} data-testid="welcome-details-next">
        Continue <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </form>
  );
}

function PinForm({
  newPin, confirmPin, setNewPin, setConfirmPin, isPending, onSave, onBack,
}: {
  newPin: string; confirmPin: string;
  setNewPin: (v: string) => void; setConfirmPin: (v: string) => void;
  isPending: boolean; onSave: () => void; onBack: () => void;
}) {
  const matches = newPin.length >= 4 && newPin === confirmPin;
  const notDefault = newPin !== "1234";
  const valid = matches && notDefault;
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (valid) onSave(); }}
      className="space-y-3"
      data-testid="welcome-pin-form"
    >
      <div>
        <Label htmlFor="welcome-pin">New PIN</Label>
        <Input
          id="welcome-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          data-testid="welcome-input-pin"
        />
      </div>
      <div>
        <Label htmlFor="welcome-pin-confirm">Confirm PIN</Label>
        <Input
          id="welcome-pin-confirm"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          data-testid="welcome-input-pin-confirm"
        />
        {newPin && confirmPin && !matches && (
          <p className="text-xs text-destructive mt-1">PINs don't match yet.</p>
        )}
        {newPin === "1234" && (
          <p className="text-xs text-destructive mt-1">Please choose something other than 1234.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>Back</Button>
        <Button type="submit" className="flex-1" disabled={!valid || isPending} data-testid="welcome-pin-save">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
          {isPending ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </form>
  );
}

function TourSlide({
  icon: Icon, title, body, isLast, onNext, onBack,
}: {
  icon: LucideIcon; title: string; body: string; isLast: boolean;
  onNext: () => void; onBack?: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="welcome-tour-slide">
      <div className="flex items-center gap-2 text-primary">
        <Icon className="h-5 w-5" />
        <span className="font-semibold">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      <div className="flex gap-2">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        )}
        <Button type="button" className="flex-1" onClick={onNext} data-testid="welcome-tour-next">
          {isLast ? "Open dashboard" : "Next"} <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
