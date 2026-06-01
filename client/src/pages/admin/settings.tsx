import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TaxonomyPanel } from "@/components/admin/taxonomy-panel";
import type { Region, Location } from "@shared/schema";
import {
  CreditCard, Bell, Globe, ImageIcon, MapPin, Save, Upload, AlertTriangle, Loader2,
} from "lucide-react";
import { RotateCcw as ResetIcon } from "lucide-react";

interface StripeAdminSettings {
  maxCardAgeDays: number;
  requirePreChargeNotification: boolean;
  globalFeePercentBp: number;
  globalFeeFixedCents: number;
  locationFees: { locationId: number; name: string; processingFeePercent: number; processingFeeFixed: number }[];
}

function StripeSettingsForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<StripeAdminSettings>({
    queryKey: ["/api/admin/settings/stripe"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/stripe", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load Stripe settings");
      return res.json();
    },
  });

  const [maxCardAgeDays, setMaxCardAgeDays] = useState<string>("");
  const [requireNotify, setRequireNotify] = useState<boolean>(true);
  const [globalFeePercentBp, setGlobalFeePercentBp] = useState<string>("");
  const [globalFeeFixedCents, setGlobalFeeFixedCents] = useState<string>("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setMaxCardAgeDays(String(data.maxCardAgeDays));
      setRequireNotify(data.requirePreChargeNotification);
      setGlobalFeePercentBp(data.globalFeePercentBp != null ? String(data.globalFeePercentBp) : "");
      setGlobalFeeFixedCents(data.globalFeeFixedCents != null ? String(data.globalFeeFixedCents) : "");
      setSeeded(true);
    }
  }, [data, seeded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        maxCardAgeDays: Number(maxCardAgeDays),
        requirePreChargeNotification: requireNotify,
      };
      const trimmedPct = globalFeePercentBp.trim();
      const trimmedFixed = globalFeeFixedCents.trim();
      body.globalFeePercentBp = trimmedPct === "" ? null : Number(trimmedPct);
      body.globalFeeFixedCents = trimmedFixed === "" ? null : Number(trimmedFixed);
      const res = await apiRequest("PATCH", "/api/admin/settings/stripe", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/stripe"] });
      setSeeded(false);
      toast({ title: "Saved", description: "Global Stripe settings updated." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Max card age (days)</label>
          <Input
            type="number" min={1} max={365}
            value={maxCardAgeDays}
            onChange={e => setMaxCardAgeDays(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">Cards older than this are blocked from off-session charges (default 90).</p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Require pre-charge notification</label>
          <div className="flex items-center gap-2 mt-2">
            <Switch checked={requireNotify} onCheckedChange={setRequireNotify} data-testid="switch-require-notify" />
            <span className="text-sm">{requireNotify ? "Enforced (default)" : "Best-effort (disabled)"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">When on, charges are blocked if the borrower cannot be notified.</p>
        </div>
      </div>
      <div className="border-t pt-4">
        <p className="text-sm font-medium mb-1">Global Stripe fee override</p>
        <p className="text-xs text-muted-foreground mb-3">
          Applied to every Stripe deposit. When set, takes priority over per-location fee. Leave blank to fall back to per-location config (default 3.00% + $0.30).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Percent fee (basis points)</label>
            <Input
              type="number" min={0} max={10000}
              placeholder="e.g. 290 for 2.9%"
              value={globalFeePercentBp}
              onChange={e => setGlobalFeePercentBp(e.target.value)}
              data-testid="input-global-fee-percent-bp"
            />
            <p className="text-xs text-muted-foreground mt-1">100 bp = 1%. Stripe US standard is 290.</p>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Fixed fee (cents)</label>
            <Input
              type="number" min={0} max={9999}
              placeholder="e.g. 30 for $0.30"
              value={globalFeeFixedCents}
              onChange={e => setGlobalFeeFixedCents(e.target.value)}
              data-testid="input-global-fee-fixed-cents"
            />
            <p className="text-xs text-muted-foreground mt-1">Stripe US standard is 30 ($0.30).</p>
          </div>
        </div>
      </div>
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        <Save className="h-4 w-4 mr-2" />
        {saveMutation.isPending ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}

function NotificationSettingsForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ adminEmail: string; effectiveEmail: string; source: "db" | "env" | "none" }>({
    queryKey: ["/api/admin/settings/notifications"],
  });

  const [emailValue, setEmailValue] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setEmailValue(data.adminEmail);
      setSeeded(true);
    }
  }, [data, seeded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/admin/settings/notifications", { adminEmail: emailValue });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/notifications"] });
      setSeeded(false);
      toast({ title: "Saved", description: "Admin notification email updated." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <label className="block text-xs font-medium mb-1">Admin alert email</label>
        <Input
          type="email"
          placeholder="admin@example.com"
          value={emailValue}
          onChange={e => setEmailValue(e.target.value)}
          data-testid="input-admin-notification-email"
        />
        <p className="text-xs text-muted-foreground mt-1">
          New application alerts and system notifications are sent to this address.
          Falls back to the <code className="bg-muted px-0.5 rounded">ADMIN_EMAIL</code> or <code className="bg-muted px-0.5 rounded">GMAIL_USER</code> environment variable if left empty.
        </p>
        {data && data.source !== "none" && (
          <p className="text-xs mt-1 text-muted-foreground" data-testid="effective-email-note">
            Currently sending to:{" "}
            <span className="font-medium text-foreground">{data.effectiveEmail}</span>
            {" "}
            <span className="text-muted-foreground">
              ({data.source === "db" ? "saved" : "from environment"})
            </span>
          </p>
        )}
        {data && data.source === "none" && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 mt-1" data-testid="no-notification-email-warning">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            No notification address configured — alerts are not being delivered.
          </div>
        )}
      </div>
      <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-notification-settings">
        <Save className="h-4 w-4 mr-2" />
        {saveMutation.isPending ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}

function HeroPhotoForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data, isLoading } = useQuery<{ url: string | null }>({
    queryKey: ["/api/site/hero-image"],
  });

  const currentUrl = data?.url ?? null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/admin/site/hero-image", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/site/hero-image"] });
      toast({ title: "Photo updated", description: "The hero portrait has been replaced." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch("/api/admin/site/hero-image", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Reset failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/site/hero-image"] });
      toast({ title: "Reset to default", description: "The static portrait has been restored." });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Replace the portrait shown on the home page. Upload any JPG, PNG, or WebP image (max 5 MB).
      </p>
      <div className="flex items-center gap-4">
        <div className="rounded-xl overflow-hidden border flex-shrink-0" style={{ width: 80, height: 80 }}>
          {currentUrl ? (
            <img src={currentUrl} alt="Current hero" className="w-full h-full object-cover" style={{ objectPosition: "50% 12%" }} />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{currentUrl ? "Custom photo is active" : "Using static default photo"}</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading || resetting} data-testid="button-upload-hero-photo">
              {uploading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Uploading…</> : <><Upload className="h-3.5 w-3.5 mr-1.5" />Upload new photo</>}
            </Button>
            {currentUrl && (
              <Button size="sm" variant="ghost" onClick={handleReset} disabled={uploading || resetting} data-testid="button-reset-hero-photo">
                {resetting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Resetting…</> : <><ResetIcon className="h-3.5 w-3.5 mr-1.5" />Reset to default</>}
              </Button>
            )}
          </div>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} data-testid="input-hero-photo-file" />
    </div>
  );
}

function DomainSettingsForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ forceWww: boolean }>({
    queryKey: ["/api/admin/settings/domain"],
  });

  const [forceWww, setForceWww] = useState<boolean>(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setForceWww(data.forceWww);
      setSeeded(true);
    }
  }, [data, seeded]);

  const saveMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await apiRequest("PATCH", "/api/admin/settings/domain", { forceWww: value });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/domain"] });
      setSeeded(false);
      toast({ title: "Saved", description: "Domain link setting updated." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleToggle(value: boolean) {
    const prev = forceWww;
    setForceWww(value);
    saveMutation.mutate(value, { onError: () => setForceWww(prev) });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div>
      <label className="block text-xs font-medium mb-1">Force www prefix on outgoing links</label>
      <div className="flex items-center gap-2 mt-2">
        <Switch checked={forceWww} onCheckedChange={handleToggle} disabled={saveMutation.isPending} data-testid="switch-force-www" />
        <span className="text-sm">
          {saveMutation.isPending ? "Saving…" : forceWww ? "On — rewriting to www.earmuffsgemach.com" : "Off — links sent as-is"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        When on, any link to earmuffsgemach.com in AI drafts and outbound replies is automatically rewritten to www.earmuffsgemach.com before sending. Turn off once DNS is fixed.
      </p>
    </div>
  );
}

export default function AdminSettings() {
  const { t } = useLanguage();
  const { data: regions = [] } = useQuery<Region[]>({ queryKey: ["/api/regions"] });
  const { data: locations = [] } = useQuery<Location[]>({ queryKey: ["/api/locations"] });
  const [taxonomyOpen, setTaxonomyOpen] = useState(false);

  return (
    <>
      <TaxonomyPanel
        open={taxonomyOpen}
        onOpenChange={setTaxonomyOpen}
        regions={regions}
        locations={locations}
      />

      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm md:text-base">Stripe, notifications, domain, hero photo, and region taxonomy.</p>
      </div>

      <Tabs defaultValue="stripe" className="space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full gap-1 h-auto">
          <TabsTrigger value="stripe" className="text-xs">
            <CreditCard className="h-3.5 w-3.5 mr-1" />Stripe
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs">
            <Bell className="h-3.5 w-3.5 mr-1" />Notify
          </TabsTrigger>
          <TabsTrigger value="domain" className="text-xs">
            <Globe className="h-3.5 w-3.5 mr-1" />Domain
          </TabsTrigger>
          <TabsTrigger value="hero" className="text-xs">
            <ImageIcon className="h-3.5 w-3.5 mr-1" />Photo
          </TabsTrigger>
          <TabsTrigger value="regions" className="text-xs">
            <MapPin className="h-3.5 w-3.5 mr-1" />Regions
          </TabsTrigger>
        </TabsList>

        <div className="glass-panel p-6 rounded-2xl">
          <TabsContent value="stripe">
            <StripeSettingsForm />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationSettingsForm />
          </TabsContent>
          <TabsContent value="domain">
            <DomainSettingsForm />
          </TabsContent>
          <TabsContent value="hero">
            <HeroPhotoForm />
          </TabsContent>
          <TabsContent value="regions" className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Manage the regions and communities used to group locations across the public site.
            </p>
            <button
              onClick={() => setTaxonomyOpen(true)}
              className="btn-glass-outline px-4 py-2 rounded-xl flex items-center gap-2 text-sm"
              data-testid="button-open-taxonomy"
            >
              <Globe className="h-4 w-4" />Open Regions &amp; Communities
            </button>
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}
