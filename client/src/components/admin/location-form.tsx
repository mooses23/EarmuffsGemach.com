import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insertLocationSchema } from "@/lib/types";
import type { InsertLocation, Location } from "@/lib/types";
import type { CityCategory, Region } from "@shared/schema";
import { createLocation, updateLocation } from "@/lib/api";
import { looksLikeStreetAddress } from "@/lib/address-heuristic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CommunityForm } from "@/components/admin/community-form";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoaderCircle, Phone, Mail, DollarSign, MapPin, User, Globe, AlertTriangle, Crosshair, Save, MessageCircle, Percent } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { OPERATOR_CONTACT_PREFERENCES } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LocationFormProps {
  location?: Location;
  regions: Region[];
  onSuccess?: () => void;
  focusPhone?: boolean;
}

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 border-t border-border/60 ml-1" />
    </div>
  );
}

function BilingualPair({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
      {children}
    </div>
  );
}

const inputClass =
  "h-11 px-3 text-sm border-border/70 transition-colors duration-150 hover:border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0";

const iconInputClass =
  "h-11 pl-9 text-sm border-border/70 transition-colors duration-150 hover:border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0";

const labelClass = "text-xs font-medium text-muted-foreground";

function IconInputWrapper({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      {children}
    </div>
  );
}

// Task #265: admin-only "Map coordinates" section for an existing location.
// Shows the current lat/lng + a "Re-geocode from address" one-click action,
// plus optional manual override fields. Both actions are audited server-side.
function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

interface LiveCoords {
  latitude: number | null;
  longitude: number | null;
  geocodedAt: Date | null;
}

