import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createRegion, updateRegion } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
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
import { LoaderCircle, Globe, Settings, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface Region {
  id: number;
  name: string;
  nameHe: string | null;
  slug: string;
  displayOrder: number;
}

interface RegionFormProps {
  region?: Region;
  onSuccess?: () => void;
}

const regionFormSchema = z.object({
  name: z.string().min(1, "Region name is required"),
  nameHe: z.string().optional(),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens"),
  displayOrder: z.number().int().min(0),
});

type RegionFormData = z.infer<typeof regionFormSchema>;

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
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
  "h-11 px-3 text-sm border-border/70 transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0";

const labelClass = "text-xs font-medium text-muted-foreground";

export function RegionForm({ region, onSuccess }: RegionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const form = useForm<RegionFormData>({
    resolver: zodResolver(regionFormSchema),
    defaultValues: region ? {
      name: region.name,
      nameHe: region.nameHe ?? "",
      slug: region.slug,
      displayOrder: region.displayOrder,
    } : {
      name: "",
      nameHe: "",
      slug: "",
      displayOrder: 0,
    },
  });

  const watchedName = form.watch("name");
  React.useEffect(() => {
    if (!region) {
      const slug = watchedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      form.setValue("slug", slug, { shouldValidate: false });
    }
  }, [watchedName, region, form]);

  const createMutation = useMutation({
    mutationFn: (data: RegionFormData) => createRegion(data),
    onSuccess: () => {
      toast({ title: "Success", description: "Region created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/regions"] });
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to create region: ${error.message}`, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: RegionFormData) => updateRegion(region!.id, data),
    onSuccess: () => {
      toast({ title: "Success", description: "Region updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/regions"] });
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({ title: "Error", description: `Failed to update region: ${error.message}`, variant: "destructive" });
    },
  });

  const onSubmit = (data: RegionFormData) => {
    if (region) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const fieldLabels: Record<string, string> = {
    name: "Region Name (English)",
    nameHe: "Region Name (עברית)",
    slug: "URL Slug",
    displayOrder: "Display Order",
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

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
          <SectionHeading icon={Globe} label="Region Name" />
          <BilingualPair>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>English</FormLabel>
                  <FormControl>
                    <Input {...field} className={inputClass} placeholder="e.g., North America" />
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
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="לדוגמה: אמריקה הצפונית"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </BilingualPair>
        </div>

        <div className="space-y-3">
          <SectionHeading icon={Settings} label="Configuration" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>URL Slug</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className={inputClass}
                      placeholder="e.g., north-america"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Auto-generated from the name. Lowercase, hyphens only.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>Display Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className={inputClass}
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Lower numbers appear first.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="border-t border-border/60 pt-4">
          <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                {region ? "Updating…" : "Creating…"}
              </>
            ) : region ? "Update Region" : "Create Region"}
          </Button>
        </div>

      </form>
    </Form>
  );
}
