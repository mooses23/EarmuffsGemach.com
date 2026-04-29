import React, { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertLocationSchema } from "@/lib/types";
import type { InsertLocation, Location } from "@/lib/types";
import { createLocation, updateLocation } from "@/lib/api";
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
import { LoaderCircle, Phone, Mail, DollarSign, MapPin, User, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LocationFormProps {
  location?: Location;
  regions: { id: number; name: string }[];
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
      isActive: location.isActive ?? true,
      cashOnly: location.cashOnly || false,
      depositAmount: location.depositAmount || 20,
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
      isActive: true,
      cashOnly: false,
      depositAmount: 20,
    },
  });

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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ── Gemach Name ── */}
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

        {/* ── Contact Person ── */}
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

        {/* ── Address ── */}
        <div className="space-y-3">
          <SectionHeading icon={MapPin} label={t("addressLabel")} />
          <BilingualPair>
            <FormField
              control={form.control}
              name="address"
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
              name="addressHe"
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

        {/* ── Contact Info ── */}
        <div className="space-y-3">
          <SectionHeading icon={Phone} label="Contact Info" />
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

        {/* ── Settings ── */}
        <div className="space-y-4">
          <SectionHeading icon={Globe} label="Settings" />

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
                        {(region as any).nameHe || region.name}
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

        {/* ── Submit ── */}
        <div className="border-t border-border/60 pt-4">
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
    </Form>
  );
}
