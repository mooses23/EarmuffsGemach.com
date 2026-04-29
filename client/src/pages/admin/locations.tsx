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

  // ===== Inline email editing =====
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailEditLocation, setEmailEditLocation] = useState<Location | null>(null);
  const [emailEditValue, setEmailEditValue] = useState("");

  // ===== Bulk selection (for the main table) =====
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ===== Onboarding (SMS / Email welcome) =====
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

  // Wraps all ADMIN-initiated edits to the message body (textarea onChanges).
  // Programmatic updates (preview load, channel change, template reset) call setMessageBody directly.
  const handleMessageBodyChange = (val: string) => {
    setMessageBody(val);
    setIsCustomMessage(true);
  };

  // Template strings used for bulk sends (placeholder tokens are substituted per-location on the server)
  const BULK_TEMPLATE_EN =
    "Hi {{name}}, you've been invited to manage your {{code}} gemach dashboard. Your one-time login PIN is {{pin}}. Tap here to get started:\n{{url}}\n— Earmuffs Gemach";
  const BULK_TEMPLATE_EN_EMAIL =
    "Hi {{name}},\n\nYou've been invited to manage your {{code}} gemach dashboard.\nYour one-time login PIN is: {{pin}}\n\nClick here to get started:\n{{url}}\n\n— Earmuffs Gemach";
  const BULK_TEMPLATE_HE =
    'שלום {{name}}, הוזמנת לנהל את דשבורד הגמ"ח שלך ({{code}}). קוד הכניסה החד-פעמי שלך: {{pin}}. לחץ כאן להתחלה:\n{{url}}\n— גמ"ח אטמי';

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

  // When channel changes in bulk mode (and message is NOT customized), reset to the channel-appropriate template.
  useEffect(() => {
    if (welcomeTarget && welcomeTarget.kind !== "single" && !isCustomMessage) {
      setMessageBody(getBulkTemplateEN(welcomeChannel));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (data.results?.anySuccess) {
        setWelcomeDialogOpen(false);
        setWelcomeTarget(null);
      }
    },
    onError: (err) => toast({ title: "Error", description: errorMessage(err, "Failed to send"), variant: "destructive" }),
  });

  const sendBulkOnboardingMutation = useMutation<SendBulkResponse, Error, { locationIds: number[]; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean; messageBody?: string; customMessage?: boolean }>({
    mutationFn: async ({ locationIds, channel, rememberAsDefault, messageBody, customMessage }) => {
      const res = await apiRequest("POST", `/api/admin/locations/onboarding/send-bulk`, {
        locationIds, channel, rememberAsDefault,
        ...(customMessage && messageBody ? { messageBody, customMessage: true } : {}),
      });
      return res.json() as Promise<SendBulkResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk messages sent",
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
    setWelcomeDialogOpen(true);
  };

  const openAllNotOnboardedPicker = () => {
    setWelcomeTarget({ kind: "all-not-onboarded" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setMessageBody(getBulkTemplateEN(defaultChannel));
    setMessageBodyInitialized(true);
    setIsCustomMessage(false);
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
        customMessage: isCustomMessage,
      });
    } else if (welcomeTarget.kind === "selected") {
      sendBulkOnboardingMutation.mutate({ locationIds: Array.from(selectedIds), channel: welcomeChannel, rememberAsDefault, messageBody: messageBody.trim() || undefined, customMessage: isCustomMessage });
    } else {
      sendAllNotOnboardedMutation.mutate({ channel: welcomeChannel, rememberAsDefault, messageBody: messageBody.trim() || undefined, customMessage: isCustomMessage });
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
    const needsPhone = ch === "sms" || ch === "both" || ch === "whatsapp";
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

  const saveEmailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: number; email: string }) => {
      const res = await apiRequest("PATCH", `/api/locations/${id}`, { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email updated", description: "The operator email has been saved." });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsEmailDialogOpen(false);
      setEmailEditLocation(null);
      setEmailEditValue("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEditEmail = (location: Location) => {
    setEmailEditLocation(location);
    setEmailEditValue(location.email || "");
    setIsEmailDialogOpen(true);
  };

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
                    Message Locations ({eligibleNotOnboarded.length})
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
                      Message Selected ({selectedCount})
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
                    <SelectValue placeholder="Contact status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All contacts</SelectItem>
                    <SelectItem value="not-sent">Not messaged</SelectItem>
                    <SelectItem value="sent">Messaged (awaiting)</SelectItem>
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
                      Contact: {onboardingFilter === "not-sent" ? "Not messaged" : onboardingFilter === "sent" ? "Messaged (awaiting)" : onboardingFilter === "failed" ? "Failed" : onboardingFilter === "no-phone" ? "No phone" : "Onboarded"}
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
                                <TableHead className="min-w-[120px]">Contacts</TableHead>
                                <TableHead className="min-w-[80px]">{t('status')}</TableHead>
                                <TableHead className="min-w-[80px]">{t('actions')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {regionLocs.map((location) => {
                                const sms = location.welcomeSmsStatus;
                                const em = location.welcomeEmailStatus;
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
                                      {(() => {
                                        // Build message history for ALL rows (including onboarded)
                                        type ChannelTs = { channel: "sms" | "whatsapp" | "email"; at: Date };
                                        const candidates: ChannelTs[] = [];
                                        if (location.welcomeSmsSentAt) candidates.push({ channel: "sms", at: new Date(location.welcomeSmsSentAt as string) });
                                        if (location.welcomeWhatsappSentAt) candidates.push({ channel: "whatsapp", at: new Date(location.welcomeWhatsappSentAt as string) });
                                        if (location.welcomeEmailSentAt) candidates.push({ channel: "email", at: new Date(location.welcomeEmailSentAt as string) });
                                        const latest = candidates.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
                                        const daysAgo = latest ? Math.max(0, Math.floor((Date.now() - latest.at.getTime()) / 86400000)) : null;
                                        const channelIcon = latest?.channel === "sms"
                                          ? <MessageSquare className="h-3 w-3 shrink-0" />
                                          : latest?.channel === "whatsapp"
                                          ? <MessageCircle className="h-3 w-3 shrink-0 text-green-600" />
                                          : latest?.channel === "email"
                                          ? <Mail className="h-3 w-3 shrink-0" />
                                          : null;
                                        const hasFailure = sms === "failed" || em === "failed" || location.welcomeWhatsappStatus === "failed";
                                        return (
                                          <div className="flex flex-col gap-0.5" data-testid={`contacts-cell-${location.id}`}>
                                            {location.onboardedAt && (
                                              <Badge variant="default" className="text-xs bg-green-600 hover:bg-green-700 w-fit">Onboarded</Badge>
                                            )}
                                            {latest ? (
                                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`last-messaged-${location.id}`}>
                                                {channelIcon}
                                                <span>{daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`}</span>
                                              </div>
                                            ) : !location.onboardedAt ? (
                                              <Badge variant="outline" className="text-xs text-muted-foreground w-fit">Not messaged</Badge>
                                            ) : null}
                                            {hasFailure && (
                                              <Badge variant="destructive" className="text-xs w-fit">Failed</Badge>
                                            )}
                                            {!location.phone && <NoPhoneBadge />}
                                          </div>
                                        );
                                      })()}
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
                                            Send Message
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleEditLocation(location)}>
                                            <Edit className="mr-2 h-4 w-4" />
                                            {t('editLocation')}
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleChangePinForLocation(location)}>
                                            <KeyRound className="mr-2 h-4 w-4" />
                                            Change PIN
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleEditEmail(location)}>
                                            <Mail className="mr-2 h-4 w-4" />
                                            Edit Email
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

            <div className="space-y-4 py-2">
              {/* Channel picker */}
              <div>
                <Label className="text-sm font-medium">Channel</Label>
                <RadioGroup
                  value={welcomeChannel}
                  onValueChange={(v) => setWelcomeChannel(v as OperatorWelcomeChannel)}
                  className="grid grid-cols-3 gap-2 mt-2"
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

                  {/* WhatsApp */}
                  <Label
                    htmlFor="channel-whatsapp"
                    className={`flex flex-col items-center gap-1 border rounded-md p-2 text-sm cursor-pointer ${welcomeChannel === "whatsapp" ? "border-primary bg-primary/5" : "border-input"} ${!serviceStatusQuery.data?.whatsapp?.configured ? "opacity-50" : ""}`}
                    data-testid="channel-option-whatsapp"
                  >
                    <RadioGroupItem id="channel-whatsapp" value="whatsapp" disabled={!serviceStatusQuery.data?.whatsapp?.configured} className="sr-only" />
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    WhatsApp
                    {serviceStatusQuery.data && !serviceStatusQuery.data.whatsapp?.configured && (
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
                    <Label className="text-sm font-medium">Message</Label>
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
                            className="mt-1 text-xs font-mono min-h-[120px] resize-y"
                            value={messageBody}
                            onChange={(e) => handleMessageBodyChange(e.target.value)}
                            dir="ltr"
                            data-testid="preview-body-en"
                            placeholder="Message body…"
                          />
                        </TabsContent>
                        <TabsContent value="he">
                          <Textarea
                            className="mt-1 text-xs font-mono min-h-[120px] resize-y"
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
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
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
                          onClick={() => { setMessageBody(getBulkTemplateEN(welcomeChannel)); setIsCustomMessage(false); }}
                        >EN template</button>
                        <button
                          type="button"
                          className="text-[10px] px-1.5 py-0.5 rounded border border-input text-muted-foreground hover:text-foreground hover:border-foreground/50"
                          onClick={() => { setMessageBody(BULK_TEMPLATE_HE); setIsCustomMessage(false); }}
                        >עב template</button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-1">
                      Use <code className="bg-muted px-0.5 rounded">{"{{name}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{code}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{pin}}"}</code>, <code className="bg-muted px-0.5 rounded">{"{{url}}"}</code> — each will be replaced with the recipient's actual values.
                    </p>
                    <Textarea
                      className={`mt-1 text-xs font-mono min-h-[120px] resize-y ${!isCustomMessage ? "bg-muted/40" : ""}`}
                      value={messageBody}
                      onChange={(e) => handleMessageBodyChange(e.target.value)}
                      dir="auto"
                      data-testid="bulk-message-body"
                      placeholder="Message template…"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {isCustomMessage
                        ? "Custom message active — each recipient's tokens will be substituted on send."
                        : "Showing EN template reference. Edit to create a custom message; otherwise each recipient receives the server-generated default for their language."}
                    </p>
                  </div>

                  {/* Live preview — first selected recipient with "and N more" context */}
                  {(bulkPreviewSamples.en || bulkPreviewSamples.he) && (() => {
                    const primarySample = bulkPreviewSamples.en || bulkPreviewSamples.he;
                    const primaryQuery = bulkPreviewSamples.en ? bulkPreviewEnQuery : bulkPreviewHeQuery;
                    const primaryLang = bulkPreviewSamples.en ? "en" : "he";
                    const hasHe = !!bulkPreviewSamples.he && !!bulkPreviewSamples.en;
                    // Count channel-eligible candidates (must have phone for SMS/WhatsApp, email for email channel)
                    const candidatePool = welcomeTarget.kind === "selected"
                      ? ([...selectedIds].map(id => locations.find(l => l.id === id)).filter(Boolean) as Location[])
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
                                  <pre className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono mt-2" data-testid="bulk-preview-body-en">
                                    {enText}
                                  </pre>
                                )}
                              </TabsContent>
                              <TabsContent value="he">
                                {heText != null && (
                                  <pre dir="rtl" className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono mt-2" data-testid="bulk-preview-body-he">
                                    {heText}
                                  </pre>
                                )}
                              </TabsContent>
                            </Tabs>
                          ) : singleText != null ? (
                            <pre
                              dir={primaryLang === "he" ? "rtl" : "ltr"}
                              className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono"
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

            <DialogFooter>
              <Button variant="outline" onClick={() => setWelcomeDialogOpen(false)} disabled={dialogIsPending}>Cancel</Button>
              <Button onClick={sendFromDialog} disabled={dialogIsPending} data-testid="button-send-welcome-confirm">
                {dialogIsPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                  : <><Send className="h-4 w-4 mr-2" />Send Message</>
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

        {/* Edit Email Dialog */}
        <Dialog open={isEmailDialogOpen} onOpenChange={(open) => {
          setIsEmailDialogOpen(open);
          if (!open) { setEmailEditValue(""); setEmailEditLocation(null); }
        }}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Edit Operator Email
              </DialogTitle>
              <DialogDescription>
                {emailEditLocation ? (
                  <>Update the contact email for <strong>{emailEditLocation.name}</strong> ({emailEditLocation.locationCode}). This does not re-trigger SMS onboarding.</>
                ) : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="admin-email-edit">Email address</Label>
                <Input
                  id="admin-email-edit"
                  type="email"
                  placeholder="operator@example.com"
                  value={emailEditValue}
                  onChange={(e) => setEmailEditValue(e.target.value)}
                  data-testid="input-email-edit"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEmailDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!emailEditLocation || !emailEditValue.trim()) return;
                  saveEmailMutation.mutate({ id: emailEditLocation.id, email: emailEditValue.trim() });
                }}
                disabled={saveEmailMutation.isPending || !emailEditValue.trim()}
                data-testid="button-save-email"
              >
                {saveEmailMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                  : <><Save className="h-4 w-4 mr-2" />Save Email</>
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
