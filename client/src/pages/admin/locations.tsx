import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getRegions, updateLocation, deleteLocation } from "@/lib/api";
import { Region, Location, CityCategory, OPERATOR_WELCOME_CHANNELS, type OperatorWelcomeChannel } from "@shared/schema";
import { localizeIsraelDistrict, IL_DISTRICT_ORDER } from "@/lib/location-names";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LocationForm } from "@/components/admin/location-form";
import { BilingualValue } from "@/components/admin/bilingual-value";
import { RegionForm } from "@/components/admin/region-form";
import { TaxonomyPanel } from "@/components/admin/taxonomy-panel";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Search,
  Edit,
  MoreVertical,
  MapPin,
  Phone,
  Mail,
  ArrowLeft,
  Home,
  Trash2,
  Building2,
  CheckCircle,
  XCircle,
  Loader2,
  KeyRound,
  ShieldCheck,
  Send,
  MessageSquare,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Wifi,
  WifiOff,
  CreditCard,
  Save,
  Settings,
  Bell,
  Globe,
  Info,
  Clock,
  MinusCircle,
  ChevronUp,
  DollarSign,
  BarChart3,
  ImageIcon,
  Upload,
  RotateCcw as ResetIcon,
  Package,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ---- Helper sub-components ----

function CommunityJumpPopover({
  regionId,
  regionName,
  communityGroups,
  language,
  uncategorizedLabel,
  onSelect,
}: {
  regionId: number;
  regionName: string;
  communityGroups: { cityCategory: CityCategory | null; locations: Location[] }[];
  language: string;
  uncategorizedLabel: string;
  onSelect: (cityCategoryId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center px-1.5 border-l rtl:border-l-0 rtl:border-r text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Show communities in ${regionName}`}
          data-testid={`pill-region-${regionId}-communities`}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2 z-50"
        data-testid={`popover-communities-${regionId}`}
      >
        <div className="flex flex-wrap gap-1.5">
          {communityGroups.map(({ cityCategory, locations: locs }) => {
            const ccName = cityCategory
              ? (language === "he" && cityCategory.nameHe ? cityCategory.nameHe : cityCategory.name)
              : uncategorizedLabel;
            const key = cityCategory?.id ?? "none";
            return (
              <button
                key={key}
                onClick={() => {
                  onSelect(cityCategory?.id ?? null);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground hover:border-secondary"
                data-testid={`chip-community-${regionId}-${key}`}
              >
                {ccName}
                <span className="text-[10px] opacity-70">({locs.length})</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}


function NoPhoneBadge({ onClick }: { onClick?: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-xs border-orange-400 text-orange-700 bg-orange-50 ${onClick ? "cursor-pointer hover:bg-orange-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" : "cursor-help"}`}
            onClick={onClick}
            {...(onClick ? {
              role: "button",
              tabIndex: 0,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              },
            } : {})}
          >
            <Phone className="h-3 w-3 mr-1" />
            No phone
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          {onClick
            ? "Click to add a phone number to this location."
            : "This location has no phone number. SMS and WhatsApp messages cannot be sent until a phone number is added."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface StripeAdminSettings {
  maxCardAgeDays: number;
  requirePreChargeNotification: boolean;
  globalFeePercentBp: number;
  globalFeeFixedCents: number;
  locationFees: { locationId: number; name: string; processingFeePercent: number; processingFeeFixed: number }[];
}

function LocationStripeFeeSection({ locationId }: { locationId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<StripeAdminSettings>({
    queryKey: ["/api/admin/settings/stripe"],
    queryFn: async () => {
      const res = await fetch("/api/admin/settings/stripe", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load Stripe settings");
      return res.json();
    },
  });

  const locationFee = data?.locationFees?.find(f => f.locationId === locationId);

  const [feePercent, setFeePercent] = useState<string>("");
  const [feeFixed, setFeeFixed] = useState<string>("");

  useEffect(() => {
    if (locationFee) {
      setFeePercent(String(locationFee.processingFeePercent));
      setFeeFixed(String(locationFee.processingFeeFixed));
    } else {
      setFeePercent("");
      setFeeFixed("");
    }
  }, [locationFee?.processingFeePercent, locationFee?.processingFeeFixed, locationId]);

  const feePercentNum = Number(feePercent);
  const feeFixedNum = Number(feeFixed);
  const isInvalid = !Number.isFinite(feePercentNum) || !Number.isFinite(feeFixedNum) || feePercent === "" || feeFixed === "";

  const feePreview = (!isInvalid)
    ? `${(feePercentNum / 100).toFixed(2)}% + $${(feeFixedNum / 100).toFixed(2)} per transaction`
    : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/admin/settings/stripe", {
        locationFees: [{
          locationId,
          processingFeePercent: feePercentNum,
          processingFeeFixed: feeFixedNum,
        }],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/stripe"] });
      toast({ title: "Saved", description: "Processing fee updated." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="mt-6 rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Stripe processing fee</span>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading fee…</p>
      ) : isError ? (
        <p className="text-xs text-destructive">Could not load fee settings. Refresh and try again.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">% rate (basis points)</label>
              <Input
                type="number"
                min={0}
                max={10000}
                value={feePercent}
                onChange={e => setFeePercent(e.target.value)}
                title="Basis points: 290 = 2.90%"
              />
              <p className="text-xs text-muted-foreground mt-0.5">e.g. 290 = 2.90%</p>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Fixed fee (cents)</label>
              <Input
                type="number"
                min={0}
                max={9999}
                value={feeFixed}
                onChange={e => setFeeFixed(e.target.value)}
                title="Cents: 30 = $0.30"
              />
              <p className="text-xs text-muted-foreground mt-0.5">e.g. 30 = $0.30</p>
            </div>
          </div>
          {feePreview && (
            <p className="text-sm font-medium text-foreground">
              Current fee: <span className="text-primary">{feePreview}</span>
            </p>
          )}
        </>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending || isLoading || isError || isInvalid}
      >
        <Save className="h-3.5 w-3.5 mr-1.5" />
        {saveMutation.isPending ? "Saving…" : "Save fee"}
      </Button>
    </div>
  );
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
      // Send null when blank so the backend clears the override and we fall back
      // to per-location config / defaults.
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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1">Max card age (days)</label>
          <Input
            type="number"
            min={1}
            max={365}
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
              type="number"
              min={0}
              max={10000}
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
              type="number"
              min={0}
              max={9999}
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
      const res = await apiRequest("PATCH", "/api/admin/settings/notifications", {
        adminEmail: emailValue,
      });
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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
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
          <div
            className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 mt-1"
            data-testid="no-notification-email-warning"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            No notification address configured — alerts are not being delivered.
          </div>
        )}
      </div>
      <Button
        size="sm"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        data-testid="button-save-notification-settings"
      >
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
      const res = await fetch("/api/admin/site/hero-image", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
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
      const res = await fetch("/api/admin/site/hero-image", {
        method: "DELETE",
        credentials: "include",
      });
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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Replace the portrait shown on the home page. Upload any JPG, PNG, or WebP image (max 5 MB). When no custom photo is set the original static image is used.
      </p>

      <div className="flex items-center gap-4">
        <div
          className="rounded-xl overflow-hidden border flex-shrink-0"
          style={{ width: 80, height: 80 }}
        >
          {currentUrl ? (
            <img src={currentUrl} alt="Current hero" className="w-full h-full object-cover" style={{ objectPosition: '50% 12%' }} />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {currentUrl ? "Custom photo is active" : "Using static default photo"}
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || resetting}
              data-testid="button-upload-hero-photo"
            >
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="h-3.5 w-3.5 mr-1.5" /> Upload new photo</>
              )}
            </Button>
            {currentUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                disabled={uploading || resetting}
                data-testid="button-reset-hero-photo"
              >
                {resetting ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Resetting…</>
                ) : (
                  <><ResetIcon className="h-3.5 w-3.5 mr-1.5" /> Reset to default</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        data-testid="input-hero-photo-file"
      />
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
    saveMutation.mutate(value, {
      onError: () => setForceWww(prev),
    });
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  return (
    <div>
      <label className="block text-xs font-medium mb-1">Force www prefix on outgoing links</label>
      <div className="flex items-center gap-2 mt-2">
        <Switch
          checked={forceWww}
          onCheckedChange={handleToggle}
          disabled={saveMutation.isPending}
          data-testid="switch-force-www"
        />
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

function LocationSettingsSheet({
  open,
  onOpenChange,
  onManageRegions,
  initialTab,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onManageRegions: () => void;
  initialTab?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" /> Settings
          </SheetTitle>
          <SheetDescription>
            Stripe charge limits + fee override, notification email, domain link rewriting, hero photo, and region taxonomy.
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue={initialTab ?? "stripe"} className="mt-4">
          <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full gap-1 h-auto">
            <TabsTrigger value="stripe" className="text-xs">
              <CreditCard className="h-3.5 w-3.5 mr-1" /> Stripe
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs">
              <Bell className="h-3.5 w-3.5 mr-1" /> Notify
            </TabsTrigger>
            <TabsTrigger value="domain" className="text-xs">
              <Globe className="h-3.5 w-3.5 mr-1" /> Domain
            </TabsTrigger>
            <TabsTrigger value="hero" className="text-xs">
              <ImageIcon className="h-3.5 w-3.5 mr-1" /> Photo
            </TabsTrigger>
            <TabsTrigger value="regions" className="text-xs">
              <MapPin className="h-3.5 w-3.5 mr-1" /> Regions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="stripe" className="mt-4">
            <StripeSettingsForm />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationSettingsForm />
          </TabsContent>
          <TabsContent value="domain" className="mt-4">
            <DomainSettingsForm />
          </TabsContent>
          <TabsContent value="hero" className="mt-4">
            <HeroPhotoForm />
          </TabsContent>
          <TabsContent value="regions" className="mt-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Manage the regions and communities used to group locations across the public site.
              </p>
              <Button
                onClick={() => { onOpenChange(false); onManageRegions(); }}
                data-testid="button-open-taxonomy-from-settings"
              >
                <Globe className="h-4 w-4 mr-2" /> Open Regions &amp; Communities
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ServiceStatusBar({
  status,
  loading,
}: {
  status: { sms: { configured: boolean; reason?: string }; email?: { configured: boolean; reason?: string }; whatsapp: { configured: boolean; reason?: string } } | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking service status…
      </div>
    );
  }
  const items = [
    {
      label: "Twilio SMS",
      configured: status?.sms?.configured ?? false,
      reason: status?.sms?.reason,
    },
    {
      label: "Email",
      configured: status?.email?.configured ?? false,
      reason: status?.email?.reason,
    },
    {
      label: "WhatsApp",
      configured: status?.whatsapp?.configured ?? false,
      reason: status?.whatsapp?.reason,
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 py-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs">
          {item.configured ? (
            <Badge variant="outline" className="text-xs font-normal border-green-500 text-green-700 bg-green-50">
              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
              {item.label}
            </Badge>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs font-normal border-red-400 text-red-700 bg-red-50 cursor-help">
                    <WifiOff className="h-3 w-3 mr-1" />
                    {item.label}: Not configured
                  </Badge>
                </TooltipTrigger>
                {item.reason && (
                  <TooltipContent className="max-w-xs text-xs">{item.reason}</TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ))}
    </div>
  );
}

const ADMIN_COLOR_SWATCHES: Record<string, string> = {
  red: "#EF4444", blue: "#3B82F6", black: "#1F2937", white: "#F9FAFB",
  pink: "#EC4899", purple: "#8B5CF6", green: "#22C55E", orange: "#F97316",
  yellow: "#EAB308", gray: "#6B7280",
};

function InlineNameInputs({
  location,
  queryClient,
  t,
  language,
}: {
  location: Location;
  queryClient: ReturnType<typeof useQueryClient>;
  t: (key: string) => string;
  language: string;
}) {
  const { toast } = useToast();
  const [nameEn, setNameEn] = useState(location.name || "");
  const [nameHe, setNameHe] = useState(location.nameHe || "");
  useEffect(() => { setNameEn(location.name || ""); }, [location.name]);
  useEffect(() => { setNameHe(location.nameHe || ""); }, [location.nameHe]);

  const saveNameMut = useMutation({
    mutationFn: async (payload: { name?: string; nameHe?: string }) => {
      const res = await apiRequest("PATCH", `/api/locations/${location.id}`, payload);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/locations"] }),
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-1 mb-1">
      <div className="flex items-center gap-1">
        <Input
          value={nameEn}
          onChange={(e) => setNameEn(e.target.value)}
          onBlur={() => {
            const trimmed = nameEn.trim();
            if (trimmed && trimmed !== location.name) saveNameMut.mutate({ name: trimmed });
          }}
          placeholder={t("nameEn")}
          className="h-7 text-sm font-bold py-0 bg-transparent border-transparent hover:border-input focus:border-input px-1"
          data-testid={`input-name-en-${location.id}`}
        />
        {saveNameMut.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
      </div>
      {(language === "he" || nameHe) && (
        <Input
          value={nameHe}
          dir="rtl"
          onChange={(e) => setNameHe(e.target.value)}
          onBlur={() => {
            const trimmed = nameHe.trim();
            if (trimmed !== (location.nameHe || "")) saveNameMut.mutate({ nameHe: trimmed || undefined });
          }}
          placeholder={t("nameHe")}
          className="h-6 text-xs py-0 bg-transparent border-transparent hover:border-input focus:border-input px-1 text-foreground/60"
          data-testid={`input-name-he-${location.id}`}
        />
      )}
    </div>
  );
}

function AdminInventoryCircle({ color, quantity }: { color: string; quantity: number }) {
  const bgColor = ADMIN_COLOR_SWATCHES[color] || "#9CA3AF";
  const isLight = color === "white" || color === "yellow";
  return (
    <div
      className="relative w-6 h-6 rounded-full flex items-center justify-center"
      style={{
        backgroundColor: bgColor,
        boxShadow: "inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.12)",
        border: isLight ? "1px solid #d1d5db" : "none",
      }}
      title={`${color}: ${quantity}`}
    >
      <span
        className={`text-[9px] font-bold ${isLight ? "text-gray-700" : "text-white"}`}
        style={{ textShadow: isLight ? "none" : "0 1px 1px rgba(0,0,0,0.4)" }}
      >
        {quantity}
      </span>
    </div>
  );
}

interface AdminLocationCardProps {
  location: Location;
  regions: Region[];
  cityCategories: CityCategory[];
  language: string;
  t: (key: string) => string;
  isSelected: boolean;
  onToggleSelect: (id: number, checked: boolean) => void;
  onChangePin: (loc: Location) => void;
  onRestockEmail: (loc: Location) => void;
  onDelete: (loc: Location) => void;
  onSendWelcome: (loc: Location) => void;
  onEdit: (loc: Location) => void;
  regeocodeIsPending: boolean;
  regeocodeVariables: number | undefined;
  onRegeocodeClick: (id: number) => void;
}

function AdminLocationCard({
  location, regions, cityCategories, language, t,
  isSelected, onToggleSelect, onChangePin, onRestockEmail,
  onDelete, onSendWelcome, onEdit: _onEdit,
  regeocodeIsPending, regeocodeVariables, onRegeocodeClick,
}: AdminLocationCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phoneValue, setPhoneValue] = useState(location.phone || "");
  const [emailValue, setEmailValue] = useState(location.email || "");
  const [addressValue, setAddressValue] = useState(location.address || "");
  const [addressHeValue, setAddressHeValue] = useState((location as any).addressHe || "");

  useEffect(() => { setPhoneValue(location.phone || ""); }, [location.phone]);
  useEffect(() => { setEmailValue(location.email || ""); }, [location.email]);
  useEffect(() => { setAddressValue(location.address || ""); }, [location.address]);
  useEffect(() => { setAddressHeValue((location as any).addressHe || ""); }, [(location as any).addressHe]);

  const { data: inventoryData } = useQuery<{ inventory: { color: string; quantity: number }[]; total: number }>({
    queryKey: ["/api/locations", location.id, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${location.id}/inventory`);
      if (!res.ok) return { inventory: [], total: 0 };
      return res.json();
    },
  });
  const inventory = (inventoryData?.inventory ?? []).filter((i) => i.quantity > 0);

  const savePhoneMut = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiRequest("PATCH", `/api/locations/${location.id}`, { phone });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/locations"] }),
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
  });

  const saveEmailMut = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("PATCH", `/api/locations/${location.id}`, { email });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/locations"] }),
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
  });

  const saveAddressMut = useMutation({
    mutationFn: async (payload: { address: string; addressHe?: string }) => {
      const res = await apiRequest("PATCH", `/api/locations/${location.id}`, payload);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/locations"] }),
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
  });

  const cardToggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => updateLocation(id, { isActive }),
    onSuccess: () => {
      toast({ title: t("statusUpdated"), description: t("statusUpdateSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
    onError: (err: Error) => toast({ title: t("error"), description: err.message, variant: "destructive" }),
  });

  const isOnboarded = !!location.operatorPin && location.operatorPin !== "1234";
  const hasCoords = location.latitude != null && location.longitude != null;
  const hasAddress = !!(location.address || "").trim();
  const isRegeocodePending = regeocodeIsPending && regeocodeVariables === location.id;

  const region = regions.find((r) => r.id === location.regionId);
  const cc = location.cityCategoryId ? cityCategories.find((c) => c.id === location.cityCategoryId) : null;
  const locName = language === "he" && location.nameHe ? location.nameHe : location.name;
  const cleanPhone = (phone: string) => phone.replace(/[^+\d]/g, "");
  const prefillMsg = encodeURIComponent(`Hi, I'd like to borrow earmuffs from ${locName}`);
  const locContactPerson = language === "he" && (location as any).contactPersonHe ? (location as any).contactPersonHe : location.contactPerson;

  return (
    <div
      className={`glass-card p-5 rounded-2xl relative overflow-hidden transition-all duration-300 border ${
        isSelected
          ? "border-primary/50 bg-primary/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
          : "border-white/10 hover:border-white/20"
      }`}
      data-testid={`card-location-${location.id}`}
    >
      {/* Header: checkbox + bilingual name + code badges + action menu */}
      <div className="flex items-start gap-3 mb-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(v) => onToggleSelect(location.id, !!v)}
          className="mt-1 w-4 h-4 shrink-0"
          data-testid={`checkbox-location-${location.id}`}
        />
        <div className="flex-1 min-w-0">
          <InlineNameInputs location={location} queryClient={queryClient} t={t} language={language} />
          <div className="flex flex-wrap gap-1 mt-1">
            {location.locationCode && (
              <Badge variant="outline" className="text-xs font-mono py-0">{location.locationCode}</Badge>
            )}
            {!location.cityCategoryId && (
              <Badge className="text-[10px] py-0 bg-amber-500/15 text-amber-300 border border-amber-500/30 gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />{t("noCommunity")}
              </Badge>
            )}
            {region?.slug === "israel" && cc && !cc.districtCode && (
              <Badge className="text-[10px] py-0 bg-amber-500/15 text-amber-300 border border-amber-500/30 gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />{t("noDistrict")}
              </Badge>
            )}
            {region?.slug === "united-states" && cc && !cc.stateCode && (
              <Badge className="text-[10px] py-0 bg-amber-500/15 text-amber-300 border border-amber-500/30 gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />{t("noState")}
              </Badge>
            )}
            {region?.slug === "israel" && cc?.districtCode && (
              <Badge className="text-[10px] py-0 bg-blue-500/15 text-blue-300 border border-blue-500/30">
                {localizeIsraelDistrict(language as "en" | "he", cc.districtCode)}
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              data-testid={`menu-location-${location.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChangePin(location)}>
              <KeyRound className="mr-2 h-4 w-4" />{t("changePin")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRestockEmail(location)} disabled={!location.email}>
              <Mail className="mr-2 h-4 w-4" />{t("sendRestockEmail")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSendWelcome(location)}>
              <Send className="mr-2 h-4 w-4" />{t("sendWelcome")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(location)} className="text-red-500 focus:text-red-500">
              <Trash2 className="mr-2 h-4 w-4" />{t("deleteLocation")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Contact person */}
      <div className="flex items-center gap-2 text-sm mb-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate text-foreground/80">{locContactPerson}</span>
      </div>

      {/* Phone — always-visible inline input + contact action buttons */}
      <div className="flex items-center gap-2 mb-2">
        <Phone className={`h-4 w-4 shrink-0 ${!phoneValue ? "text-amber-400/70" : "text-muted-foreground"}`} />
        <Input
          type="tel"
          value={phoneValue}
          onChange={(e) => setPhoneValue(e.target.value)}
          onBlur={() => {
            const trimmed = phoneValue.trim();
            if (trimmed !== (location.phone || "")) savePhoneMut.mutate(trimmed);
          }}
          placeholder={t("phoneNumber")}
          className={`h-7 text-sm py-0 flex-1 ${!phoneValue ? "border-amber-400/50 focus:border-amber-400 placeholder:text-amber-400/50" : ""}`}
          data-testid={`input-phone-inline-${location.id}`}
        />
        {savePhoneMut.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
        {phoneValue && (
          <div className="flex items-center gap-0.5 shrink-0">
            <a href={`tel:${cleanPhone(phoneValue)}`} onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
              title={t("callAction")}><Phone className="h-3 w-3" /></a>
            <a href={`sms:${cleanPhone(phoneValue)}?body=${prefillMsg}`} onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 transition-colors"
              title={t("smsAction")}><MessageSquare className="h-3 w-3" /></a>
            <a href={`https://wa.me/${cleanPhone(phoneValue).replace(/^\+/, "")}?text=${prefillMsg}`}
              target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30 transition-colors"
              title={t("whatsappAction")}><SiWhatsapp className="h-3 w-3" /></a>
          </div>
        )}
      </div>

      {/* Email — always-visible inline input */}
      <div className="flex items-center gap-2 mb-2">
        <Mail className={`h-4 w-4 shrink-0 ${!emailValue ? "text-amber-400/70" : "text-muted-foreground"}`} />
        <Input
          type="email"
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          onBlur={() => {
            const trimmed = emailValue.trim();
            if (trimmed !== (location.email || "")) saveEmailMut.mutate(trimmed);
          }}
          placeholder={t("emailAddress")}
          className={`h-7 text-sm py-0 flex-1 ${!emailValue ? "border-amber-400/50 focus:border-amber-400 placeholder:text-amber-400/50" : ""}`}
          data-testid={`input-email-inline-${location.id}`}
        />
        {saveEmailMut.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
      </div>

      {/* Address (EN) — always-visible inline input */}
      <div className="flex items-start gap-2 mb-1">
        <MapPin className={`h-4 w-4 mt-1.5 shrink-0 ${!addressValue ? "text-amber-400/70" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            value={addressValue}
            onChange={(e) => setAddressValue(e.target.value)}
            onBlur={() => {
              const trimmed = addressValue.trim();
              if (trimmed !== (location.address || "")) saveAddressMut.mutate({ address: trimmed, addressHe: addressHeValue.trim() || undefined });
            }}
            placeholder={t("addressPlaceholder")}
            className={`h-7 text-sm py-0 w-full ${!addressValue ? "border-amber-400/50 focus:border-amber-400 placeholder:text-amber-400/50" : ""}`}
            data-testid={`input-address-inline-${location.id}`}
          />
        </div>
        {saveAddressMut.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0 mt-1.5" />}
        {addressValue && !hasCoords && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => onRegeocodeClick(location.id)} disabled={isRegeocodePending}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs px-1.5 py-0.5 hover:bg-amber-500/20 transition-colors disabled:opacity-60 shrink-0 mt-1"
                data-testid={`btn-regeocode-${location.id}`}>
                {isRegeocodePending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {t("regeocodeLabel")}
              </button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{t("regeocodeTooltip")}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {/* Address (HE) — shown when in Hebrew mode or when value exists */}
      {(language === "he" || addressHeValue) && (
        <div className="flex items-center gap-2 mb-2 pl-6">
          <Input
            type="text"
            dir="rtl"
            value={addressHeValue}
            onChange={(e) => setAddressHeValue(e.target.value)}
            onBlur={() => {
              const trimmed = addressHeValue.trim();
              if (trimmed !== ((location as any).addressHe || "")) saveAddressMut.mutate({ address: addressValue.trim(), addressHe: trimmed || undefined });
            }}
            placeholder={t("addressHe")}
            className="h-7 text-sm py-0 w-full"
            data-testid={`input-address-he-inline-${location.id}`}
          />
        </div>
      )}
      <div className="mb-3" />

      {/* Inventory circles */}
      <div className="flex items-center gap-2 mb-3">
        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        {inventory.length > 0 ? (
          <span className="flex items-center gap-1 flex-wrap">
            {inventory.map((item) => <AdminInventoryCircle key={item.color} color={item.color} quantity={item.quantity} />)}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs">{t("noStockData")}</span>
        )}
      </div>

      {/* Status row: Active toggle + onboarded + GPS + SMS failure */}
      <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={() => cardToggleStatus.mutate({ id: location.id, isActive: !location.isActive })}
          disabled={cardToggleStatus.isPending}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 ${
            location.isActive
              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
              : "bg-muted/50 text-muted-foreground border-white/10 hover:bg-muted"
          }`}
          data-testid={`btn-toggle-status-${location.id}`}
        >
          {cardToggleStatus.isPending
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : location.isActive ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />
          }
          {location.isActive ? t("active") : t("inactive")}
        </button>

        <Badge variant="outline" className={`border-transparent text-xs ${isOnboarded ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
          {isOnboarded ? <><ShieldCheck className="h-3 w-3 mr-1 inline-block" />{t("onboarded")}</> : t("notOnboarded")}
        </Badge>

        {hasCoords && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="border-transparent bg-emerald-500/10 text-emerald-400 gap-1 text-xs">
                <MapPin className="h-3 w-3" />{t("gps")}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{t("gpsTooltip")}</TooltipContent>
          </Tooltip>
        )}

        {(() => {
          const smsStatus = location.welcomeSmsStatus?.toLowerCase();
          const waStatus = location.welcomeWhatsappStatus?.toLowerCase();
          const smsIsFailed = smsStatus === "undelivered" || smsStatus === "failed";
          const waIsFailed = waStatus === "undelivered" || waStatus === "failed";
          if (!smsIsFailed && !waIsFailed) return null;
          const errorText = location.welcomeSmsError || location.welcomeWhatsappError || null;
          const failedLabel = smsIsFailed ? t("smsFailed") : t("whatsappFailed");
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-red-500/40 bg-red-500/15 text-red-300 cursor-help text-xs">
                  {failedLabel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {errorText || t("messageNotDelivered")}
              </TooltipContent>
            </Tooltip>
          );
        })()}
      </div>
    </div>
  );
}

export default function AdminLocations() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // Task #294: surface locations that have an address but no GPS coordinates,
  // so admins can fix them in bulk instead of opening each one to discover them.
  const [coordsFilter, setCoordsFilter] = useState<string>("all");
  const [onboardingFilter, setOnboardingFilter] = useState<string>(() => {
    try {
      return localStorage.getItem("adminOnboardingFilter") ?? "all";
    } catch {
      return "all";
    }
  });
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set());
  const regionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const cityCategoryRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editFocusPhone, setEditFocusPhone] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinLocation, setPinLocation] = useState<Location | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // ===== Restock email =====
  const [restockEmailTarget, setRestockEmailTarget] = useState<Location | null>(null);

  // ===== Bulk selection (for the main table) =====
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ===== Drill-in navigation =====
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [selectedCityCategoryId, setSelectedCityCategoryId] = useState<number | "all">("all");
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string | null>(null);

  // ===== Onboarding (SMS / Email welcome) =====
  const [isRegionDialogOpen, setIsRegionDialogOpen] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [welcomeTarget, setWelcomeTarget] = useState<{ kind: "single"; id: number; loc: Location } | { kind: "selected" } | { kind: "all-not-onboarded" } | null>(null);
  const [defaultChannel, setDefaultChannelState] = useState<OperatorWelcomeChannel>(() => {
    try {
      const stored = localStorage.getItem("adminDefaultWelcomeChannel");
      // "both" was removed from the UI picker; normalize any legacy stored value to "sms"
      if (stored === "both") return "sms";
      if (stored && (OPERATOR_WELCOME_CHANNELS as readonly string[]).includes(stored)) return stored as OperatorWelcomeChannel;
    } catch {}
    return "sms";
  });
  const [welcomeChannel, setWelcomeChannel] = useState<OperatorWelcomeChannel>(defaultChannel);
  const [rememberAsDefault, setRememberAsDefault] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageBodyInitialized, setMessageBodyInitialized] = useState(false);
  // Tracks whether admin has manually edited the message body.
  // When false → server uses its own built-in template. When true → server uses messageBody with token substitution.
  const [isCustomMessage, setIsCustomMessage] = useState(false);
  const [streamState, setStreamState] = useState<{ log: string; n: number; total: number } | null>(null);
  const [sendFailures, setSendFailures] = useState<Array<{ name: string; error: string }>>([]);
  const [sendReport, setSendReport] = useState<{ sent: number; failed: number; skipped: number; eligible?: number } | null>(null);
  // Broken-link warning state for bulk campaigns. The pending action is invoked
  // when the admin clicks "Send anyway" after seeing the warning.
  const [brokenLinkWarning, setBrokenLinkWarning] = useState<
    { links: { url: string; reason?: string }[]; onConfirm: () => void } | null
  >(null);
  const [linkCheckPending, setLinkCheckPending] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const sendRestockEmailMutation = useMutation({
    mutationFn: (locationId: number) =>
      apiRequest("POST", `/api/admin/locations/${locationId}/send-restock-email`),
    onSuccess: (_, locationId) => {
      const loc = restockEmailTarget;
      setRestockEmailTarget(null);
      toast({
        title: t('restockEmailSent'),
        description: t('restockEmailSentDesc').replace('{name}', loc?.name || String(locationId)),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-send-logs"] });
    },
    onError: (err) => {
      toast({ title: t('restockEmailFailed'), description: err instanceof Error ? err.message : '', variant: "destructive" });
    },
  });

  // Wraps all ADMIN-initiated edits to the message body (textarea onChanges).
  // Programmatic updates (preview load, channel change, template reset) call setMessageBody directly.
  const handleMessageBodyChange = (val: string) => {
    setMessageBody(val);
    setIsCustomMessage(true);
  };

  // Template strings used for bulk sends (placeholder tokens are substituted per-location on the server)
  const BULK_TEMPLATE_EN =
    "Hi {{name}}, thanks for running your gemach for us. Your PIN is {{pin}}. Sign in here:\n{{url}}\nLOG IN TO RESTOCK HEADBANDS, UPDATE YOUR PROFILE, AND ACCEPT CREDIT-CARD DEPOSITS.\n— Earmuffs Gemach";
  const BULK_TEMPLATE_EN_EMAIL =
    "Welcome to the Baby Banz Gemach operator dashboard, {{name}}!\n\nYour location is now live and ready to manage. Here's how to get started in 4 quick steps:\n\nStep 1 — Open your dashboard\n  {{url}}\n\nStep 2 — Sign in with your location credentials\n  Location code:  {{code}}\n  Temporary PIN:  {{pin}}\n\nStep 3 — Change your PIN\n  After signing in, go to Settings → Change PIN and set a private PIN that only you know.\n\nStep 4 — Complete your profile\n  Add your phone number, opening hours, and any notes for borrowers so families can reach you easily.\n\nThat's it — you're all set! Reply to this email any time you need help.\n\nLOG IN TO RESTOCK HEADBANDS, UPDATE YOUR PROFILE, AND ACCEPT CREDIT-CARD DEPOSITS.\n\n— Baby Banz Gemach";
  const BULK_TEMPLATE_HE =
    'שלום {{name}}, תודה שאתה מנהל את הגמ"ח שלך עבורנו. קוד הכניסה שלך: {{pin}}. התחבר כאן:\n{{url}}\nהתחבר כדי לחדש מלאי, לעדכן את הפרופיל שלך ולקבל פיקדונות בכרטיס אשראי.\n— גמ"ח אטמי';

  /** Returns the channel-appropriate EN bulk template. */
  const getBulkTemplateEN = (ch: OperatorWelcomeChannel) => ch === "email" ? BULK_TEMPLATE_EN_EMAIL : BULK_TEMPLATE_EN;

  // Client-side substitution for live preview of admin-edited templates
  const applyBulkPreviewTemplate = (template: string, sample: Location, welcomeUrl?: string): string => {
    return template
      .replace(/\{\{name\}\}/g, sample.name)
      .replace(/\{\{code\}\}/g, sample.locationCode)
      .replace(/\{\{pin\}\}/g, sample.operatorPin || "1234")
      .replace(/\{\{url\}\}/g, welcomeUrl || "{{url}}");
  };

  const setDefaultChannel = (c: OperatorWelcomeChannel) => {
    setDefaultChannelState(c);
    try { localStorage.setItem("adminDefaultWelcomeChannel", c); } catch {}
  };

  const serviceStatusQuery = useQuery<{
    sms: { configured: boolean; reason?: string };
    email: { configured: boolean; reason?: string };
    whatsapp: { configured: boolean; reason?: string };
  }>({
    queryKey: ["/api/admin/twilio-status"],
    refetchOnWindowFocus: false,
  });

  type WelcomePreviewData = {
    location: { id: number; name: string; locationCode: string };
    language: "en" | "he";
    message: {
      en: { subject: string; body: string; emailBody: string };
      he: { subject: string; body: string; emailBody: string };
      resolvedLanguage: "en" | "he";
    };
    welcomeUrl: string;
  };

  const previewQuery = useQuery<WelcomePreviewData>({
    queryKey: ["/api/admin/locations/preview", welcomeTarget && welcomeTarget.kind === "single" ? welcomeTarget.id : null],
    queryFn: async () => {
      if (!welcomeTarget || welcomeTarget.kind !== "single") throw new Error("no preview target");
      const res = await apiRequest("GET", `/api/admin/locations/${welcomeTarget.id}/onboarding-preview`);
      return res.json() as Promise<WelcomePreviewData>;
    },
    enabled: welcomeDialogOpen && welcomeTarget?.kind === "single",
  });

  // Initialize message body from preview when it loads (not a custom edit)
  useEffect(() => {
    if (previewQuery.data && !messageBodyInitialized) {
      const lang = previewQuery.data.message.resolvedLanguage;
      const msg = previewQuery.data.message[lang];
      const body = (welcomeChannel === "email") ? msg.emailBody : msg.body;
      setMessageBody(body);
      setIsCustomMessage(false);
      setMessageBodyInitialized(true);
    }
  }, [previewQuery.data, messageBodyInitialized, welcomeChannel]);

  // When channel changes, update message body from preview (not a custom edit) — single mode
  useEffect(() => {
    if (previewQuery.data && messageBodyInitialized) {
      const lang = previewQuery.data.message.resolvedLanguage;
      const msg = previewQuery.data.message[lang];
      const body = (welcomeChannel === "email") ? msg.emailBody : msg.body;
      setMessageBody(body);
      setIsCustomMessage(false);
    }
  }, [welcomeChannel]);

  type ChannelResult = { ok: boolean; sid?: string; error?: string; hint?: string };
  type SendOneResponse = {
    success: boolean;
    results: {
      sms?: ChannelResult;
      whatsapp?: ChannelResult;
      email?: ChannelResult;
      anySuccess: boolean;
    };
  };
  type SendBulkResponse = {
    success: boolean;
    summary: { sent: number; skipped: number; failed: number; total: number };
  };
  type SendAllResponse = SendBulkResponse & { eligible: number };
  const errorMessage = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  const sendWelcomeOneMutation = useMutation<SendOneResponse, Error, { id: number; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string; customMessage?: boolean }>({
    mutationFn: async ({ id, channel, rememberAsDefault, messageBody, customMessage }) => {
      const res = await apiRequest("POST", `/api/admin/locations/${id}/send-onboarding-welcome`, {
        channel,
        rememberAsDefault,
        ...(customMessage && messageBody ? { messageBody, customMessage: true } : {}),
      });
      return res.json() as Promise<SendOneResponse>;
    },
    onSuccess: (data) => {
      const sms = data.results?.sms;
      const whatsapp = data.results?.whatsapp;
      const email = data.results?.email;
      const parts: string[] = [];
      if (sms) parts.push(`SMS: ${sms.ok ? "✓" : "✗ " + (sms.error || "failed")}`);
      if (whatsapp) parts.push(`WhatsApp: ${whatsapp.ok ? "✓" : "✗ " + (whatsapp.error || "failed")}`);
      if (email) parts.push(`Email: ${email.ok ? "✓" : "✗ " + (email.error || "failed")}`);
      toast({
        title: data.results?.anySuccess ? "Message sent" : "Message failed",
        description: parts.join(" · ") || "No channels selected",
        variant: data.results?.anySuccess ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-send-logs"] });
      if (data.results?.anySuccess) {
        setWelcomeDialogOpen(false);
        setWelcomeTarget(null);
      }
    },
    onError: (err) => toast({ title: "Error", description: errorMessage(err, "Failed to send"), variant: "destructive" }),
  });

  const sendAllNotOnboardedMutation = useMutation<SendAllResponse, Error, { channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string; customMessage?: boolean }>({
    mutationFn: async ({ channel, rememberAsDefault, messageBody, customMessage }) => {
      const res = await apiRequest("POST", `/api/admin/locations/onboarding/send-all`, {
        channel, rememberAsDefault,
        ...(customMessage && messageBody ? { messageBody, customMessage: true } : {}),
      });
      return res.json() as Promise<SendAllResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Messages sent to all contacts",
        description: `Eligible: ${data.eligible ?? 0} · Sent: ${data.summary?.sent ?? 0} · Failed: ${data.summary?.failed ?? 0}`,
        variant: (data.summary?.failed ?? 0) > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-send-logs"] });
      setWelcomeDialogOpen(false);
      setWelcomeTarget(null);
    },
    onError: (err) => toast({ title: "Error", description: errorMessage(err, "Failed"), variant: "destructive" }),
  });

  const sendBulkStream = async (payload: { locationIds: number[]; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string; customMessage?: boolean }) => {
    setStreamState({ log: "Starting…", n: 0, total: 0 });
    setSendFailures([]);
    setSendReport(null);
    const collectedFailures: Array<{ name: string; error: string }> = [];
    try {
      const res = await fetch("/api/admin/locations/onboarding/send-bulk-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok || !res.body) throw new Error("Failed to start send");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneSummary: { sent: number; failed: number; skipped: number; total: number } | null = null;
      let streamError: string | null = null;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data: Record<string, any>;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (data.type === "start") {
            setStreamState({ log: `Preparing to send to ${data.total} location(s)…`, n: 0, total: data.total });
          } else if (data.type === "progress") {
            const icon = data.skipped ? "↩" : data.ok ? "✓" : "✗";
            setStreamState({ log: `${icon} ${data.name}`, n: data.n, total: data.total });
            if (!data.ok && !data.skipped && data.error) {
              collectedFailures.push({ name: data.name, error: data.error });
            }
          } else if (data.type === "done") {
            doneSummary = data.summary;
          } else if (data.type === "error") {
            streamError = data.message || "Send failed";
            break outer;
          }
        }
      }

      if (streamError) throw new Error(streamError);

      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-send-logs"] });
      setSelectedIds(new Set());

      if (doneSummary && doneSummary.failed > 0 && collectedFailures.length > 0) {
        setSendFailures(collectedFailures);
        setSendReport({ sent: doneSummary.sent, failed: doneSummary.failed, skipped: doneSummary.skipped });
      } else {
        if (doneSummary) {
          toast({
            title: "Bulk messages sent",
            description: `Sent: ${doneSummary.sent} · Skipped: ${doneSummary.skipped} · Failed: ${doneSummary.failed}`,
          });
        }
        setWelcomeDialogOpen(false);
        setWelcomeTarget(null);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Send failed", variant: "destructive" });
    } finally {
      setStreamState(null);
    }
  };

  const sendAllStream = async (payload: { channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string; customMessage?: boolean }) => {
    setStreamState({ log: "Starting…", n: 0, total: 0 });
    setSendFailures([]);
    setSendReport(null);
    const collectedFailures: Array<{ name: string; error: string }> = [];
    try {
      const res = await fetch("/api/admin/locations/onboarding/send-all-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok || !res.body) throw new Error("Failed to start send");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneSummary: { sent: number; failed: number; skipped: number; total: number } | null = null;
      let eligible = 0;
      let streamError: string | null = null;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data: Record<string, any>;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (data.type === "start") {
            setStreamState({ log: `Preparing to send to ${data.total} location(s)…`, n: 0, total: data.total });
          } else if (data.type === "progress") {
            const icon = data.skipped ? "↩" : data.ok ? "✓" : "✗";
            setStreamState({ log: `${icon} ${data.name}`, n: data.n, total: data.total });
            if (!data.ok && !data.skipped && data.error) {
              collectedFailures.push({ name: data.name, error: data.error });
            }
          } else if (data.type === "done") {
            doneSummary = data.summary;
            eligible = data.eligible;
          } else if (data.type === "error") {
            streamError = data.message || "Send failed";
            break outer;
          }
        }
      }

      if (streamError) throw new Error(streamError);

      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/message-send-logs"] });

      if (doneSummary && doneSummary.failed > 0 && collectedFailures.length > 0) {
        setSendFailures(collectedFailures);
        setSendReport({ sent: doneSummary.sent, failed: doneSummary.failed, skipped: doneSummary.skipped, eligible });
      } else {
        if (doneSummary) {
          toast({
            title: "Messages sent to all contacts",
            description: `Eligible: ${eligible} · Sent: ${doneSummary.sent} · Failed: ${doneSummary.failed}`,
          });
        }
        setWelcomeDialogOpen(false);
        setWelcomeTarget(null);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Send failed", variant: "destructive" });
    } finally {
      setStreamState(null);
    }
  };

  const getOnboardingStatus = (loc: Location): "onboarded" | "sent" | "failed" | "not-sent" => {
    if (loc.operatorPin && loc.operatorPin !== '1234') return "onboarded";
    const sms = loc.welcomeSmsStatus?.toLowerCase();
    const wa = loc.welcomeWhatsappStatus?.toLowerCase();
    const em = loc.welcomeEmailStatus?.toLowerCase();
    const sentLike = (s?: string) => s === "sent" || s === "delivered" || s === "queued" || s === "sending" || s === "accepted";
    const failedLike = (s?: string) => s === "failed" || s === "undelivered";
    // Prioritise failures: if any channel failed, report the overall status as
    // "failed" so the location shows up in the "Failed delivery" filter even when
    // another channel was successfully sent.
    if (failedLike(sms) || failedLike(wa)) return "failed";
    if (sentLike(sms) || sentLike(wa) || sentLike(em)) return "sent";
    return "not-sent";
  };

  const openSinglePicker = (loc: Location) => {
    setWelcomeTarget({ kind: "single", id: loc.id, loc });
    const locDefaultRaw = loc.defaultWelcomeChannel as string | null;
    // "both" was removed from the UI picker; normalize any stored "both" → "sms"
    const resolvedLocDefault = locDefaultRaw === "both" ? "sms" : locDefaultRaw;
    const ch = resolvedLocDefault && (OPERATOR_WELCOME_CHANNELS as readonly string[]).includes(resolvedLocDefault)
      ? resolvedLocDefault as OperatorWelcomeChannel
      : defaultChannel;
    setWelcomeChannel(ch);
    setRememberAsDefault(false);
    setMessageBody("");
    setMessageBodyInitialized(false);
    setIsCustomMessage(false);
    setSendFailures([]);
    setSendReport(null);
    setWelcomeDialogOpen(true);
  };

  const openSelectedPicker = () => {
    if (selectedIds.size === 0) return;
    setWelcomeTarget({ kind: "selected" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setMessageBody(getBulkTemplateEN(defaultChannel));
    setMessageBodyInitialized(true);
    setIsCustomMessage(false);
    setSendFailures([]);
    setSendReport(null);
    setWelcomeDialogOpen(true);
  };

  const openAllNotOnboardedPicker = () => {
    setWelcomeTarget({ kind: "all-not-onboarded" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setMessageBody(getBulkTemplateEN(defaultChannel));
    setMessageBodyInitialized(true);
    setIsCustomMessage(false);
    setSendFailures([]);
    setSendReport(null);
    setWelcomeDialogOpen(true);
  };

  // Extract http(s) URLs from a draft message body (mirrors inbox composer logic).
  function extractUrls(text: string): string[] {
    const re = /https?:\/\/[^\s"'<>)\]]+/gi;
    const matches = text.match(re) ?? [];
    return Array.from(new Set(matches.map((u) => u.replace(/[.,;:!?]+$/, ""))));
  }

  // Probes the bulk message body for broken or blocklisted links via the same
  // /api/admin/check-urls endpoint the inbox composer uses. If any link comes
  // back not-ok, we surface the warning dialog and defer sending until the
  // admin confirms "Send anyway". On network/check failure we fail open and
  // proceed with the send rather than blocking the campaign.
  const runCheckUrlsAndSend = async (proceed: () => void) => {
    const draftText = messageBody;
    const urls = extractUrls(draftText);
    setLinkCheckPending(true);
    try {
      const res = await apiRequest("POST", "/api/admin/check-urls", { urls, rawText: draftText });
      const data: { results: { url: string; ok: boolean; reason?: string }[] } = await res.json();
      const broken = (data.results ?? []).filter((r) => !r.ok);
      if (broken.length > 0) {
        setBrokenLinkWarning({ links: broken, onConfirm: proceed });
      } else {
        proceed();
      }
    } catch {
      proceed();
    } finally {
      setLinkCheckPending(false);
    }
  };

  const sendFromDialog = () => {
    if (!welcomeTarget) return;
    if (welcomeTarget.kind === "single") {
      const trimmedBody = messageBody.trim();
      const proceed = () =>
        sendWelcomeOneMutation.mutate({
          id: welcomeTarget.id,
          channel: welcomeChannel,
          rememberAsDefault,
          messageBody: trimmedBody || undefined,
          customMessage: isCustomMessage,
        });
      if (trimmedBody) {
        runCheckUrlsAndSend(proceed);
      } else {
        proceed();
      }
    } else if (welcomeTarget.kind === "selected") {
      const ids = Array.from(selectedIds);
      runCheckUrlsAndSend(() =>
        sendBulkStream({ locationIds: ids, channel: welcomeChannel, rememberAsDefault, messageBody: messageBody.trim() || undefined, customMessage: isCustomMessage }),
      );
    } else {
      runCheckUrlsAndSend(() =>
        sendAllStream({ channel: welcomeChannel, rememberAsDefault, messageBody: messageBody.trim() || undefined, customMessage: isCustomMessage }),
      );
    }
  };

  const dialogIsPending = sendWelcomeOneMutation.isPending || sendAllNotOnboardedMutation.isPending || !!streamState || linkCheckPending;

  const toggleSelectAll = (checked: boolean, visibleIds: number[]) => {
    if (checked) setSelectedIds(new Set(visibleIds));
    else setSelectedIds(new Set());
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleManyIds = (ids: number[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach(id => next.add(id));
      else ids.forEach(id => next.delete(id));
      return next;
    });
  };

  const allIdsSelected = (ids: number[]) =>
    ids.length > 0 && ids.every(id => selectedIds.has(id));

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: cityCategories = [] } = useQuery<CityCategory[]>({
    queryKey: ["/api/city-categories"],
  });

  // Bulk preview samples for non-single sends
  const bulkPreviewSamples = useMemo(() => {
    if (!welcomeTarget || welcomeTarget.kind === "single") return { en: null as Location | null, he: null as Location | null };
    const ch = welcomeChannel;
    const needsPhone = ch === "sms" || ch === "both" || ch === "whatsapp";
    const needsEmail = ch === "email" || ch === "both";
    const candidates = welcomeTarget.kind === "selected"
      ? locations.filter((l) => selectedIds.has(l.id) && (needsPhone ? !!l.phone : true) && (needsEmail ? !!l.email : true))
      : locations.filter((l) => l.isActive !== false && !l.onboardedAt && (needsPhone ? !!l.phone : true) && (needsEmail ? !!l.email : true));
    const en = candidates.find((l) => !l.nameHe) || null;
    const he = candidates.find((l) => !!l.nameHe) || null;
    return { en, he };
  }, [welcomeTarget, locations, selectedIds, welcomeChannel]);

  // The one eligible recipient when the bulk path narrows to exactly one
  // (matches the channel-eligibility filter used for the recipient list UI).
  // Used to prefill substituted message text instead of {{tokens}}.
  const bulkSingleEligible = useMemo<Location | null>(() => {
    if (!welcomeTarget || welcomeTarget.kind === "single") return null;
    const ch = welcomeChannel;
    const candidates = welcomeTarget.kind === "selected"
      ? locations.filter((l) => selectedIds.has(l.id))
      : locations.filter((l) => l.isActive !== false && !l.onboardedAt);
    const sendable = candidates.filter((l) => {
      if (ch === "sms") return !!l.phone;
      if (ch === "whatsapp") return !!l.phone;
      if (ch === "email") return !!l.email;
      return !!l.phone || !!l.email;
    });
    return sendable.length === 1 ? sendable[0] : null;
  }, [welcomeTarget, locations, selectedIds, welcomeChannel]);

  const bulkPreviewEnQuery = useQuery<WelcomePreviewData>({
    queryKey: ["/api/admin/locations/preview-bulk-en", bulkPreviewSamples.en?.id ?? null],
    queryFn: async () => {
      const id = bulkPreviewSamples.en!.id;
      const res = await apiRequest("GET", `/api/admin/locations/${id}/onboarding-preview`);
      return res.json() as Promise<WelcomePreviewData>;
    },
    enabled: welcomeDialogOpen && welcomeTarget != null && welcomeTarget.kind !== "single" && !!bulkPreviewSamples.en,
  });
  const bulkPreviewHeQuery = useQuery<WelcomePreviewData>({
    queryKey: ["/api/admin/locations/preview-bulk-he", bulkPreviewSamples.he?.id ?? null],
    queryFn: async () => {
      const id = bulkPreviewSamples.he!.id;
      const res = await apiRequest("GET", `/api/admin/locations/${id}/onboarding-preview`);
      return res.json() as Promise<WelcomePreviewData>;
    },
    enabled: welcomeDialogOpen && welcomeTarget != null && welcomeTarget.kind !== "single" && !!bulkPreviewSamples.he,
  });

  // The single bulk preview that matches `bulkSingleEligible`, if any.
  const bulkSinglePreview: WelcomePreviewData | null = bulkSingleEligible
    ? (bulkPreviewEnQuery.data?.location.id === bulkSingleEligible.id
        ? bulkPreviewEnQuery.data
        : bulkPreviewHeQuery.data?.location.id === bulkSingleEligible.id
          ? bulkPreviewHeQuery.data
          : null)
    : null;

  // Bulk-mode body sync. When the bulk path narrows to exactly one eligible
  // recipient, prefill the editable textarea with the server-substituted body
  // for that recipient (same source the per-recipient preview returns), so the
  // admin sees real text instead of {{tokens}}. Otherwise (multi-recipient),
  // reset to the channel-appropriate template. Skipped once admin customises,
  // EXCEPT on a single→multi transition we always revert to the bulk template
  // (the substituted text would no longer be valid for multiple recipients).
  const prevBulkSingleIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!welcomeTarget || welcomeTarget.kind === "single") {
      prevBulkSingleIdRef.current = null;
      return;
    }
    const prevSingleId = prevBulkSingleIdRef.current;
    const currSingleId = bulkSingleEligible?.id ?? null;
    const transitionedToMulti = prevSingleId !== null && currSingleId === null;
    prevBulkSingleIdRef.current = currSingleId;

    if (transitionedToMulti) {
      setMessageBody(getBulkTemplateEN(welcomeChannel));
      setIsCustomMessage(false);
      return;
    }
    if (isCustomMessage) return;
    if (bulkSingleEligible) {
      if (bulkSinglePreview) {
        const lang = bulkSinglePreview.message.resolvedLanguage;
        const msg = bulkSinglePreview.message[lang];
        setMessageBody(welcomeChannel === "email" ? msg.emailBody : msg.body);
      }
    } else {
      setMessageBody(getBulkTemplateEN(welcomeChannel));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [welcomeChannel, bulkSingleEligible, bulkSinglePreview, welcomeTarget?.kind]);

  // Eligible for bulk "not onboarded" send (SMS or email available)
  const eligibleNotOnboarded = useMemo(
    () => locations.filter((l) => getOnboardingStatus(l) !== "onboarded" && (!!l.phone || !!l.email)),
    [locations]
  );

  // Task #294: when the row-level re-geocode hits the new 422 "no precise match"
  // path from Task #291, the admin needs the best-candidate panel to decide
  // whether to accept it. We bypass apiRequest (which throws on non-2xx) so we
  // can branch on status, then open the edit dialog where the panel lives.
  const regeocodeLocationMutation = useMutation({
    mutationFn: async (id: number): Promise<{ id: number; status: "ok" | "needs_review"; message?: string }> => {
      const res = await fetch(`/api/admin/locations/${id}/regeocode`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) return { id, status: "ok" };
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const message = typeof body?.message === "string" ? body.message : res.statusText;
      if (res.status === 422) return { id, status: "needs_review", message };
      throw new Error(message);
    },
    onSuccess: (result) => {
      if (result.status === "ok") {
        toast({ title: "Re-geocoded", description: "Coordinates updated successfully." });
        queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/location-tree"] });
        return;
      }
      // No precise match — open the edit dialog so the admin can review the
      // best candidate panel (rendered inside CoordinatesSection) and either
      // accept it or paste manual coords.
      const loc = locations.find(l => l.id === result.id);
      if (loc) {
        handleEditLocation(loc);
      }
      toast({
        title: "Needs review",
        description: result.message || "No precise match — review the suggested coordinates.",
        variant: "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Re-geocode failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      updateLocation(id, { isActive }),
    onSuccess: () => {
      toast({ title: t('statusUpdated'), description: t('statusUpdateSuccess') });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: `${t('failedToUpdateStatus')} ${error.message}`, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLocation(id),
    onSuccess: () => {
      toast({ title: t('locationDeleted'), description: t('locationDeletedSuccess') });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsDeleteDialogOpen(false);
      setDeletingLocation(null);
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: error.message || t('failedToDelete'), variant: "destructive" });
    },
  });

  const changePinMutation = useMutation({
    mutationFn: async ({ id, newPin, confirmPin }: { id: number; newPin: string; confirmPin: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/locations/${id}/pin`, { newPin, confirmPin });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "PIN Updated", description: "The operator PIN has been changed successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsPinDialogOpen(false);
      setPinLocation(null);
      setNewPin("");
      setConfirmPin("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleLocationStatus = (id: number, isActive: boolean) => {
    toggleStatusMutation.mutate({ id, isActive: !isActive });
  };

  const handleEditLocation = (location: Location, focusPhone = false) => {
    setEditingLocation(location);
    setEditFocusPhone(focusPhone);
    setIsEditDialogOpen(true);
  };

  const handleChangePinForLocation = (location: Location) => {
    setPinLocation(location);
    setNewPin("");
    setConfirmPin("");
    setIsPinDialogOpen(true);
  };

  const handleDeleteLocation = (location: Location) => {
    setDeletingLocation(location);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingLocation) deleteMutation.mutate(deletingLocation.id);
  };

  const closeEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingLocation(null);
    setEditFocusPhone(false);
  };

  const getRegionNameById = (regionId: number) => {
    const region = regions.find(r => r.id === regionId);
    if (!region) return "Unknown";
    return language === "he" && region.nameHe ? region.nameHe : region.name;
  };

  const localized = (loc: Location, base: "name" | "address" | "contactPerson") => {
    const heKey = `${base}He` as const;
    return language === "he" && loc[heKey] ? loc[heKey] : loc[base];
  };

  const filteredLocations = useMemo(() => locations.filter(location => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        location.name.toLowerCase().includes(searchLower) ||
        (location.nameHe && location.nameHe.toLowerCase().includes(searchLower)) ||
        location.contactPerson.toLowerCase().includes(searchLower) ||
        location.address.toLowerCase().includes(searchLower) ||
        (location.addressHe && location.addressHe.toLowerCase().includes(searchLower)) ||
        getRegionNameById(location.regionId).toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }
    if (statusFilter === "active" && !location.isActive) return false;
    if (statusFilter === "inactive" && location.isActive) return false;
    // Task #294: missing-coords filter. "missing" = has address but no lat/lng
    // (the actionable case — no address means nothing to geocode).
    if (coordsFilter === "missing") {
      const hasAddress = !!(location.address || "").trim();
      const hasCoords = location.latitude != null && location.longitude != null;
      if (!hasAddress || hasCoords) return false;
    }
    if (onboardingFilter !== "all") {
      if (onboardingFilter === "no-phone") {
        if (!!location.phone || (!!location.operatorPin && location.operatorPin !== '1234')) return false;
      } else {
        const obStatus = getOnboardingStatus(location);
        if (onboardingFilter === "not-sent" && obStatus !== "not-sent") return false;
        if (onboardingFilter === "sent" && obStatus !== "sent") return false;
        if (onboardingFilter === "failed" && obStatus !== "failed") return false;
        if (onboardingFilter === "onboarded" && obStatus !== "onboarded") return false;
      }
    }
    return true;
  }), [locations, searchTerm, statusFilter, coordsFilter, onboardingFilter, regions, language]);

  // Task #294: count of locations that need GPS attention (has address, no coords).
  // Drives the summary badge + one-click "Show only these" shortcut.
  const missingCoordsCount = useMemo(
    () => locations.filter(l => !!(l.address || "").trim() && (l.latitude == null || l.longitude == null)).length,
    [locations],
  );

  const groupedLocations = useMemo(() => {
    const sortedRegions = [...regions].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    const ccByRegion = new Map<number, CityCategory[]>();
    for (const cc of cityCategories) {
      const arr = ccByRegion.get(cc.regionId) ?? [];
      arr.push(cc);
      ccByRegion.set(cc.regionId, arr);
    }
    return sortedRegions
      .map(region => {
        const regionLocs = filteredLocations.filter(l => l.regionId === region.id);
        const sortedCcs = (ccByRegion.get(region.id) ?? [])
          .slice()
          .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        const communityGroups: { cityCategory: CityCategory | null; locations: Location[] }[] = [];
        for (const cc of sortedCcs) {
          const locs = regionLocs.filter(l => l.cityCategoryId === cc.id);
          if (locs.length > 0) communityGroups.push({ cityCategory: cc, locations: locs });
        }
        const uncategorized = regionLocs.filter(l => !l.cityCategoryId || !sortedCcs.some(c => c.id === l.cityCategoryId));
        if (uncategorized.length > 0) communityGroups.push({ cityCategory: null, locations: uncategorized });
        return { region, locations: regionLocs, communityGroups };
      })
      .filter(g => g.locations.length > 0);
  }, [regions, cityCategories, filteredLocations]);

  // All visible location IDs (for select-all in current view)
  const allVisibleIds = useMemo(() => filteredLocations.map(l => l.id), [filteredLocations]);

  // Regions start collapsed on first render. Filtering still force-expands
  // matching regions via the `isFilterActive` flag below, so search results
  // remain visible without requiring a manual expand.

  const isFilterActive = searchTerm !== "" || statusFilter !== "all" || onboardingFilter !== "all" || coordsFilter !== "all";
  const activeFilterCount = (searchTerm !== "" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (onboardingFilter !== "all" ? 1 : 0) + (coordsFilter !== "all" ? 1 : 0);

  const toggleRegion = useCallback((regionId: number) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }, []);

  const allExpanded = groupedLocations.length > 0 && groupedLocations.every(g => expandedRegions.has(g.region.id));
  const toggleAll = () => {
    if (allExpanded) setExpandedRegions(new Set());
    else setExpandedRegions(new Set(groupedLocations.map(g => g.region.id)));
  };

  const scrollToRegion = (regionId: number) => {
    const el = regionRefs.current[regionId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setExpandedRegions(prev => { const next = new Set(prev); next.add(regionId); return next; });
    }
  };

  const scrollToCityCategory = (regionId: number, cityCategoryId: number | null) => {
    setExpandedRegions(prev => { const next = new Set(prev); next.add(regionId); return next; });
    const key = `${regionId}:${cityCategoryId ?? "none"}`;
    requestAnimationFrame(() => {
      const el = cityCategoryRefs.current[key];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else regionRefs.current[regionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const totalLocations = locations.length;
  const activeLocations = locations.filter(l => l.isActive).length;
  const inactiveLocations = totalLocations - activeLocations;


  // Per-region stats for the compact region strip (uses ALL locations, not filtered)
  const regionStats = useMemo(() => {
    const sortedRegions = [...regions].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return sortedRegions.map(region => {
      const regionLocs = locations.filter(l => l.regionId === region.id);
      const onboarded = regionLocs.filter(l => !!(l.operatorPin && l.operatorPin !== '1234')).length;
      const missingContact = regionLocs.filter(l => !l.phone && !l.email).length;
      return { region, count: regionLocs.length, onboarded, missingContact };
    });
  }, [regions, locations]);

  // Communities (cityCategories) for the currently-selected region, derived
  // from groupedLocations so counts respect current filters.
  const selectedRegionGroup = useMemo(
    () => groupedLocations.find(g => g.region.id === selectedRegionId) ?? null,
    [groupedLocations, selectedRegionId]
  );

  // Locations to render in the cards grid: filtered + region + district (Israel) + community
  const visibleLocations = useMemo(() => {
    if (selectedRegionId === null) return [] as Location[];
    let locs = filteredLocations.filter(l => l.regionId === selectedRegionId);
    if (selectedDistrictFilter) {
      locs = locs.filter(l => {
        const cc = l.cityCategoryId ? cityCategories.find(c => c.id === l.cityCategoryId) : null;
        return cc?.districtCode === selectedDistrictFilter;
      });
    }
    if (selectedCityCategoryId !== "all") {
      locs = locs.filter(l => l.cityCategoryId === selectedCityCategoryId);
    }
    return locs;
  }, [filteredLocations, selectedRegionId, selectedDistrictFilter, selectedCityCategoryId, cityCategories]);

  const selectedRegion = regions.find(r => r.id === selectedRegionId) ?? null;
  const selectedRegionName = selectedRegion
    ? (language === "he" && selectedRegion.nameHe ? selectedRegion.nameHe : selectedRegion.name)
    : "";

  // Determine bulk send label based on channel for "send to selected" button
  const selectedCount = selectedIds.size;
  const messageableCount = locations.filter((l) => selectedIds.has(l.id) && (!!l.phone || !!l.email)).length;

  return (
    <TooltipProvider>
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold">{t('locationManagementTitle')}</h1>
          <p className="text-muted-foreground text-sm md:text-base">{t('manageAllGemachLocations')}</p>
        </div>

        {/* Hidden controlled dialogs (triggered from Card header / Settings sheet) */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent
            className="sm:max-w-[550px] max-h-[92vh] overflow-y-auto top-[2vh] sm:top-[50%] translate-y-0 sm:translate-y-[-50%]"
          >
            <DialogHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <DialogTitle>{t('createNewLocation')}</DialogTitle>
                  <DialogDescription>{t('addNewLocationDescription')}</DialogDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsCreateDialogOpen(false)}
                  data-testid="button-cancel-create-location"
                  className="shrink-0"
                >
                  {t('cancel')}
                </Button>
              </div>
            </DialogHeader>
            <LocationForm regions={regions} onSuccess={() => setIsCreateDialogOpen(false)} />
          </DialogContent>
        </Dialog>

        <TaxonomyPanel
          open={isRegionDialogOpen}
          onOpenChange={(open) => { setIsRegionDialogOpen(open); if (!open) setEditingRegion(null); }}
          regions={regions}
          locations={locations}
        />

        {/* ===================================================================
            DRILL-IN LOCATIONS MANAGEMENT — Borrower-style glassmorphism
            =================================================================== */}
        <div className="pb-32 space-y-5">
          {/* Simplified toolbar: breadcrumb + search + filter toggle + add */}
          <div className="flex flex-wrap items-center gap-3 glass-panel p-4 rounded-2xl">
            {selectedRegionId !== null && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => { setSelectedRegionId(null); setSelectedDistrictFilter(null); }}
                  className="inline-flex items-center hover:text-foreground transition-colors"
                  aria-label="Back to all regions"
                  data-testid="button-breadcrumb-home"
                >
                  <Home className="h-4 w-4" />
                </button>
                <ChevronRight className="h-4 w-4" />
                <span className="text-foreground font-medium">{selectedRegionName}</span>
              </div>
            )}
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('search')}
                className="pl-9 h-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-locations"
              />
            </div>
            <Button
              variant={filtersExpanded ? "secondary" : "outline"}
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setFiltersExpanded(v => !v)}
              data-testid="button-toggle-filters"
            >
              <Settings className="h-4 w-4 mr-1" />
              {t("filters")}
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-xs font-semibold leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            <Button
              size="sm"
              className="h-9 shrink-0"
              onClick={() => setIsCreateDialogOpen(true)}
              data-testid="button-add-location-card-header"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('addNewLocation')}
            </Button>
          </div>

          {/* Collapsible filter strip */}
          {filtersExpanded && (
            <div className="flex flex-wrap items-center gap-2 glass-panel/50 p-3 rounded-xl border border-white/5" data-testid="filter-strip">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[140px] text-sm">
                  <SelectValue placeholder={t('status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allStatuses')}</SelectItem>
                  <SelectItem value="active">{t('activeOnly')}</SelectItem>
                  <SelectItem value="inactive">{t('inactiveOnly')}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={coordsFilter} onValueChange={setCoordsFilter}>
                <SelectTrigger className="h-8 w-[180px] text-sm" data-testid="select-coords-filter">
                  <SelectValue placeholder={t("allCoordinates")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allCoordinates")}</SelectItem>
                  <SelectItem value="missing">
                    {t("missingCoords")}{missingCoordsCount > 0 ? ` (${missingCoordsCount})` : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={onboardingFilter}
                onValueChange={(v) => {
                  try { localStorage.setItem("adminOnboardingFilter", v); } catch {}
                  setOnboardingFilter(v);
                }}
              >
                <SelectTrigger className="h-8 w-[160px] text-sm">
                  <SelectValue placeholder={t("allContacts")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allContacts")}</SelectItem>
                  <SelectItem value="not-sent">{t("notMessaged")}</SelectItem>
                  <SelectItem value="sent">{t("messagedAwaiting")}</SelectItem>
                  <SelectItem value="failed">{t("failedDelivery")}</SelectItem>
                  <SelectItem value="onboarded">{t("onboarded")}</SelectItem>
                  <SelectItem value="no-phone">{t("noPhoneCannotSend")}</SelectItem>
                </SelectContent>
              </Select>
              {isFilterActive && (
                <Button variant="ghost" size="sm" className="h-8 text-xs"
                  onClick={() => { setSearchTerm(""); setStatusFilter("all"); setOnboardingFilter("all"); setCoordsFilter("all"); }}>
                  {t('clearAll')}
                </Button>
              )}
            </div>
          )}

          {/* Task #294: summary banner — one-click shortcut to the missing-coords
              view, only shown when there's actionable work AND the filter isn't
              already on. Sits above the filter chips so it doesn't disappear
              when other filters become active. */}
          {missingCoordsCount > 0 && coordsFilter !== "missing" && (
            <div
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
              data-testid="banner-missing-coords"
            >
              <AlertTriangle className="h-3 w-3 text-amber-400/70 shrink-0" />
              <span>{missingCoordsCount} {t("missingCoords").toLowerCase()} —</span>
              <button
                onClick={() => setCoordsFilter("missing")}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
                data-testid="btn-show-missing-coords"
              >
                {t("showOnly")}
              </button>
            </div>
          )}

          {/* Active filters chips */}
          {(statusFilter !== "all" || searchTerm || onboardingFilter !== "all" || coordsFilter !== "all") && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">{t('activeFilters')}:</span>
              {searchTerm && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {t('search')}: {searchTerm}
                  <button onClick={() => setSearchTerm("")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {statusFilter !== "all" && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {t('status')}: {statusFilter}
                  <button onClick={() => setStatusFilter("all")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {onboardingFilter !== "all" && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {t("allContacts")}: {onboardingFilter === "not-sent" ? t("notMessaged") : onboardingFilter === "sent" ? t("messagedAwaiting") : onboardingFilter === "failed" ? t("failedDelivery") : onboardingFilter === "no-phone" ? t("noPhoneCannotSend") : t("onboarded")}
                  <button onClick={() => setOnboardingFilter("all")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              {coordsFilter !== "all" && (
                <Badge variant="secondary" className="flex items-center gap-1" data-testid="chip-coords-filter">
                  {t("allCoordinates")}: {coordsFilter === "missing" ? t("missingCoords") : coordsFilter}
                  <button onClick={() => setCoordsFilter("all")} className="ml-1 hover:text-destructive">×</button>
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchTerm(""); setStatusFilter("all"); setOnboardingFilter("all"); setCoordsFilter("all"); }}
                className="text-xs"
              >
                {t('clearAll')}
              </Button>
            </div>
          )}

          {/* Large glassmorphism region cards — click to drill in */}
          {selectedRegionId === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {regionStats.map(({ region, count, onboarded, missingContact }) => {
                const regionName = language === "he" && region.nameHe ? region.nameHe : region.name;
                const regionLocIds = filteredLocations.filter(l => l.regionId === region.id).map(l => l.id);
                const allRegionSelected = allIdsSelected(regionLocIds);
                const someRegionSelected = !allRegionSelected && regionLocIds.some(id => selectedIds.has(id));
                const allCommunities = cityCategories.filter(cc =>
                  locations.some(l => l.regionId === region.id && l.cityCategoryId === cc.id)
                );
                const previewCommunities = allCommunities.slice(0, 3);
                return (
                  <div
                    key={region.id}
                    className="glass-card glass-highlight p-6 rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 relative group"
                    data-testid={`region-card-${region.id}`}
                  >
                    <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={allRegionSelected}
                        onCheckedChange={(v) => toggleManyIds(regionLocIds, !!v)}
                        aria-label={`Select all locations in ${regionName}`}
                        className={`w-5 h-5 ${someRegionSelected ? "data-[state=unchecked]:bg-primary/30 data-[state=unchecked]:border-primary/60" : ""}`}
                        data-testid={`checkbox-region-${region.id}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRegionId(region.id);
                        setSelectedCityCategoryId("all");
                        setSelectedDistrictFilter(null);
                      }}
                      className="text-left w-full pr-8"
                      data-testid={`region-card-button-${region.id}`}
                    >
                      <h3 className="text-xl font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{regionName}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {count} {count === 1 ? t("locationSingular") : t("locations")}
                      </p>
                      {previewCommunities.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {previewCommunities.map(cc => (
                            <span key={cc.id} className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-foreground/70 border border-white/10">
                              {language === "he" && cc.nameHe ? cc.nameHe : cc.name}
                            </span>
                          ))}
                          {allCommunities.length > 3 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground">
                              {t("nMoreCommunities").replace("{n}", String(allCommunities.length - 3))}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {onboarded > 0 && (
                          <Badge variant="outline" className="text-xs bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                            {t("onboardedCount").replace("{n}", String(onboarded))}
                          </Badge>
                        )}
                        {missingContact > 0 && (
                          <Badge variant="outline" className="text-xs bg-orange-500/15 text-orange-300 border-orange-500/30">
                            {t("missingContactCount").replace("{n}", String(missingContact))}
                          </Badge>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* District filter chip row — shown only for Israeli regions */}
              {selectedRegionGroup && selectedRegionGroup.region.slug === "israel" && (() => {
                const presentDistricts = IL_DISTRICT_ORDER.filter(d =>
                  selectedRegionGroup.communityGroups.some(g => g.cityCategory?.districtCode === d)
                );
                if (presentDistricts.length < 2) return null;
                return (
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button
                      variant={selectedDistrictFilter === null ? "default" : "outline"}
                      size="sm"
                      className="rounded-full"
                      onClick={() => { setSelectedDistrictFilter(null); setSelectedCityCategoryId("all"); }}
                    >
                      {t("allDistricts")}
                    </Button>
                    {presentDistricts.map(d => {
                      const count = selectedRegionGroup.communityGroups
                        .filter(g => g.cityCategory?.districtCode === d)
                        .reduce((s, g) => s + g.locations.length, 0);
                      return (
                        <Button
                          key={d}
                          variant={selectedDistrictFilter === d ? "default" : "outline"}
                          size="sm"
                          className="rounded-full"
                          onClick={() => { setSelectedDistrictFilter(d); setSelectedCityCategoryId("all"); }}
                        >
                          {localizeIsraelDistrict(language as "en" | "he", d)}
                          <span className="ms-1.5 text-xs opacity-70">({count})</span>
                        </Button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Community chips with bulk-select checkboxes */}
              {selectedRegionGroup && selectedRegionGroup.communityGroups.length > 0 && (
                <div className="flex flex-col gap-3">
                  {/* "All" row */}
                  <div className="flex flex-wrap gap-2 items-center">
                    {(() => {
                      const allRegionVisibleIds = selectedRegionGroup.communityGroups.flatMap(g => g.locations.map(l => l.id));
                      const allRegionVisSelected = allIdsSelected(allRegionVisibleIds);
                      return (
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                          selectedCityCategoryId === "all" ? "btn-glass-amber" : "btn-glass-outline"
                        }`}>
                          <Checkbox
                            checked={allRegionVisSelected}
                            onCheckedChange={(v) => toggleManyIds(allRegionVisibleIds, !!v)}
                            aria-label="Select all locations in region"
                            className="w-4 h-4"
                            data-testid="checkbox-community-all"
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedCityCategoryId("all")}
                            data-testid="pill-community-all"
                          >
                            {t("communityAll")}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                  {/* State/district grouped rows — one horizontal row per state */}
                  {(() => {
                    const isIsraelRegion = selectedRegionGroup.region.slug === "israel";
                    const getGroupKey = (g: (typeof selectedRegionGroup.communityGroups)[0]): string | null =>
                      isIsraelRegion
                        ? (g.cityCategory?.districtCode ?? null)
                        : (g.cityCategory?.stateCode ?? null);

                    const communityGroups = (isIsraelRegion && selectedDistrictFilter)
                      ? selectedRegionGroup.communityGroups.filter(g => g.cityCategory?.districtCode === selectedDistrictFilter)
                      : selectedRegionGroup.communityGroups;

                    const withGroup = communityGroups.filter(g => getGroupKey(g) !== null);
                    const withoutGroup = communityGroups.filter(g => getGroupKey(g) === null);
                    const groupOrder: string[] = isIsraelRegion
                      ? IL_DISTRICT_ORDER.filter(d => withGroup.some(g => g.cityCategory?.districtCode === d))
                      : [];
                    const byGroup = new Map<string, typeof selectedRegionGroup.communityGroups>();
                    for (const g of withGroup) {
                      const key = getGroupKey(g)!;
                      if (!byGroup.has(key)) {
                        byGroup.set(key, []);
                        if (!isIsraelRegion) groupOrder.push(key);
                      }
                      byGroup.get(key)!.push(g);
                    }
                    const getGroupLabel = (key: string) =>
                      isIsraelRegion
                        ? localizeIsraelDistrict(language as "en" | "he", key)
                        : key;
                    const renderChip = ({ cityCategory, locations: ccLocs }: { cityCategory: (typeof selectedRegionGroup.communityGroups)[0]["cityCategory"]; locations: (typeof selectedRegionGroup.communityGroups)[0]["locations"] }) => {
                      const ccId = cityCategory?.id ?? null;
                      if (ccId === null) return null;
                      const ccName = cityCategory
                        ? (language === "he" && cityCategory.nameHe ? cityCategory.nameHe : cityCategory.name)
                        : (t('uncategorized') || "Other");
                      const isSel = selectedCityCategoryId === ccId;
                      const ccIds = ccLocs.map(l => l.id);
                      const allCcSelected = allIdsSelected(ccIds);
                      return (
                        <div
                          key={ccId}
                          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                            isSel ? "btn-glass-amber" : "btn-glass-outline"
                          }`}
                        >
                          <Checkbox
                            checked={allCcSelected}
                            onCheckedChange={(v) => toggleManyIds(ccIds, !!v)}
                            aria-label={`Select all in ${ccName}`}
                            className="w-4 h-4"
                            data-testid={`checkbox-community-${ccId}`}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedCityCategoryId(ccId)}
                            data-testid={`pill-community-${ccId}`}
                          >
                            {ccName}
                            <span className="ml-1.5 text-xs opacity-70">({ccLocs.length})</span>
                          </button>
                        </div>
                      );
                    };
                    return (
                      <>
                        {groupOrder.map(key => (
                          <div key={key} className="flex flex-wrap gap-2 items-center">
                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 shrink-0">{getGroupLabel(key)}</span>
                            <span className="text-muted-foreground/30 shrink-0 select-none">·</span>
                            {byGroup.get(key)!.map(g => renderChip(g))}
                          </div>
                        ))}
                        {withoutGroup.length > 0 && (
                          <div className="flex flex-wrap gap-2 items-center">
                            {groupOrder.length > 0 && (
                              <>
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 shrink-0">Other</span>
                                <span className="text-muted-foreground/30 shrink-0 select-none">·</span>
                              </>
                            )}
                            {withoutGroup.map(g => renderChip(g))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Summary row */}
              <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                <div>
                  {t('showing')} {visibleLocations.length} / {totalLocations} {t('locations')}
                  {selectedCount > 0 && (
                    <span className="ml-2 text-primary font-medium">· {selectedCount} selected</span>
                  )}
                </div>
              </div>

              {/* Cards grid OR empty state */}
              {visibleLocations.length === 0 ? (
                <div className="glass-card p-8 rounded-2xl text-center">
                  {isFilterActive ? (
                    <div className="space-y-2">
                      <p className="text-muted-foreground">{t('noLocationsMatch')}</p>
                      <p className="text-sm text-muted-foreground/70">{t('tryAdjustingSearch')}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSearchTerm(""); setStatusFilter("all"); setOnboardingFilter("all"); setCoordsFilter("all"); }}
                      >
                        {t('clearAll')}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-muted-foreground">{t('noLocationsFound')}</p>
                      <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
                        {t('addNewLocation')}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleLocations.length === 0 ? (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <p className="text-sm">{t("noLocationsFound")}</p>
                    </div>
                  ) : visibleLocations.map((location) => (
                    <AdminLocationCard
                      key={location.id}
                      location={location}
                      regions={regions}
                      cityCategories={cityCategories}
                      language={language}
                      t={t}
                      isSelected={selectedIds.has(location.id)}
                      onToggleSelect={toggleOne}
                      onChangePin={handleChangePinForLocation}
                      onRestockEmail={(loc) => setRestockEmailTarget(loc)}
                      onDelete={handleDeleteLocation}
                      onSendWelcome={openSinglePicker}
                      onEdit={handleEditLocation}
                      regeocodeIsPending={regeocodeLocationMutation.isPending}
                      regeocodeVariables={regeocodeLocationMutation.variables as number | undefined}
                      onRegeocodeClick={(id) => regeocodeLocationMutation.mutate(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sticky bulk-action bar */}
        {selectedCount > 0 && (
          <div className="fixed bottom-0 md:bottom-8 left-0 right-0 z-50 flex justify-center animate-in slide-in-from-bottom-8 duration-300 p-4 md:p-0 pointer-events-none">
            <div className="glass-panel pointer-events-auto w-full md:w-auto rounded-2xl md:rounded-full px-5 py-3 flex flex-col md:flex-row items-center gap-3 md:gap-5 shadow-[0_10px_40px_rgba(0,0,0,0.5),0_0_20px_rgba(59,130,246,0.15)] border border-primary/30">
              <div className="flex items-center gap-2">
                <div className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                  {selectedCount}
                </div>
                <span className="text-foreground font-medium text-sm">{t("bulkSelected")}</span>
              </div>
              <div className="hidden md:block h-8 w-px bg-white/10" />
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button
                  size="sm"
                  className="rounded-full flex-1 md:flex-none"
                  onClick={openSelectedPicker}
                  disabled={dialogIsPending}
                  data-testid="button-bulk-message"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t("messageAction")} ({messageableCount}/{selectedCount})
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full flex-1 md:flex-none"
                  onClick={openSelectedPicker}
                  disabled={dialogIsPending}
                  data-testid="button-bulk-send-welcome"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {t("sendWelcome")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-full flex-1 md:flex-none"
                  onClick={() => {
                    if (window.confirm(`${t("bulkDeleteSelected")} (${selectedCount})?`)) {
                      Array.from(selectedIds).forEach(id => {
                        deleteMutation.mutate(id);
                      });
                      setSelectedIds(new Set());
                    }
                  }}
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("bulkDeleteSelected")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full shrink-0"
                  onClick={() => setSelectedIds(new Set())}
                  aria-label="Clear selection"
                  data-testid="button-bulk-clear"
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Location Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('editLocation')}</DialogTitle>
              <DialogDescription>{t('editLocationDescription')}</DialogDescription>
            </DialogHeader>
            {editingLocation && (
              <>
                <LocationForm location={editingLocation} regions={regions} onSuccess={closeEditDialog} focusPhone={editFocusPhone} />
                <LocationStripeFeeSection locationId={editingLocation.id} />
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-red-600">{t('deleteLocationConfirm')}</DialogTitle>
              <DialogDescription>
                {t('areYouSureDeleteLocation')} "{deletingLocation?.name}"
              </DialogDescription>
            </DialogHeader>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
              <p className="text-sm text-red-800">
                <strong>{t('warning')}:</strong> {t('deleteLocationWarning')}
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{t('cancel')}</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('deleting')}</>
                ) : (
                  <><Trash2 className="mr-2 h-4 w-4" />{t('deleteLocationConfirm')}</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Welcome Channel Picker Dialog */}
        <Dialog open={welcomeDialogOpen} onOpenChange={(open) => {
          setWelcomeDialogOpen(open);
          if (!open) setWelcomeTarget(null);
        }}>
          <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Send Message
              </DialogTitle>
              <DialogDescription>
                {welcomeTarget?.kind === "single" && welcomeTarget.loc && (
                  <>To <strong>{welcomeTarget.loc.name}</strong> · {welcomeTarget.loc.locationCode}{welcomeTarget.loc.phone && ` · ${welcomeTarget.loc.phone}`}{welcomeTarget.loc.email && welcomeTarget.loc.phone !== welcomeTarget.loc.email && ` · ${welcomeTarget.loc.email}`}</>

                )}
                {welcomeTarget?.kind === "selected" && (
                  <>To <strong>{selectedIds.size} selected location(s)</strong></>
                )}
                {welcomeTarget?.kind === "all-not-onboarded" && (
                  <>To <strong>{eligibleNotOnboarded.length} location(s) not yet set up</strong></>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Recipient list for bulk / send-all */}
            {welcomeTarget && welcomeTarget.kind !== "single" && (() => {
              const ch = welcomeChannel;
              const candidates = welcomeTarget.kind === "selected"
                ? locations.filter((l) => selectedIds.has(l.id))
                : locations.filter((l) => l.isActive !== false && !l.onboardedAt);
              const sendable = candidates.filter((l) => {
                if (ch === "sms") return !!l.phone;
                if (ch === "whatsapp") return !!l.phone;
                if (ch === "email") return !!l.email;
                // 'both': server sends via whichever channel(s) are available, so either phone or email qualifies
                return !!l.phone || !!l.email;
              });
              const skipped = candidates.filter((l) => !sendable.find(s => s.id === l.id));
              return (
                <div className="space-y-2">
                  <div className="border rounded-md bg-muted/30 max-h-48 overflow-y-auto p-2" data-testid="recipient-list">
                    <div className="text-xs font-medium mb-1 text-muted-foreground">
                      Will receive a message ({sendable.length})
                    </div>
                    {sendable.length === 0 ? (
                      <div className="text-xs text-muted-foreground italic">No eligible recipients for this channel.</div>
                    ) : (
                      <ul className="text-xs space-y-0.5">
                        {sendable.map((r) => (
                          <li key={r.id} className="flex justify-between gap-2" data-testid={`recipient-${r.id}`}>
                            <span className="truncate">{r.name} <span className="text-muted-foreground">· {r.locationCode}</span></span>
                            <span className="text-muted-foreground shrink-0">{r.phone || r.email}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {skipped.length > 0 && (() => {
                    const channelNeedsPhone = ch === "sms" || ch === "whatsapp" || ch === "both";
                    const noPhoneSkipped = channelNeedsPhone ? skipped.filter(r => !r.phone) : [];
                    return (
                      <div className="border border-amber-300 bg-amber-50 rounded-md max-h-36 overflow-y-auto p-2" data-testid="recipient-skipped-list">
                        <div className="text-xs font-medium mb-1 text-amber-800">
                          Will be skipped ({skipped.length})
                          {noPhoneSkipped.length > 0 && (
                            <span className="ml-1 text-orange-700">· {noPhoneSkipped.length} have no phone number</span>
                          )}
                        </div>
                        <ul className="text-xs space-y-0.5">
                          {skipped.map((r) => (
                            <li key={r.id} className="truncate text-amber-900 flex items-center gap-1">
                              {channelNeedsPhone && !r.phone && (
                                <Phone className="h-3 w-3 text-orange-500 shrink-0" aria-label="No phone" />
                              )}
                              {r.name} <span className="opacity-70">· {r.locationCode}</span>
                              {channelNeedsPhone && !r.phone && (
                                <span className="text-orange-600 text-[10px] shrink-0">no phone</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {noPhoneSkipped.length > 0 && (
                          <p className="text-[10px] text-orange-700 mt-1.5 border-t border-amber-200 pt-1">
                            Add phone numbers to these locations to enable SMS/WhatsApp outreach.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            <div className="space-y-5 py-2">
              {/* Channel picker */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channel</Label>
                <RadioGroup
                  value={welcomeChannel}
                  onValueChange={(v) => setWelcomeChannel(v as OperatorWelcomeChannel)}
                  className="grid grid-cols-3 gap-3 mt-2"
                >
                  {/* SMS */}
                  <Label
                    htmlFor="channel-sms"
                    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 cursor-pointer transition-all duration-150 select-none
                      ${welcomeChannel === "sms" ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/40"}
                      ${!serviceStatusQuery.data?.sms.configured ? "opacity-40 cursor-not-allowed" : ""}`}
                    data-testid="channel-option-sms"
                  >
                    <RadioGroupItem id="channel-sms" value="sms" disabled={!serviceStatusQuery.data?.sms.configured} className="sr-only" />
                    <MessageSquare className={`h-5 w-5 ${welcomeChannel === "sms" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium leading-none ${welcomeChannel === "sms" ? "text-primary" : ""}`}>SMS</span>
                    {serviceStatusQuery.data && !serviceStatusQuery.data.sms.configured ? (
                      <span className="text-[10px] text-muted-foreground leading-none">Not configured</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground leading-none">Text message</span>
                    )}
                  </Label>

                  {/* WhatsApp */}
                  <Label
                    htmlFor="channel-whatsapp"
                    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 cursor-pointer transition-all duration-150 select-none
                      ${welcomeChannel === "whatsapp" ? "border-green-500 bg-green-500/5 shadow-sm" : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/40"}
                      ${!serviceStatusQuery.data?.whatsapp?.configured ? "opacity-40 cursor-not-allowed" : ""}`}
                    data-testid="channel-option-whatsapp"
                  >
                    <RadioGroupItem id="channel-whatsapp" value="whatsapp" disabled={!serviceStatusQuery.data?.whatsapp?.configured} className="sr-only" />
                    <MessageCircle className={`h-5 w-5 ${welcomeChannel === "whatsapp" ? "text-green-600" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium leading-none ${welcomeChannel === "whatsapp" ? "text-green-700" : ""}`}>WhatsApp</span>
                    {serviceStatusQuery.data && !serviceStatusQuery.data.whatsapp?.configured ? (
                      <span className="text-[10px] text-muted-foreground leading-none">Not configured</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground leading-none">Messaging app</span>
                    )}
                  </Label>

                  {/* Email */}
                  <Label
                    htmlFor="channel-email"
                    className={`relative flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 cursor-pointer transition-all duration-150 select-none
                      ${welcomeChannel === "email" ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/40"}
                      ${!serviceStatusQuery.data?.email?.configured ? "opacity-40 cursor-not-allowed" : ""}`}
                    data-testid="channel-option-email"
                  >
                    <RadioGroupItem id="channel-email" value="email" disabled={!serviceStatusQuery.data?.email?.configured} className="sr-only" />
                    <Mail className={`h-5 w-5 ${welcomeChannel === "email" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium leading-none ${welcomeChannel === "email" ? "text-primary" : ""}`}>Email</span>
                    {serviceStatusQuery.data && !serviceStatusQuery.data.email?.configured ? (
                      <span className="text-[10px] text-muted-foreground leading-none">Not configured</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground leading-none">Inbox delivery</span>
                    )}
                  </Label>
                </RadioGroup>
                {welcomeChannel !== defaultChannel && (
                  <button
                    type="button"
                    onClick={() => setDefaultChannel(welcomeChannel)}
                    className="text-xs text-muted-foreground hover:text-primary mt-1"
                  >
                    Save "{welcomeChannel === "whatsapp" ? "WhatsApp" : welcomeChannel.toUpperCase()}" as my default
                  </button>
                )}
                <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer select-none" data-testid="checkbox-remember-default-wrap">
                  <Checkbox
                    checked={rememberAsDefault}
                    onCheckedChange={(v) => setRememberAsDefault(!!v)}
                    data-testid="checkbox-remember-default"
                  />
                  <span>
                    Remember <strong>{welcomeChannel === "whatsapp" ? "WhatsApp" : welcomeChannel.toUpperCase()}</strong> as the default channel for {welcomeTarget?.kind === "single" ? "this location" : "these locations"}
                  </span>
                </label>
              </div>

              {serviceStatusQuery.data && (
                <>
                  {welcomeChannel === "sms" && !serviceStatusQuery.data.sms.configured && (
                    <p className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      SMS unavailable: {serviceStatusQuery.data.sms.reason}
                    </p>
                  )}
                  {welcomeChannel === "whatsapp" && !serviceStatusQuery.data.whatsapp?.configured && (
                    <p className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      WhatsApp unavailable: {serviceStatusQuery.data.whatsapp?.reason}
                    </p>
                  )}
                  {welcomeChannel === "email" && !serviceStatusQuery.data.email?.configured && (
                    <p className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      Email unavailable: {serviceStatusQuery.data.email?.reason}
                    </p>
                  )}
                </>
              )}

              {/* Message body — editable for single sends, read-only preview for bulk */}
              {welcomeTarget?.kind === "single" && (
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</Label>
                    {isCustomMessage && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium" data-testid="custom-message-badge">
                        Custom message
                      </span>
                    )}
                  </div>
                  {previewQuery.isLoading && (
                    <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading preview…
                    </div>
                  )}
                  {previewQuery.data && (
                    <>
                      <Tabs
                        defaultValue={previewQuery.data.message.resolvedLanguage}
                        onValueChange={(lang) => {
                          const msg = previewQuery.data!.message[lang as "en" | "he"];
                          const body = (welcomeChannel === "email") ? msg.emailBody : msg.body;
                          setMessageBody(body);
                          setIsCustomMessage(false);
                        }}
                        className="mt-2"
                      >
                        <TabsList className="grid grid-cols-2 w-full">
                          <TabsTrigger value="en" data-testid="preview-tab-en">English {previewQuery.data.message.resolvedLanguage === "en" && "(default)"}</TabsTrigger>
                          <TabsTrigger value="he" data-testid="preview-tab-he">עברית {previewQuery.data.message.resolvedLanguage === "he" && "(default)"}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="en">
                          <Textarea
                            className="mt-1 text-sm leading-relaxed min-h-[140px] resize-y font-sans"
                            value={messageBody}
                            onChange={(e) => handleMessageBodyChange(e.target.value)}
                            dir="ltr"
                            data-testid="preview-body-en"
                            placeholder="Message body…"
                          />
                        </TabsContent>
                        <TabsContent value="he">
                          <Textarea
                            className="mt-1 text-sm leading-relaxed min-h-[140px] resize-y font-sans"
                            value={messageBody}
                            onChange={(e) => handleMessageBodyChange(e.target.value)}
                            dir="rtl"
                            data-testid="preview-body-he"
                            placeholder="גוף ההודעה…"
                          />
                        </TabsContent>
                      </Tabs>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[10px] text-muted-foreground">You can freely edit the message above before sending.</p>
                        {isCustomMessage && (
                          <button
                            type="button"
                            className="text-[10px] text-primary hover:underline shrink-0"
                            onClick={() => {
                              const lang = previewQuery.data!.message.resolvedLanguage;
                              const msg = previewQuery.data!.message[lang];
                              const body = welcomeChannel === "email" ? msg.emailBody : msg.body;
                              setMessageBody(body);
                              setIsCustomMessage(false);
                            }}
                          >
                            Reset to template
                          </button>
                        )}
                      </div>
                      {previewQuery.data.welcomeUrl && (
                        <a
                          href={previewQuery.data.welcomeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary inline-flex items-center gap-1 mt-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Open welcome link in a new tab
                        </a>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Bulk message body — editable template + live sample preview */}
              {welcomeTarget && welcomeTarget.kind !== "single" && (
                <div className="space-y-3">
                  {bulkSingleEligible ? (
                    /* Single-eligible-recipient prefill: show real substituted text instead of {{tokens}}. */
                    <div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message</Label>
                        {isCustomMessage && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium" data-testid="custom-message-badge">
                            Custom message
                          </span>
                        )}
                      </div>
                      {!bulkSinglePreview && (
                        <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading preview…
                        </div>
                      )}
                      {bulkSinglePreview && (
                        <>
                          <Tabs
                            defaultValue={bulkSinglePreview.message.resolvedLanguage}
                            onValueChange={(lang) => {
                              const msg = bulkSinglePreview.message[lang as "en" | "he"];
                              const body = welcomeChannel === "email" ? msg.emailBody : msg.body;
                              setMessageBody(body);
                              setIsCustomMessage(false);
                            }}
                            className="mt-2"
                          >
                            <TabsList className="grid grid-cols-2 w-full">
                              <TabsTrigger value="en" data-testid="bulk-single-tab-en">English {bulkSinglePreview.message.resolvedLanguage === "en" && "(default)"}</TabsTrigger>
                              <TabsTrigger value="he" data-testid="bulk-single-tab-he">עברית {bulkSinglePreview.message.resolvedLanguage === "he" && "(default)"}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="en">
                              <Textarea
                                className="mt-1 text-sm leading-relaxed min-h-[140px] resize-y font-sans"
                                value={messageBody}
                                onChange={(e) => handleMessageBodyChange(e.target.value)}
                                dir="ltr"
                                data-testid="bulk-single-body-en"
                                placeholder="Message body…"
                              />
                            </TabsContent>
                            <TabsContent value="he">
                              <Textarea
                                className="mt-1 text-sm leading-relaxed min-h-[140px] resize-y font-sans"
                                value={messageBody}
                                onChange={(e) => handleMessageBodyChange(e.target.value)}
                                dir="rtl"
                                data-testid="bulk-single-body-he"
                                placeholder="גוף ההודעה…"
                              />
                            </TabsContent>
                          </Tabs>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-muted-foreground">You can freely edit the message above before sending.</p>
                            {isCustomMessage && (
                              <button
                                type="button"
                                className="text-[10px] text-primary hover:underline shrink-0"
                                onClick={() => {
                                  const lang = bulkSinglePreview.message.resolvedLanguage;
                                  const msg = bulkSinglePreview.message[lang];
                                  const body = welcomeChannel === "email" ? msg.emailBody : msg.body;
                                  setMessageBody(body);
                                  setIsCustomMessage(false);
                                }}
                              >
                                Reset to template
                              </button>
                            )}
                          </div>
                          {bulkSinglePreview.welcomeUrl && (
                            <a
                              href={bulkSinglePreview.welcomeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary inline-flex items-center gap-1 mt-1"
                            >
                              <ExternalLink className="h-3 w-3" /> Open welcome link in a new tab
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Message template
                      </Label>
                      <div className="flex items-center gap-1">
                        {isCustomMessage && (
                          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-medium" data-testid="custom-message-badge">
                            Custom
                          </span>
                        )}
                        <button
                          type="button"
                          className="text-[10px] px-1.5 py-0.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-foreground/50"
                          onClick={() => { setMessageBody(getBulkTemplateEN(welcomeChannel)); setIsCustomMessage(true); }}
                        >EN template</button>
                        <button
                          type="button"
                          className="text-[10px] px-1.5 py-0.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-foreground/50"
                          onClick={() => { setMessageBody(BULK_TEMPLATE_HE); setIsCustomMessage(true); }}
                        >עב template</button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                      Use <code className="bg-muted px-0.5 rounded">{"{{name}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{code}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{pin}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{url}}"}</code> — each will be replaced with the recipient's actual values.
                    </p>
                    <Textarea
                      className={`mt-1 text-sm leading-relaxed min-h-[140px] resize-y font-sans ${!isCustomMessage ? "bg-muted/40" : ""}`}
                      value={messageBody}
                      onChange={(e) => handleMessageBodyChange(e.target.value)}
                      dir="auto"
                      data-testid="bulk-message-body"
                      placeholder="Message template…"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {isCustomMessage
                        ? "Custom message — this body (with tokens substituted) will be sent to each recipient."
                        : "Each recipient receives a server-generated default for their language. Load EN or HE template above to customize."}
                    </p>
                  </div>
                  )}

                  {/* Live preview — first selected recipient with "and N more" context.
                      Hidden when there's a single eligible recipient (the editable textarea above already shows the real text). */}
                  {!bulkSingleEligible && (bulkPreviewSamples.en || bulkPreviewSamples.he) && (() => {
                    const primarySample = bulkPreviewSamples.en || bulkPreviewSamples.he;
                    const primaryQuery = bulkPreviewSamples.en ? bulkPreviewEnQuery : bulkPreviewHeQuery;
                    const primaryLang = bulkPreviewSamples.en ? "en" : "he";
                    const hasHe = !!bulkPreviewSamples.he && !!bulkPreviewSamples.en;
                    // Count channel-eligible candidates (must have phone for SMS/WhatsApp, email for email channel)
                    const candidatePool = welcomeTarget.kind === "selected"
                      ? (Array.from(selectedIds).map(id => locations.find(l => l.id === id)).filter(Boolean) as Location[])
                      : locations.filter((l) => l.isActive !== false && !l.onboardedAt);
                    const totalCandidates = candidatePool.filter(l =>
                      welcomeChannel === "email" ? !!l.email : !!l.phone
                    ).length;
                    const moreCount = totalCandidates > 1 ? totalCandidates - 1 : 0;
                    return (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          Preview for <span className="text-foreground font-semibold">{primarySample?.name}</span>
                          {moreCount > 0 && <span className="text-muted-foreground"> and {moreCount} more</span>}
                        </p>
                        {primaryQuery.isLoading && (
                          <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /><span className="text-xs text-muted-foreground">Loading…</span></div>
                        )}
                        {(primaryQuery.data || isCustomMessage) && (() => {
                          // Compute the text to show: custom preview uses client-side substitution, default uses server-rendered text
                          const enText = isCustomMessage && bulkPreviewSamples.en
                            ? applyBulkPreviewTemplate(messageBody, bulkPreviewSamples.en, bulkPreviewEnQuery.data?.welcomeUrl)
                            : bulkPreviewEnQuery.data
                              ? (welcomeChannel === "email" ? bulkPreviewEnQuery.data.message.en.emailBody : bulkPreviewEnQuery.data.message.en.body)
                              : null;
                          const heText = isCustomMessage && bulkPreviewSamples.he
                            ? applyBulkPreviewTemplate(messageBody, bulkPreviewSamples.he, bulkPreviewHeQuery.data?.welcomeUrl)
                            : bulkPreviewHeQuery.data
                              ? (welcomeChannel === "email" ? bulkPreviewHeQuery.data.message.he.emailBody : bulkPreviewHeQuery.data.message.he.body)
                              : null;
                          const singleText = isCustomMessage && primarySample
                            ? applyBulkPreviewTemplate(messageBody, primarySample, primaryQuery.data?.welcomeUrl)
                            : primaryQuery.data
                              ? (welcomeChannel === "email" ? primaryQuery.data.message[primaryLang].emailBody : primaryQuery.data.message[primaryLang].body)
                              : null;
                          return hasHe ? (
                            <Tabs defaultValue={primaryLang} className="text-xs">
                              <TabsList className="grid grid-cols-2 w-full">
                                <TabsTrigger value="en" data-testid="bulk-preview-tab-en">English · {bulkPreviewSamples.en?.locationCode}</TabsTrigger>
                                <TabsTrigger value="he" data-testid="bulk-preview-tab-he">עברית · {bulkPreviewSamples.he?.locationCode}</TabsTrigger>
                              </TabsList>
                              <TabsContent value="en">
                                {enText != null && (
                                  <pre className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-sans mt-2" data-testid="bulk-preview-body-en">
                                    {enText}
                                  </pre>
                                )}
                              </TabsContent>
                              <TabsContent value="he">
                                {heText != null && (
                                  <pre dir="rtl" className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-sans mt-2" data-testid="bulk-preview-body-he">
                                    {heText}
                                  </pre>
                                )}
                              </TabsContent>
                            </Tabs>
                          ) : singleText != null ? (
                            <pre
                              dir={primaryLang === "he" ? "rtl" : "ltr"}
                              className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-sans"
                              data-testid={`bulk-preview-body-${primaryLang}`}
                            >
                              {singleText}
                            </pre>
                          ) : null;
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {streamState && (
              <div data-testid="bulk-send-log-bar" className="mx-1 mb-2 flex items-center gap-2 rounded border bg-muted/50 px-3 py-1.5 font-mono text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                <span data-testid="bulk-send-log-text" className="min-w-0 flex-1 truncate">{streamState.log}</span>
                {streamState.total > 0 && (
                  <span data-testid="bulk-send-log-counter" className="shrink-0 tabular-nums">{streamState.n}/{streamState.total}</span>
                )}
              </div>
            )}

            {sendReport && (
              <div className="mx-1 mb-2 space-y-3 rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                      Send complete — {sendReport.sent} sent, {sendReport.failed} failed
                      {sendReport.skipped > 0 && `, ${sendReport.skipped} skipped`}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      The following locations could not be reached (landlines, out-of-region restrictions, or invalid numbers). All others were sent successfully.
                    </p>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto rounded border border-amber-200 bg-white dark:border-amber-800 dark:bg-background">
                  {sendFailures.map((f, i) => (
                    <div key={i} className={`flex min-w-0 gap-2 px-3 py-2 text-xs ${i > 0 ? "border-t border-amber-100 dark:border-amber-900" : ""}`}>
                      <span className="shrink-0 font-medium text-foreground">{f.name}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{f.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              {sendReport ? (
                <Button onClick={() => { setSendReport(null); setSendFailures([]); setWelcomeDialogOpen(false); setWelcomeTarget(null); }}>
                  Dismiss
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setWelcomeDialogOpen(false)} disabled={dialogIsPending}>Cancel</Button>
                  <Button onClick={sendFromDialog} disabled={dialogIsPending} data-testid="button-send-welcome-confirm">
                    {linkCheckPending
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Checking links…</>
                      : dialogIsPending
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                        : <><Send className="h-4 w-4 mr-2" />Send Message</>
                    }
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Broken-link warning shown before sending welcome messages (single or bulk) — mirrors the inbox composer dialog. */}
        <AlertDialog open={brokenLinkWarning !== null} onOpenChange={(o) => !o && setBrokenLinkWarning(null)}>
          <AlertDialogContent data-testid="dialog-bulk-broken-link-warning">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                Potentially broken link detected
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>The following link{(brokenLinkWarning?.links.length ?? 0) > 1 ? "s" : ""} in your message could not be verified:</p>
                  <ul className="space-y-1">
                    {(brokenLinkWarning?.links ?? []).map(({ url, reason }) => (
                      <li key={url} className="flex flex-col gap-0.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                        <span className="break-all font-mono text-xs text-foreground">{url}</span>
                        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground">You can go back to fix the link, or send the campaign anyway.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-bulk-broken-link-go-back">Go back to edit</AlertDialogCancel>
              <AlertDialogAction
                data-testid="button-bulk-broken-link-send-anyway"
                onClick={() => {
                  const proceed = brokenLinkWarning?.onConfirm;
                  setBrokenLinkWarning(null);
                  if (proceed) proceed();
                }}
              >
                Send anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* PIN Change Dialog */}
        <Dialog open={isPinDialogOpen} onOpenChange={(open) => {
          setIsPinDialogOpen(open);
          if (!open) { setNewPin(""); setConfirmPin(""); setPinLocation(null); }
        }}>
          <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Change Operator PIN
              </DialogTitle>
              <DialogDescription>
                {pinLocation ? (
                  <>Set a new 4–6 digit PIN for <strong>{pinLocation.name}</strong> ({pinLocation.locationCode}). No current PIN required.</>
                ) : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="admin-new-pin">New PIN</Label>
                <Input
                  id="admin-new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="4–6 digits"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  data-testid="input-new-pin"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-confirm-pin">Confirm PIN</Label>
                <Input
                  id="admin-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Repeat PIN"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  data-testid="input-confirm-pin"
                />
              </div>
              {newPin && confirmPin && newPin !== confirmPin && (
                <p className="text-xs text-destructive">PINs do not match.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPinDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!pinLocation) return;
                  changePinMutation.mutate({ id: pinLocation.id, newPin, confirmPin });
                }}
                disabled={changePinMutation.isPending || !newPin || !confirmPin || newPin !== confirmPin || newPin.length < 4}
                data-testid="button-save-pin"
              >
                {changePinMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  : <><ShieldCheck className="h-4 w-4 mr-2" />Save PIN</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Restock Email Confirmation Dialog */}
        <AlertDialog open={!!restockEmailTarget} onOpenChange={(open) => { if (!open) setRestockEmailTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                {t('restockEmailConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    {t('restockEmailConfirmDesc').replace('{email}', restockEmailTarget?.email || '')}
                  </p>
                  {restockEmailTarget && (() => {
                    const targetRegion = regions.find(r => r.id === restockEmailTarget.regionId);
                    const rSlug = (targetRegion?.slug || '').toLowerCase();
                    const rName = (targetRegion?.name || '').toLowerCase();
                    const isUS = rSlug.includes('united-states') || rSlug === 'usa' || rSlug === 'us' || rSlug.includes('canada') || rName.includes('united states') || rName.includes('canada');
                    const isAU = !isUS && (rSlug.includes('australia') || rName.includes('australia'));
                    const isUK = !isUS && !isAU && (rSlug.includes('uk') || rSlug.includes('europe') || rSlug.includes('united-kingdom') || rName.includes('uk') || rName.includes('europe') || rName.includes('united kingdom'));
                    const orderSite = isUS ? 'usa.banzworld.com' : isAU ? 'banzworld.com.au' : isUK ? 'banzworld.co.uk' : 'usa.banzworld.com via MyUS.com';
                    return (
                      <div className="space-y-2">
                        <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                          <div><span className="font-medium">{t('emailFieldTo')}</span> {restockEmailTarget.email}</div>
                          <div><span className="font-medium">{t('emailFieldLocation')}</span> {restockEmailTarget.name} ({restockEmailTarget.locationCode})</div>
                          <div><span className="font-medium">{t('emailFieldSubject')}</span> Baby Banz Earmuffs Gemach — Restocking Instructions</div>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                          <p className="font-medium text-foreground">{t('emailPreviewLabel')}</p>
                          <p className="italic text-foreground/80">Hello, <strong>{restockEmailTarget.nameHe || restockEmailTarget.name}</strong> gemach!</p>
                          <p>{t('emailOrderLinkLabel')} <span className="font-mono">{orderSite}</span></p>
                          <p>{t('emailLoginLabel')} earmuffsgemach@gmail.com / Babybanz</p>
                          <p>{t('emailDiscountCodesLabel')} GEMACHSHIP (free shipping) + GEMACH (50% off)</p>
                          {!isUS && <p>{t('emailIntlNote')}</p>}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={sendRestockEmailMutation.isPending}>
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => restockEmailTarget && sendRestockEmailMutation.mutate(restockEmailTarget.id)}
                disabled={sendRestockEmailMutation.isPending}
              >
                {sendRestockEmailMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('sending')}…</>
                  : <><Mail className="h-4 w-4 mr-2" />{t('sendRestockEmail')}</>
                }
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

    </TooltipProvider>
  );
}
