import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getRegions, updateLocation, deleteLocation } from "@/lib/api";
import { Region, Location, OPERATOR_WELCOME_CHANNELS, type OperatorWelcomeChannel } from "@shared/schema";
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
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Wifi,
  WifiOff,
  CreditCard,
  Save,
  Settings,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ---- Helper sub-components ----

function OnboardingStatusBadge({ status }: { status: "onboarded" | "sent" | "failed" | "not-sent" }) {
  if (status === "onboarded") return <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700">Onboarded</Badge>;
  if (status === "sent") return <Badge variant="secondary" className="text-xs">Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="text-xs">Failed</Badge>;
  return <Badge variant="outline" className="text-xs text-muted-foreground">Not sent</Badge>;
}

function NoPhoneBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-xs border-orange-400 text-orange-700 bg-orange-50 cursor-help">
            <Phone className="h-3 w-3 mr-1" />
            No phone
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          This location has no phone number. SMS and WhatsApp messages cannot be sent until a phone number is added.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface StripeAdminSettings {
  maxCardAgeDays: number;
  requirePreChargeNotification: boolean;
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

function GlobalStripeSettingsPanel() {
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
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (data && !seeded) {
      setMaxCardAgeDays(String(data.maxCardAgeDays));
      setRequireNotify(data.requirePreChargeNotification);
      setSeeded(true);
    }
  }, [data, seeded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/admin/settings/stripe", {
        maxCardAgeDays: Number(maxCardAgeDays),
        requirePreChargeNotification: requireNotify,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/stripe"] });
      setSeeded(false);
      toast({ title: "Saved", description: "Global Stripe settings updated." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <details className="mb-6 group">
      <summary className="flex items-center gap-2 cursor-pointer list-none rounded-lg border bg-card px-4 py-3 text-sm font-medium select-none hover:bg-muted/50 transition-colors">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <span>Global Stripe charge settings</span>
        <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <Card className="mt-0 rounded-t-none border-t-0">
        <CardContent className="pt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
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
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving…" : "Save settings"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </details>
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
      comingSoon: false,
    },
    {
      label: "Email",
      configured: status?.email?.configured ?? false,
      reason: status?.email?.reason,
      comingSoon: false,
    },
    {
      label: "WhatsApp",
      configured: false,
      reason: "Coming soon — WhatsApp Business setup required.",
      comingSoon: true,
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 px-1 py-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs">
          {item.comingSoon ? (
            <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
              {item.label}: Not configured
            </Badge>
          ) : item.configured ? (
            <Badge variant="outline" className="text-xs font-normal border-green-500 text-green-700 bg-green-50">
              <CheckCircle className="h-3 w-3 mr-1 text-green-600" />
              {item.label}: Ready
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

export default function AdminLocations() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onboardingFilter, setOnboardingFilter] = useState<string>(() => {
    try {
      return localStorage.getItem("adminOnboardingFilter") ?? "all";
    } catch {
      return "all";
    }
  });
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set());
  const regionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinLocation, setPinLocation] = useState<Location | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // ===== Bulk selection (for the main table) =====
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ===== Onboarding (SMS / Email welcome) =====
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [welcomeTarget, setWelcomeTarget] = useState<{ kind: "single"; id: number; loc: Location } | { kind: "selected" } | { kind: "all-not-onboarded" } | null>(null);
  const [defaultChannel, setDefaultChannelState] = useState<OperatorWelcomeChannel>(() => {
    try {
      const stored = localStorage.getItem("adminDefaultWelcomeChannel");
      // Migrate old 'whatsapp' value to 'sms' since WhatsApp is now disabled
      if (stored === "whatsapp") return "sms";
      if (stored && (OPERATOR_WELCOME_CHANNELS as readonly string[]).includes(stored)) return stored as OperatorWelcomeChannel;
    } catch {}
    return "sms";
  });
  const [welcomeChannel, setWelcomeChannel] = useState<OperatorWelcomeChannel>(defaultChannel);
  const [rememberAsDefault, setRememberAsDefault] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageBodyInitialized, setMessageBodyInitialized] = useState(false);

  // Template strings used for bulk sends (placeholder tokens are substituted per-location on the server)
  const BULK_TEMPLATE_EN =
    "Hi {{name}}, you've been invited to manage your {{code}} gemach dashboard. Your one-time login PIN is {{pin}}. Tap here to get started:\n{{url}}\n— Earmuffs Gemach";
  const BULK_TEMPLATE_HE =
    'שלום {{name}}, הוזמנת לנהל את דשבורד הגמ"ח שלך ({{code}}). קוד הכניסה החד-פעמי שלך: {{pin}}. לחץ כאן להתחלה:\n{{url}}\n— גמ"ח אטמי';

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

  // Initialize message body from preview when it loads
  useEffect(() => {
    if (previewQuery.data && !messageBodyInitialized) {
      const lang = previewQuery.data.message.resolvedLanguage;
      const msg = previewQuery.data.message[lang];
      const body = (welcomeChannel === "email") ? msg.emailBody : msg.body;
      setMessageBody(body);
      setMessageBodyInitialized(true);
    }
  }, [previewQuery.data, messageBodyInitialized, welcomeChannel]);

  // When channel changes, update message body from preview
  useEffect(() => {
    if (previewQuery.data && messageBodyInitialized) {
      const lang = previewQuery.data.message.resolvedLanguage;
      const msg = previewQuery.data.message[lang];
      const body = (welcomeChannel === "email") ? msg.emailBody : msg.body;
      setMessageBody(body);
    }
  }, [welcomeChannel]);

  type ChannelResult = { ok: boolean; sid?: string; error?: string; hint?: string };
  type SendOneResponse = {
    success: boolean;
    results: {
      sms?: ChannelResult;
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

  const sendWelcomeOneMutation = useMutation<SendOneResponse, Error, { id: number; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string }>({
    mutationFn: async ({ id, channel, rememberAsDefault, messageBody }) => {
      const res = await apiRequest("POST", `/api/admin/locations/${id}/send-onboarding-welcome`, {
        channel,
        rememberAsDefault,
        ...(messageBody ? { messageBody } : {}),
      });
      return res.json() as Promise<SendOneResponse>;
    },
    onSuccess: (data) => {
      const sms = data.results?.sms;
      const email = data.results?.email;
      const parts: string[] = [];
      if (sms) parts.push(`SMS: ${sms.ok ? "✓" : "✗ " + (sms.error || "failed")}`);
      if (email) parts.push(`Email: ${email.ok ? "✓" : "✗ " + (email.error || "failed")}`);
      toast({
        title: data.results?.anySuccess ? "Welcome sent" : "Welcome failed",
        description: parts.join(" · ") || "No channels selected",
        variant: data.results?.anySuccess ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      if (data.results?.anySuccess) {
        setWelcomeDialogOpen(false);
        setWelcomeTarget(null);
      }
    },
    onError: (err) => toast({ title: "Error", description: errorMessage(err, "Failed to send"), variant: "destructive" }),
  });

  const sendBulkOnboardingMutation = useMutation<SendBulkResponse, Error, { locationIds: number[]; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string }>({
    mutationFn: async ({ locationIds, channel, rememberAsDefault, messageBody }) => {
      const res = await apiRequest("POST", `/api/admin/locations/onboarding/send-bulk`, { locationIds, channel, rememberAsDefault, messageBody });
      return res.json() as Promise<SendBulkResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk welcome complete",
        description: `Sent: ${data.summary?.sent ?? 0} · Skipped: ${data.summary?.skipped ?? 0} · Failed: ${data.summary?.failed ?? 0}`,
        variant: (data.summary?.failed ?? 0) > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setWelcomeDialogOpen(false);
      setWelcomeTarget(null);
      setSelectedIds(new Set());
    },
    onError: (err) => toast({ title: "Error", description: errorMessage(err, "Failed"), variant: "destructive" }),
  });

  const sendAllNotOnboardedMutation = useMutation<SendAllResponse, Error, { channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string }>({
    mutationFn: async ({ channel, rememberAsDefault, messageBody }) => {
      const res = await apiRequest("POST", `/api/admin/locations/onboarding/send-all`, { channel, rememberAsDefault, messageBody });
      return res.json() as Promise<SendAllResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "All-not-yet-onboarded complete",
        description: `Eligible: ${data.eligible ?? 0} · Sent: ${data.summary?.sent ?? 0} · Failed: ${data.summary?.failed ?? 0}`,
        variant: (data.summary?.failed ?? 0) > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setWelcomeDialogOpen(false);
      setWelcomeTarget(null);
    },
    onError: (err) => toast({ title: "Error", description: errorMessage(err, "Failed"), variant: "destructive" }),
  });

  const getOnboardingStatus = (loc: Location): "onboarded" | "sent" | "failed" | "not-sent" => {
    if (loc.onboardedAt) return "onboarded";
    const sms = loc.welcomeSmsStatus?.toLowerCase();
    const wa = loc.welcomeWhatsappStatus?.toLowerCase();
    const em = loc.welcomeEmailStatus?.toLowerCase();
    const sentLike = (s?: string) => s === "sent" || s === "delivered" || s === "queued" || s === "sending" || s === "accepted";
    const failedLike = (s?: string) => s === "failed" || s === "undelivered";
    if (sentLike(sms) || sentLike(wa) || sentLike(em)) return "sent";
    if (failedLike(sms) || failedLike(wa) || failedLike(em)) return "failed";
    return "not-sent";
  };

  const openSinglePicker = (loc: Location) => {
    setWelcomeTarget({ kind: "single", id: loc.id, loc });
    const locDefaultRaw = loc.defaultWelcomeChannel as string | null;
    const ch = locDefaultRaw && locDefaultRaw !== "whatsapp" && (OPERATOR_WELCOME_CHANNELS as readonly string[]).includes(locDefaultRaw)
      ? locDefaultRaw as OperatorWelcomeChannel
      : defaultChannel;
    setWelcomeChannel(ch);
    setRememberAsDefault(false);
    setMessageBody("");
    setMessageBodyInitialized(false);
    setWelcomeDialogOpen(true);
  };

  const openSelectedPicker = () => {
    if (selectedIds.size === 0) return;
    setWelcomeTarget({ kind: "selected" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setMessageBody(BULK_TEMPLATE_EN);
    setMessageBodyInitialized(true);
    setWelcomeDialogOpen(true);
  };

  const openAllNotOnboardedPicker = () => {
    setWelcomeTarget({ kind: "all-not-onboarded" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setMessageBody(BULK_TEMPLATE_EN);
    setMessageBodyInitialized(true);
    setWelcomeDialogOpen(true);
  };

  const sendFromDialog = () => {
    if (!welcomeTarget) return;
    if (welcomeTarget.kind === "single") {
      sendWelcomeOneMutation.mutate({
        id: welcomeTarget.id,
        channel: welcomeChannel,
        rememberAsDefault,
        messageBody: messageBody.trim() || undefined,
      });
    } else if (welcomeTarget.kind === "selected") {
      sendBulkOnboardingMutation.mutate({ locationIds: Array.from(selectedIds), channel: welcomeChannel, rememberAsDefault, messageBody: messageBody.trim() || undefined });
    } else {
      sendAllNotOnboardedMutation.mutate({ channel: welcomeChannel, rememberAsDefault, messageBody: messageBody.trim() || undefined });
    }
  };

  const dialogIsPending = sendWelcomeOneMutation.isPending || sendBulkOnboardingMutation.isPending || sendAllNotOnboardedMutation.isPending;

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

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  // Bulk preview samples for non-single sends
  const bulkPreviewSamples = useMemo(() => {
    if (!welcomeTarget || welcomeTarget.kind === "single") return { en: null as Location | null, he: null as Location | null };
    const ch = welcomeChannel;
    const needsPhone = ch === "sms" || ch === "both";
    const needsEmail = ch === "email" || ch === "both";
    const candidates = welcomeTarget.kind === "selected"
      ? locations.filter((l) => selectedIds.has(l.id) && (needsPhone ? !!l.phone : true) && (needsEmail ? !!l.email : true))
      : locations.filter((l) => l.isActive !== false && !l.onboardedAt && (needsPhone ? !!l.phone : true) && (needsEmail ? !!l.email : true));
    const en = candidates.find((l) => !l.nameHe) || null;
    const he = candidates.find((l) => !!l.nameHe) || null;
    return { en, he };
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


  // Eligible for bulk "not onboarded" send (SMS or email available)
  const eligibleNotOnboarded = useMemo(
    () => locations.filter((l) => getOnboardingStatus(l) !== "onboarded" && (!!l.phone || !!l.email)),
    [locations]
  );

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

  const handleEditLocation = (location: Location) => {
    setEditingLocation(location);
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
    if (onboardingFilter !== "all") {
      if (onboardingFilter === "no-phone") {
        if (!!location.phone) return false;
      } else {
        const obStatus = getOnboardingStatus(location);
        if (onboardingFilter === "not-sent" && obStatus !== "not-sent") return false;
        if (onboardingFilter === "sent" && obStatus !== "sent") return false;
        if (onboardingFilter === "failed" && obStatus !== "failed") return false;
        if (onboardingFilter === "onboarded" && obStatus !== "onboarded") return false;
      }
    }
    return true;
  }), [locations, searchTerm, statusFilter, onboardingFilter, regions, language]);

  const groupedLocations = useMemo(() => {
    const sortedRegions = [...regions].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return sortedRegions
      .map(region => ({
        region,
        locations: filteredLocations.filter(l => l.regionId === region.id),
      }))
      .filter(g => g.locations.length > 0);
  }, [regions, filteredLocations]);

  // All visible location IDs (for select-all in current view)
  const allVisibleIds = useMemo(() => filteredLocations.map(l => l.id), [filteredLocations]);

  const hasInitializedExpandedRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedExpandedRef.current && regions.length > 0) {
      hasInitializedExpandedRef.current = true;
      setExpandedRegions(new Set(regions.map(r => r.id)));
    }
  }, [regions]);

  const isFilterActive = searchTerm !== "" || statusFilter !== "all" || onboardingFilter !== "all";

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

  const totalLocations = locations.length;
  const activeLocations = locations.filter(l => l.isActive).length;
  const inactiveLocations = totalLocations - activeLocations;

  // Determine bulk send label based on channel for "send to selected" button
  const selectedCount = selectedIds.size;

  return (
    <TooltipProvider>
    <div className="py-6 md:py-10">
      <div className="container mx-auto px-4">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 mb-6">
          <Button variant="ghost" onClick={() => window.location.href = '/admin'} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/'} className="flex items-center gap-2">
            <Home className="h-4 w-4" />
            {t('home')}
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{t('locationManagementTitle')}</h1>
            <p className="text-muted-foreground text-sm md:text-base">{t('manageAllGemachLocations')}</p>
          </div>
          <div className="mt-4 md:mt-0">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('addNewLocation')}
              </Button>
              <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('createNewLocation')}</DialogTitle>
                  <DialogDescription>{t('addNewLocationDescription')}</DialogDescription>
                </DialogHeader>
                <LocationForm regions={regions} onSuccess={() => setIsCreateDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <GlobalStripeSettingsPanel />

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalLocations}</p>
                <p className="text-sm text-muted-foreground">{t('totalLocations')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeLocations}</p>
                <p className="text-sm text-muted-foreground">{t('active')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-gray-100">
                <XCircle className="h-6 w-6 text-gray-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{inactiveLocations}</p>
                <p className="text-sm text-muted-foreground">{t('inactive')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle>{t('locations')}</CardTitle>
                  <CardDescription>{t('manageAllGemachLocations')}</CardDescription>
                </div>
                {/* Bulk welcome action buttons */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={openAllNotOnboardedPicker}
                    disabled={dialogIsPending || eligibleNotOnboarded.length === 0}
                    data-testid="button-onboarding-all-not-onboarded"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Send Welcome ({eligibleNotOnboarded.length})
                  </Button>
                  {selectedCount > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={openSelectedPicker}
                      disabled={dialogIsPending}
                      data-testid="button-onboarding-bulk-selected"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Send to Selected ({selectedCount})
                    </Button>
                  )}
                </div>
              </div>

              {/* Service Status Bar */}
              <ServiceStatusBar status={serviceStatusQuery.data} loading={serviceStatusQuery.isLoading} />

              {/* Filters */}
              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('search')}
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('filterByStatus')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('allStatuses')}</SelectItem>
                    <SelectItem value="active">{t('activeOnly')}</SelectItem>
                    <SelectItem value="inactive">{t('inactiveOnly')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={onboardingFilter} onValueChange={v => { try { localStorage.setItem("adminOnboardingFilter", v); } catch {} setOnboardingFilter(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Onboarding status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All onboarding</SelectItem>
                    <SelectItem value="not-sent">Not sent</SelectItem>
                    <SelectItem value="sent">Sent (awaiting)</SelectItem>
                    <SelectItem value="failed">Failed delivery</SelectItem>
                    <SelectItem value="onboarded">Onboarded</SelectItem>
                    <SelectItem value="no-phone">No phone (cannot send)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(statusFilter !== "all" || searchTerm || onboardingFilter !== "all") && (
                <div className="mt-1 flex flex-wrap gap-2 items-center">
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
                      Onboarding: {onboardingFilter === "not-sent" ? "Not sent" : onboardingFilter === "sent" ? "Sent (awaiting)" : onboardingFilter === "failed" ? "Failed" : onboardingFilter === "no-phone" ? "No phone" : "Onboarded"}
                      <button onClick={() => setOnboardingFilter("all")} className="ml-1 hover:text-destructive">×</button>
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setOnboardingFilter("all"); }} className="text-xs">
                    {t('clearAll')}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="px-0 pb-0">
            {/* Summary + expand/collapse all */}
            <div className="flex items-center justify-between px-6 pb-3">
              <div className="text-sm text-muted-foreground">
                {t('showing')} {filteredLocations.length} / {totalLocations} {t('locations')}
                {selectedCount > 0 && (
                  <span className="ml-2 text-primary font-medium">· {selectedCount} selected</span>
                )}
              </div>
              {groupedLocations.length > 1 && (
                <button
                  onClick={toggleAll}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ChevronsUpDown className="h-3 w-3" />
                  {allExpanded ? t('collapseAll') : t('expandAll')}
                </button>
              )}
            </div>

            {/* Region quick-jump pill bar */}
            {groupedLocations.length > 1 && (
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-2 flex flex-wrap gap-2">
                {groupedLocations.map(({ region }) => {
                  const regionName = language === "he" && region.nameHe ? region.nameHe : region.name;
                  return (
                    <button
                      key={region.id}
                      onClick={() => scrollToRegion(region.id)}
                      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-primary hover:text-primary-foreground hover:border-primary"
                    >
                      {regionName}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Region-grouped sections */}
            {groupedLocations.length === 0 ? (
              <div className="px-6 py-8 text-center">
                {isFilterActive ? (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">{t('noLocationsMatch')}</p>
                    <p className="text-sm text-gray-500">{t('tryAdjustingSearch')}</p>
                    <Button variant="outline" size="sm" onClick={() => { setSearchTerm(""); setStatusFilter("all"); setOnboardingFilter("all"); }}>
                      {t('clearAll')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground">{t('noLocationsFound')}</p>
                    <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">{t('addNewLocation')}</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {groupedLocations.map(({ region, locations: regionLocs }) => {
                  const regionName = language === "he" && region.nameHe ? region.nameHe : region.name;
                  const isExpanded = isFilterActive || expandedRegions.has(region.id);
                  const regionIds = regionLocs.map(l => l.id);
                  const allRegionSelected = regionIds.every(id => selectedIds.has(id));
                  return (
                    <div key={region.id} ref={(el) => { regionRefs.current[region.id] = el; }}>
                      {/* Section header */}
                      <button
                        className={`w-full flex items-center justify-between px-6 py-3 transition-colors text-left ${isFilterActive ? "cursor-default" : "hover:bg-muted/40"}`}
                        onClick={() => { if (!isFilterActive) toggleRegion(region.id); }}
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          }
                          <span className="font-semibold text-sm">{regionName}</span>
                          <Badge variant="secondary" className="text-xs">
                            {regionLocs.length} {regionLocs.length === 1 ? t('locationSingular') : t('locations')}
                          </Badge>
                        </div>
                      </button>

                      {/* Collapsible table */}
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8">
                                  <Checkbox
                                    checked={regionIds.length > 0 && allRegionSelected}
                                    onCheckedChange={(v) => {
                                      setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        if (v) regionIds.forEach(id => next.add(id));
                                        else regionIds.forEach(id => next.delete(id));
                                        return next;
                                      });
                                    }}
                                    aria-label={`Select all in ${regionName}`}
                                  />
                                </TableHead>
                                <TableHead className="min-w-[200px]">{t('name')}</TableHead>
                                <TableHead className="min-w-[180px] hidden md:table-cell">{t('coordinatorName')}</TableHead>
                                <TableHead className="min-w-[80px] hidden lg:table-cell">PIN</TableHead>
                                <TableHead className="min-w-[100px]">Onboarding</TableHead>
                                <TableHead className="min-w-[80px]">{t('status')}</TableHead>
                                <TableHead className="min-w-[80px]">{t('actions')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {regionLocs.map((location) => {
                                const onboardingStatus = getOnboardingStatus(location);
                                const sms = location.welcomeSmsStatus;
                                const smsErr = location.welcomeSmsError;
                                const em = location.welcomeEmailStatus;
                                const emErr = location.welcomeEmailError;
                                const lastSentAt = location.welcomeSentAt as string | Date | null;
                                const sentDaysAgo = lastSentAt ? Math.max(0, Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 86400000)) : null;
                                return (
                                  <TableRow key={location.id} data-testid={`row-location-${location.id}`}>
                                    <TableCell>
                                      <Checkbox
                                        checked={selectedIds.has(location.id)}
                                        onCheckedChange={(v) => toggleOne(location.id, !!v)}
                                        aria-label={`Select ${location.name}`}
                                        data-testid={`checkbox-location-${location.id}`}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                      <div className="flex items-center gap-2">
                                        <span>{localized(location, "name")}</span>
                                        {location.locationCode && (
                                          <Badge variant="outline" className="text-xs">{location.locationCode}</Badge>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground flex items-center mt-1">
                                        <MapPin className="h-3 w-3 mr-1" />
                                        {localized(location, "address")}
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                      <div>{localized(location, "contactPerson")}</div>
                                      <div className="text-xs text-muted-foreground flex items-center">
                                        <Phone className="h-3 w-3 mr-1" />
                                        {location.phone || <span className="italic">No phone</span>}
                                      </div>
                                      <div className="text-xs text-muted-foreground flex items-center">
                                        <Mail className="h-3 w-3 mr-1" />
                                        {location.email || <span className="italic">No email</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell">
                                      {location.operatorPin ? (
                                        <Badge variant="outline" className="text-xs bg-muted text-muted-foreground border-border">PIN set</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">No PIN</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-0.5">
                                        <OnboardingStatusBadge status={onboardingStatus} />
                                        {!location.phone && onboardingStatus !== "onboarded" && <NoPhoneBadge />}
                                        {onboardingStatus !== "onboarded" && sentDaysAgo !== null && (
                                          <div className="text-[10px] text-muted-foreground" data-testid={`sent-ago-${location.id}`}>
                                            Sent {sentDaysAgo === 0 ? "today" : sentDaysAgo === 1 ? "1 day ago" : `${sentDaysAgo} days ago`}
                                          </div>
                                        )}
                                        {sms && (
                                          <div className={`text-[10px] ${sms === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                                            SMS: {sms}{sms === "failed" && smsErr ? ` — ${smsErr}` : ""}
                                          </div>
                                        )}
                                        {em && (
                                          <div className={`text-[10px] ${em === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                                            Email: {em}{em === "failed" && emErr ? ` — ${emErr}` : ""}
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Switch
                                        checked={Boolean(location.isActive)}
                                        onCheckedChange={() => toggleLocationStatus(location.id, Boolean(location.isActive))}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">Open menu</span>
                                            <MoreVertical className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => openSinglePicker(location)}>
                                            <Send className="mr-2 h-4 w-4" />
                                            Send Welcome
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleEditLocation(location)}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            {t('editLocation')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleChangePinForLocation(location)}>
                                            <KeyRound className="mr-2 h-4 w-4" />
                                            Change PIN
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleDeleteLocation(location)}
                                            className="text-red-600 focus:text-red-600"
                                          >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            {t('deleteLocationConfirm')}
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Location Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('editLocation')}</DialogTitle>
              <DialogDescription>{t('editLocationDescription')}</DialogDescription>
            </DialogHeader>
            {editingLocation && (
              <>
                <LocationForm location={editingLocation} regions={regions} onSuccess={closeEditDialog} />
                <LocationStripeFeeSection locationId={editingLocation.id} />
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
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
                Send Welcome Message
              </DialogTitle>
              <DialogDescription>
                {welcomeTarget?.kind === "single" && welcomeTarget.loc && (
                  <>To <strong>{welcomeTarget.loc.name}</strong> · {welcomeTarget.loc.locationCode}{welcomeTarget.loc.phone && ` · ${welcomeTarget.loc.phone}`}{welcomeTarget.loc.email && welcomeTarget.loc.phone !== welcomeTarget.loc.email && ` · ${welcomeTarget.loc.email}`}</>

                )}
                {welcomeTarget?.kind === "selected" && (
                  <>To <strong>{selectedIds.size} selected location(s)</strong></>
                )}
                {welcomeTarget?.kind === "all-not-onboarded" && (
                  <>To <strong>{eligibleNotOnboarded.length} location(s) not yet onboarded</strong></>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Recipient list for bulk / send-all */}
            {welcomeTarget && welcomeTarget.kind !== "single" && (() => {
              const ch = welcomeChannel;
              const needsPhone = ch === "sms" || ch === "both";
              const needsEmail = ch === "email" || ch === "both";
              const candidates = welcomeTarget.kind === "selected"
                ? locations.filter((l) => selectedIds.has(l.id))
                : locations.filter((l) => l.isActive !== false && !l.onboardedAt);
              const sendable = candidates.filter((l) => {
                if (ch === "sms") return !!l.phone;
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
                    const channelNeedsPhone = ch === "sms" || ch === "both";
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

            <div className="space-y-4 py-2">
              {/* Channel picker */}
              <div>
                <Label className="text-sm font-medium">Channel</Label>
                <RadioGroup
                  value={welcomeChannel}
                  onValueChange={(v) => setWelcomeChannel(v as OperatorWelcomeChannel)}
                  className="grid grid-cols-2 gap-2 mt-2"
                >
                  {/* SMS */}
                  <Label
                    htmlFor="channel-sms"
                    className={`flex flex-col items-center gap-1 border rounded-md p-2 text-sm cursor-pointer ${welcomeChannel === "sms" ? "border-primary bg-primary/5" : "border-input"} ${!serviceStatusQuery.data?.sms.configured ? "opacity-50" : ""}`}
                    data-testid="channel-option-sms"
                  >
                    <RadioGroupItem id="channel-sms" value="sms" disabled={!serviceStatusQuery.data?.sms.configured} className="sr-only" />
                    <MessageSquare className="h-4 w-4" />
                    SMS
                    {serviceStatusQuery.data && !serviceStatusQuery.data.sms.configured && (
                      <span className="text-[10px] text-muted-foreground">Not configured</span>
                    )}
                  </Label>

                  {/* Email */}
                  <Label
                    htmlFor="channel-email"
                    className={`flex flex-col items-center gap-1 border rounded-md p-2 text-sm cursor-pointer ${welcomeChannel === "email" ? "border-primary bg-primary/5" : "border-input"} ${!serviceStatusQuery.data?.email?.configured ? "opacity-50" : ""}`}
                    data-testid="channel-option-email"
                  >
                    <RadioGroupItem id="channel-email" value="email" disabled={!serviceStatusQuery.data?.email?.configured} className="sr-only" />
                    <Mail className="h-4 w-4" />
                    Email
                    {serviceStatusQuery.data && !serviceStatusQuery.data.email?.configured && (
                      <span className="text-[10px] text-muted-foreground">Not configured</span>
                    )}
                  </Label>

                  {/* Both (SMS + Email) */}
                  {(() => {
                    const bothEnabled = !!serviceStatusQuery.data?.sms.configured && !!serviceStatusQuery.data?.email?.configured;
                    return (
                      <Label
                        htmlFor="channel-both"
                        className={`flex flex-col items-center gap-1 border rounded-md p-2 text-sm cursor-pointer ${welcomeChannel === "both" ? "border-primary bg-primary/5" : "border-input"} ${!bothEnabled ? "opacity-50" : ""}`}
                        data-testid="channel-option-both"
                      >
                        <RadioGroupItem id="channel-both" value="both" disabled={!bothEnabled} className="sr-only" />
                        <span className="flex gap-0.5"><MessageSquare className="h-4 w-4" /><Mail className="h-4 w-4" /></span>
                        Both (SMS + Email)
                        {serviceStatusQuery.data && !bothEnabled && (
                          <span className="text-[10px] text-muted-foreground">Needs both configured</span>
                        )}
                      </Label>
                    );
                  })()}

                  {/* WhatsApp — disabled, coming soon */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex flex-col items-center gap-1 border rounded-md p-2 text-sm opacity-40 cursor-not-allowed select-none border-input"
                        data-testid="channel-option-whatsapp"
                      >
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                        <span className="text-[10px] text-muted-foreground">Coming soon</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      WhatsApp requires WhatsApp Business API approval — coming soon.
                    </TooltipContent>
                  </Tooltip>
                </RadioGroup>
                {welcomeChannel !== defaultChannel && (
                  <button
                    type="button"
                    onClick={() => setDefaultChannel(welcomeChannel)}
                    className="text-xs text-muted-foreground hover:text-primary mt-1"
                  >
                    Save "{welcomeChannel === "both" ? "Both (SMS + Email)" : welcomeChannel}" as my default
                  </button>
                )}
                <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer select-none" data-testid="checkbox-remember-default-wrap">
                  <Checkbox
                    checked={rememberAsDefault}
                    onCheckedChange={(v) => setRememberAsDefault(!!v)}
                    data-testid="checkbox-remember-default"
                  />
                  <span>
                    Remember <strong>{welcomeChannel === "both" ? "Both (SMS + Email)" : welcomeChannel}</strong> as the default channel for {welcomeTarget?.kind === "single" ? "this location" : "these locations"}
                  </span>
                </label>
              </div>

              {serviceStatusQuery.data && (
                <>
                  {(welcomeChannel === "sms" || welcomeChannel === "both") && !serviceStatusQuery.data.sms.configured && (
                    <p className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      SMS unavailable: {serviceStatusQuery.data.sms.reason}
                    </p>
                  )}
                  {(welcomeChannel === "email" || welcomeChannel === "both") && !serviceStatusQuery.data.email?.configured && (
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
                  <Label className="text-sm font-medium">
                    {welcomeChannel === "both" ? "SMS Message" : "Message"}
                  </Label>
                  {welcomeChannel === "both" && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 mb-1 flex items-start gap-1">
                      <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                      This text is sent as SMS. The email is auto-formatted using the same content and delivered separately.
                    </p>
                  )}
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
                        }}
                        className="mt-2"
                      >
                        <TabsList className="grid grid-cols-2 w-full">
                          <TabsTrigger value="en" data-testid="preview-tab-en">English {previewQuery.data.message.resolvedLanguage === "en" && "(default)"}</TabsTrigger>
                          <TabsTrigger value="he" data-testid="preview-tab-he">עברית {previewQuery.data.message.resolvedLanguage === "he" && "(default)"}</TabsTrigger>
                        </TabsList>
                        <TabsContent value="en">
                          <Textarea
                            className="mt-1 text-xs font-mono min-h-[120px] resize-y"
                            value={messageBody}
                            onChange={(e) => setMessageBody(e.target.value)}
                            dir="ltr"
                            data-testid="preview-body-en"
                            placeholder="Message body…"
                          />
                        </TabsContent>
                        <TabsContent value="he">
                          <Textarea
                            className="mt-1 text-xs font-mono min-h-[120px] resize-y"
                            value={messageBody}
                            onChange={(e) => setMessageBody(e.target.value)}
                            dir="rtl"
                            data-testid="preview-body-he"
                            placeholder="גוף ההודעה…"
                          />
                        </TabsContent>
                      </Tabs>
                      <p className="text-[10px] text-muted-foreground mt-1">You can freely edit the message above before sending.</p>
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

              {/* Bulk message body — editable template + read-only sample preview */}
              {welcomeTarget && welcomeTarget.kind !== "single" && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        {welcomeChannel === "both" ? "SMS Message template" : "Message template"}
                      </Label>
                      <div className="flex gap-1">
                        <button type="button" className="text-[10px] px-1.5 py-0.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-foreground/50" onClick={() => setMessageBody(BULK_TEMPLATE_EN)}>EN template</button>
                        <button type="button" className="text-[10px] px-1.5 py-0.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-foreground/50" onClick={() => setMessageBody(BULK_TEMPLATE_HE)}>עב template</button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                      Use <code className="bg-muted px-0.5 rounded">{"{{name}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{code}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{pin}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{url}}"}</code> — each will be replaced with the recipient's actual values.
                    </p>
                    <Textarea
                      className="mt-1 text-xs font-mono min-h-[120px] resize-y"
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      dir="auto"
                      data-testid="bulk-message-body"
                      placeholder="Message template…"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">You can freely edit the template above before sending.</p>
                    {welcomeChannel === "both" && (
                      <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        This template is sent as SMS. Each location will also receive a separately auto-formatted email.
                      </p>
                    )}
                  </div>

                  {/* Read-only per-location sample for reference */}
                  {(bulkPreviewSamples.en || bulkPreviewSamples.he) && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                        Sample preview (how it looks for a specific location{welcomeChannel === "both" ? " — SMS format" : ""})
                      </summary>
                      {(() => {
                        const hasEn = !!bulkPreviewSamples.en;
                        const hasHe = !!bulkPreviewSamples.he;
                        const defaultTab = hasEn ? "en" : "he";
                        return (
                          <Tabs defaultValue={defaultTab} className="mt-1">
                            <TabsList className={`grid w-full ${hasEn && hasHe ? "grid-cols-2" : "grid-cols-1"}`}>
                              {hasEn && <TabsTrigger value="en" data-testid="bulk-preview-tab-en">English · {bulkPreviewSamples.en?.locationCode}</TabsTrigger>}
                              {hasHe && <TabsTrigger value="he" data-testid="bulk-preview-tab-he">עברית · {bulkPreviewSamples.he?.locationCode}</TabsTrigger>}
                            </TabsList>
                            {hasEn && (
                              <TabsContent value="en">
                                {bulkPreviewEnQuery.isLoading && <div className="flex items-center gap-2 mt-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>}
                                {bulkPreviewEnQuery.data && (
                                  <pre className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono mt-2" data-testid="bulk-preview-body-en">
                                    {welcomeChannel === "email" ? bulkPreviewEnQuery.data.message.en.emailBody : bulkPreviewEnQuery.data.message.en.body}
                                  </pre>
                                )}
                              </TabsContent>
                            )}
                            {hasHe && (
                              <TabsContent value="he">
                                {bulkPreviewHeQuery.isLoading && <div className="flex items-center gap-2 mt-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>}
                                {bulkPreviewHeQuery.data && (
                                  <pre dir="rtl" className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono mt-2" data-testid="bulk-preview-body-he">
                                    {welcomeChannel === "email" ? bulkPreviewHeQuery.data.message.he.emailBody : bulkPreviewHeQuery.data.message.he.body}
                                  </pre>
                                )}
                              </TabsContent>
                            )}
                          </Tabs>
                        );
                      })()}
                    </details>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setWelcomeDialogOpen(false)} disabled={dialogIsPending}>Cancel</Button>
              <Button onClick={sendFromDialog} disabled={dialogIsPending} data-testid="button-send-welcome-confirm">
                {dialogIsPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                  : <><Send className="h-4 w-4 mr-2" />Send Welcome</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PIN Change Dialog */}
        <Dialog open={isPinDialogOpen} onOpenChange={(open) => {
          setIsPinDialogOpen(open);
          if (!open) { setNewPin(""); setConfirmPin(""); setPinLocation(null); }
        }}>
          <DialogContent className="sm:max-w-[400px]">
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
      </div>
    </div>
    </TooltipProvider>
  );
}