function CoordinatesSection({ location }: { location: Location }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lat, setLat] = useState<string>(
    location.latitude != null ? String(location.latitude) : "",
  );
  const [lng, setLng] = useState<string>(
    location.longitude != null ? String(location.longitude) : "",
  );
  // Local mirror of saved coords so the "Currently …" line updates the moment
  // a mutation succeeds, without waiting for the full /api/locations refetch.
  const [live, setLive] = useState<LiveCoords>({
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
    geocodedAt: toDateOrNull(location.geocodedAt),
  });

  useEffect(() => {
    setLat(location.latitude != null ? String(location.latitude) : "");
    setLng(location.longitude != null ? String(location.longitude) : "");
    setLive({
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      geocodedAt: toDateOrNull(location.geocodedAt),
    });
  }, [location.id, location.latitude, location.longitude, location.geocodedAt]);

  const regeocode = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/locations/${location.id}/regeocode`);
      return res.json() as Promise<{ latitude: number; longitude: number; geocodedAt: string | null }>;
    },
    onSuccess: (data) => {
      setLat(String(data.latitude));
      setLng(String(data.longitude));
      setLive({
        latitude: data.latitude,
        longitude: data.longitude,
        geocodedAt: toDateOrNull(data.geocodedAt),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/location-tree"] });
      toast({
        title: "Re-geocoded",
        description: `New coords: ${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Re-geocode failed", description: err.message, variant: "destructive" });
    },
  });

  const saveManual = useMutation({
    mutationFn: async (payload: { latitude: number | null; longitude: number | null }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/locations/${location.id}/coordinates`,
        payload,
      );
      return res.json() as Promise<{ latitude: number | null; longitude: number | null; geocodedAt: string | null }>;
    },
    onSuccess: (data) => {
      setLive({
        latitude: data.latitude,
        longitude: data.longitude,
        geocodedAt: toDateOrNull(data.geocodedAt),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/location-tree"] });
      toast({ title: "Coordinates saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSaveManual = () => {
    const trimmedLat = lat.trim();
    const trimmedLng = lng.trim();
    if (trimmedLat === "" && trimmedLng === "") {
      saveManual.mutate({ latitude: null, longitude: null });
      return;
    }
    const latNum = Number(trimmedLat);
    const lngNum = Number(trimmedLng);
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      toast({ title: "Invalid latitude", description: "Must be a number between -90 and 90", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      toast({ title: "Invalid longitude", description: "Must be a number between -180 and 180", variant: "destructive" });
      return;
    }
    saveManual.mutate({ latitude: latNum, longitude: lngNum });
  };

  const hasAddress = !!(location.address && location.address.trim());
  const stamped = live.geocodedAt;

  return (
    <div className="space-y-3">
      <SectionHeading icon={Crosshair} label="Map coordinates" />
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {live.latitude != null && live.longitude != null ? (
              <>Currently <span className="font-mono">{live.latitude.toFixed(5)}, {live.longitude.toFixed(5)}</span>{stamped ? ` · last set ${stamped.toLocaleDateString()}` : ""}</>
            ) : (
              <>No coordinates set yet — borrowers won't see this in "Find nearest to me".</>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => regeocode.mutate()}
            disabled={!hasAddress || regeocode.isPending}
            data-testid="btn-regeocode"
          >
            {regeocode.isPending ? (
              <><LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />Re-geocoding…</>
            ) : (
              <><Crosshair className="mr-2 h-3.5 w-3.5" />Re-geocode from address</>
            )}
          </Button>
        </div>
        {!hasAddress && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Add an English address above and save before re-geocoding.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor={`manual-lat-${location.id}`}>Latitude (manual override)</label>
            <Input
              id={`manual-lat-${location.id}`}
              className={inputClass}
              inputMode="decimal"
              placeholder="-90 to 90"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              data-testid="input-manual-lat"
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor={`manual-lng-${location.id}`}>Longitude (manual override)</label>
            <Input
              id={`manual-lng-${location.id}`}
              className={inputClass}
              inputMode="decimal"
              placeholder="-180 to 180"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              data-testid="input-manual-lng"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSaveManual}
            disabled={saveManual.isPending}
            data-testid="btn-save-manual-coords"
          >
            {saveManual.isPending ? (
              <><LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />Saving…</>
            ) : (
              <><Save className="mr-2 h-3.5 w-3.5" />Save coordinates</>
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Leave both blank and save to clear coordinates. All changes are recorded in the audit trail.
        </p>
      </div>
    </div>
  );
}

export function LocationForm({ location, regions, onSuccess, focusPhone }: LocationFormProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusPhone && phoneInputRef.current) {
      const timer = setTimeout(() => {
        phoneInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        phoneInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusPhone]);

  const form = useForm<InsertLocation>({
    resolver: zodResolver(insertLocationSchema.omit({ locationCode: true, operatorPin: true })),
    mode: "onChange",
    defaultValues: location ? {
      name: location.name || "",
      nameHe: location.nameHe || "",
      contactPerson: location.contactPerson || "",
      contactPersonHe: location.contactPersonHe || "",
      address: location.address || "",
      addressHe: location.addressHe || "",
      zipCode: location.zipCode || "",
      phone: location.phone || "",
      email: location.email || "",
      regionId: location.regionId || 1,
      cityCategoryId: location.cityCategoryId ?? null,
      isActive: location.isActive ?? true,
      cashOnly: location.cashOnly || false,
      depositAmount: location.depositAmount || 20,
      paymentMethods: location.paymentMethods ?? ["cash"],
      contactPreference: location.contactPreference ?? null,
      processingFeePercent: location.processingFeePercent ?? 300,
      processingFeeFixed: location.processingFeeFixed ?? 30,
    } : {
      name: "",
      nameHe: "",
      contactPerson: "",
      contactPersonHe: "",
      address: "",
      addressHe: "",
      zipCode: "",
      phone: "",
      email: "",
      regionId: regions[0]?.id || 1,
      cityCategoryId: null,
      isActive: true,
      cashOnly: false,
      depositAmount: 20,
      paymentMethods: ["cash"],
      contactPreference: null,
      processingFeePercent: 300,
      processingFeeFixed: 30,
    },
  });

  const watchedRegionId = form.watch("regionId");
  const [communityDialogOpen, setCommunityDialogOpen] = useState(false);

  const { data: communities = [] } = useQuery<CityCategory[]>({
    queryKey: ["/api/city-categories"],
  });

  const filteredCommunities = React.useMemo(
    () => communities
      .filter((c) => c.regionId === watchedRegionId)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name)),
    [communities, watchedRegionId],
  );

  const createMutation = useMutation({
    mutationFn: (data: InsertLocation) => createLocation(data),
    onSuccess: () => {
      toast({
        title: t("success"),
        description: t("locationCreatedSuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToCreateLocation")}: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: InsertLocation) => updateLocation(location!.id, data),
    onSuccess: () => {
      toast({
        title: t("success"),
        description: t("locationUpdatedSuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToUpdateLocation")}: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLocation) => {
    if (location) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const paymentMethodLabels: Record<string, string> = {
    cash: t("cashLabel"),
    stripe: t("stripeCardsLabel"),
    paypal: t("paypalLabel"),
    square: t("squareLabel"),
  };

  const fieldLabels: Record<string, string> = {
    name: `${t("gemachName")} (English)`,
    nameHe: `${t("gemachName")} (עברית)`,
    contactPerson: `${t("contactPersonLabel")} (English)`,
    contactPersonHe: `${t("contactPersonLabel")} (עברית)`,
    address: `${t("addressLabel")} (English)`,
    addressHe: `${t("addressLabel")} (עברית)`,
    phone: t("phoneLabel"),
    email: t("emailLabel2"),
    regionId: t("region"),
    depositAmount: t("depositAmountDollar"),
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1.5" data-testid="validation-banner">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("validationBannerTitle")}</span>
            </div>
            <ul className="list-disc list-inside text-xs text-amber-800/80 dark:text-amber-100/80 space-y-0.5 pl-1">
              {Object.keys(form.formState.errors).map((key) => (
                <li key={key}>{fieldLabels[key] ?? key}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3">
          <SectionHeading icon={Globe} label={t("gemachName")} />
          <BilingualPair>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>English</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className={inputClass}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nameHe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>עברית</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="rtl"
                      className={inputClass}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </BilingualPair>
        </div>

        <div className="space-y-3">
          <SectionHeading icon={User} label={t("contactPersonLabel")} />
          <BilingualPair>
            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>English</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className={inputClass}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactPersonHe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>עברית</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="rtl"
                      className={inputClass}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </BilingualPair>
        </div>

        <div className="space-y-3">
          <SectionHeading icon={MapPin} label={t("addressLabel")} />
          <BilingualPair>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => {
                const incomplete = !looksLikeStreetAddress(field.value);
                return (
                  <FormItem>
                    <FormLabel className={labelClass}>English</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className={inputClass}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        data-testid="input-location-address-en"
                      />
                    </FormControl>
                    {incomplete && (
                      <FormDescription
                        className="flex items-start gap-1.5 text-amber-300"
                        data-testid="warning-address-en-incomplete"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{t("addressIncompleteWarning")}</span>
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="addressHe"
              render={({ field }) => {
                const incomplete = !looksLikeStreetAddress(field.value);
                return (
                  <FormItem>
                    <FormLabel className={labelClass}>עברית</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="rtl"
                        className={inputClass}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        data-testid="input-location-address-he"
                      />
                    </FormControl>
                    {incomplete && (
                      <FormDescription
                        className="flex items-start gap-1.5 text-amber-300"
                        dir="rtl"
                        data-testid="warning-address-he-incomplete"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>{t("addressIncompleteWarning")}</span>
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </BilingualPair>

          <FormField
            control={form.control}
            name="zipCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("zipCodeOptional")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className={`${inputClass} max-w-[14rem]`}
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {location && <CoordinatesSection location={location} />}

        <div className="space-y-3">
          <SectionHeading icon={Phone} label={t("contactInfoSection")} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => {
                const mergedRef = (el: HTMLInputElement | null) => {
                  (phoneInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
                  field.ref(el);
                };
                return (
                  <FormItem>
                    <FormLabel className={labelClass}>{t("phoneLabel")}</FormLabel>
                    <FormControl>
                      <IconInputWrapper icon={Phone}>
                        <Input
                          {...field}
                          ref={mergedRef}
                          className={`${iconInputClass} ${focusPhone ? "ring-2 ring-orange-400 ring-offset-1" : ""}`}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </IconInputWrapper>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>{t("emailLabel2")}</FormLabel>
                  <FormControl>
                    <IconInputWrapper icon={Mail}>
                      <Input
                        type="email"
                        {...field}
                        className={iconInputClass}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </IconInputWrapper>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeading icon={Globe} label={t("locationSettingsSection")} />

          <FormField
            control={form.control}
            name="regionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("region")}</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(parseInt(value, 10))}
                  value={field.value?.toString() || ""}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 text-sm border-border/70 hover:border-border transition-colors">
                      <SelectValue placeholder={t("selectARegion")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region.id} value={region.id.toString()}>
                        {region.nameHe || region.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cityCategoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>Community</FormLabel>
                <div className="flex items-center gap-2">
                  <Select
                    onValueChange={(value) => {
                      if (value === "__new__") {
                        setCommunityDialogOpen(true);
                        return;
                      }
                      field.onChange(value === "__none__" ? null : parseInt(value, 10));
                    }}
                    value={field.value ? String(field.value) : "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger className="h-11 text-sm border-border/70 hover:border-border transition-colors">
                        <SelectValue placeholder="Select a community" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {filteredCommunities.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}{c.stateCode ? ` (${c.stateCode})` : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">+ Add new community…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="depositAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("depositAmountDollar")}</FormLabel>
                <FormControl>
                  <IconInputWrapper icon={DollarSign}>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      className={`${iconInputClass} max-w-[10rem]`}
                      value={field.value || 20}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 20)}
                    />
                  </IconInputWrapper>
                </FormControl>
                <FormDescription className="text-xs">
                  {t("depositAmountDesc")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactPreference"
            render={({ field }) => (
              <FormItem className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-4">
                <div>
                  <FormLabel className="text-sm font-medium">Preferred contact channel</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    How borrowers should reach this gemach by default.
                  </p>
                </div>
                <FormControl>
                  <RadioGroup
                    value={field.value ?? ""}
                    onValueChange={(v) => field.onChange(v || null)}
                    className="grid grid-cols-3 gap-2 pt-1"
                  >
                    {OPERATOR_CONTACT_PREFERENCES.map((pref) => {
                      const Icon = pref === "phone" ? Phone : pref === "whatsapp" ? MessageCircle : Mail;
                      const label = pref === "phone" ? "Phone" : pref === "whatsapp" ? "WhatsApp" : "Email";
                      return (
                        <FormItem
                          key={pref}
                          className="flex items-center gap-2 space-y-0 rounded-md border border-border/60 bg-background/40 px-3 py-2"
                        >
                          <FormControl>
                            <RadioGroupItem value={pref} id={`contact-pref-${pref}`} />
                          </FormControl>
                          <FormLabel htmlFor={`contact-pref-${pref}`} className="flex items-center gap-1.5 text-sm font-normal cursor-pointer">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {label}
                          </FormLabel>
                        </FormItem>
                      );
                    })}
                  </RadioGroup>
                </FormControl>
                {field.value && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    onClick={() => field.onChange(null)}
                  >
                    Clear preference
                  </button>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="paymentMethods"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("paymentMethodsLabel")}</FormLabel>
                <FormDescription className="text-xs">
                  {t("paymentMethodsDesc")}
                </FormDescription>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {[
                    { id: "cash" },
                    { id: "stripe" },
                    { id: "paypal" },
                    { id: "square" }
                  ].map((method) => (
                    <FormItem key={method.id} className="flex flex-row items-center gap-2.5 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(method.id) || false}
                          onCheckedChange={(checked) => {
                            const currentMethods = field.value || ["cash"];
                            if (checked) {
                              field.onChange([...currentMethods, method.id]);
                            } else {
                              field.onChange(currentMethods.filter((m) => m !== method.id));
                            }
                          }}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        {paymentMethodLabels[method.id]}
                      </FormLabel>
                    </FormItem>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Card processing fees</p>
              <p className="text-xs text-muted-foreground">
                Applied on top of the deposit when the borrower pays by card. Defaults cover Stripe's standard rate.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="processingFeePercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClass}>Percentage fee</FormLabel>
                    <FormControl>
                      <IconInputWrapper icon={Percent}>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className={iconInputClass}
                          value={field.value != null ? (field.value / 100).toFixed(2) : ""}
                          onChange={(e) => {
                            const pct = parseFloat(e.target.value);
                            field.onChange(Number.isFinite(pct) ? Math.round(pct * 100) : 0);
                          }}
                        />
                      </IconInputWrapper>
                    </FormControl>
                    <FormDescription className="text-xs">
                      e.g. 3.00 for 3%. Stored as basis points.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="processingFeeFixed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={labelClass}>Fixed fee per transaction</FormLabel>
                    <FormControl>
                      <IconInputWrapper icon={DollarSign}>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className={iconInputClass}
                          value={field.value != null ? (field.value / 100).toFixed(2) : ""}
                          onChange={(e) => {
                            const dollars = parseFloat(e.target.value);
                            field.onChange(Number.isFinite(dollars) ? Math.round(dollars * 100) : 0);
                          }}
                        />
                      </IconInputWrapper>
                    </FormControl>
                    <FormDescription className="text-xs">
                      e.g. 0.30 for 30¢. Stored as cents.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">{t("activeStatus")}</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {t("activeStatusDesc")}
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cashOnly"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">{t("cashOnlyLegacy")}</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {t("cashOnlyLegacyDesc")}
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 border-t border-border/60 bg-background z-10">
          <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                {location ? t("updating") : t("creating")}
              </>
            ) : location ? t("updateLocation") : t("createLocation")}
          </Button>
        </div>

      </form>

      <Dialog open={communityDialogOpen} onOpenChange={setCommunityDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Community</DialogTitle>
            <DialogDescription>
              Create a new community to assign to this location.
            </DialogDescription>
          </DialogHeader>
          <CommunityForm
            regions={regions}
            communities={communities}
            defaultRegionId={watchedRegionId}
            onSuccess={(created) => {
              if (created?.id) {
                form.setValue("cityCategoryId", created.id, { shouldDirty: true });
              }
              setCommunityDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </Form>
  );
}
