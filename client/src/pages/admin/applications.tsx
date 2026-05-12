import { useState, useMemo } from "react";
import type { ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getGemachApplications, updateGemachApplicationStatus, approveApplicationWithLocation, resendApplicationConfirmationEmail } from "@/lib/api";
import { GemachApplication, Region, InsertLocation, insertLocationSchema, CityCategory } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { Badge } from "@/components/ui/badge";
import {
  Search,
  MoreVertical,
  Check,
  X,
  Eye,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Plus,
  Loader2,
  DollarSign,
  KeyRound,
  User,
  RotateCcw,
  Info,
  ChevronDown,
  ChevronUp,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Users,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { z } from "zod";

const locationFormSchema = insertLocationSchema.omit({ locationCode: true }).extend({
  name: z.string().min(1, "Location name is required"),
  contactPerson: z.string().min(1, "Contact person is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Valid email is required"),
  regionId: z.number().min(1, "Region is required"),
  cityCategoryId: z.number().nullable().optional(),
  operatorPin: z.string().min(4, "PIN must be at least 4 digits").max(6, "PIN must be at most 6 digits").optional(),
});

type LocationFormData = z.infer<typeof locationFormSchema>;

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: ElementType;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-start gap-3 border border-white/10 backdrop-blur-sm bg-white/5">
      <div className={`p-2 rounded-lg shrink-0 ${accent ?? "bg-primary/20"}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">{label}</p>
        <p className="text-xl font-bold text-white leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function getStatusGlassBadge(status: string, t: (k: string) => string) {
  switch (status) {
    case "pending":
      return (
        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 text-xs">
          <Clock className="h-3 w-3 me-1" />
          {t("pending")}
        </Badge>
      );
    case "approved":
      return (
        <Badge className="bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/20 text-xs">
          <CheckCircle2 className="h-3 w-3 me-1" />
          {t("approved")}
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/20 text-xs">
          <XCircle className="h-3 w-3 me-1" />
          {t("rejected")}
        </Badge>
      );
    default:
      return <Badge variant="outline" className="text-xs">{t("unknown")}</Badge>;
  }
}

interface ApplicationCardProps {
  application: GemachApplication;
  onView: (a: GemachApplication) => void;
  onApprove: (a: GemachApplication) => void;
  onReject: (id: number) => void;
  onRestore: (id: number) => void;
  onResend: (id: number) => void;
  resendPending: boolean;
  updatePending: boolean;
  t: (key: string) => string;
}

function ApplicationCard({
  application,
  onView,
  onApprove,
  onReject,
  onRestore,
  onResend,
  resendPending,
  updatePending,
  t,
}: ApplicationCardProps) {
  const fullName = `${application.firstName} ${application.lastName}`;
  const locationLine = [application.city, application.state, application.country].filter(Boolean).join(", ");

  return (
    <div className="glass-card rounded-xl border border-white/10 backdrop-blur-sm bg-white/5 p-4 flex flex-col gap-3 relative">
      {/* Header: name + status + action menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-full bg-primary/20 shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-white truncate">{fullName}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {getStatusGlassBadge(application.status, t)}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              >
                <span className="sr-only">{t("openMenu")}</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("actions")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onView(application)}>
                <Eye className="me-2 h-4 w-4" />
                {t("viewDetails")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onResend(application.id)}
                disabled={resendPending}
              >
                {resendPending ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="me-2 h-4 w-4" />
                )}
                {t("resendConfirmationEmail")}
              </DropdownMenuItem>
              {application.status === "pending" && (
                <>
                  <DropdownMenuItem
                    onClick={() => onApprove(application)}
                    data-testid={`menu-approve-${application.id}`}
                  >
                    <Plus className="me-2 h-4 w-4 text-green-500" />
                    {t("approveCreateLocation")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onReject(application.id)}
                    data-testid={`menu-reject-${application.id}`}
                  >
                    <X className="me-2 h-4 w-4 text-red-500" />
                    {t("rejectApplication")}
                  </DropdownMenuItem>
                </>
              )}
              {application.status !== "pending" && (
                <DropdownMenuItem
                  onClick={() => onRestore(application.id)}
                  disabled={updatePending}
                  data-testid={`menu-restore-${application.id}`}
                >
                  <RotateCcw className="me-2 h-4 w-4 text-blue-400" />
                  {t("restoreToPending")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Contact chips */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[200px]">{application.email}</span>
        </span>
        {application.phone && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Phone className="h-3 w-3 shrink-0" />
            {application.phone}
          </span>
        )}
      </div>

      {/* Location */}
      {locationLine && (
        <span className="flex items-center gap-1.5 text-xs text-slate-300">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {locationLine}
          {application.community && (
            <span className="text-slate-500">· {application.community}</span>
          )}
        </span>
      )}

      {/* Dates row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-white/5 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {t("submitted")}: {format(new Date(application.submittedAt), "MMM d, yyyy")}
        </span>
        {application.confirmationEmailSentAt ? (
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3 shrink-0" />
            {t("emailed")}: {format(new Date(application.confirmationEmailSentAt), "MMM d, yyyy")}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-slate-500">
            <Mail className="h-3 w-3 shrink-0" />
            {t("neverEmailed")}
          </span>
        )}
      </div>

      {/* Quick-action buttons for pending applications */}
      {application.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs bg-green-600/80 hover:bg-green-600 text-white border-0"
            onClick={() => onApprove(application)}
          >
            <Check className="h-3.5 w-3.5 me-1" />
            {t("approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs border-white/10 text-slate-300 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30"
            onClick={() => onReject(application.id)}
          >
            <X className="h-3.5 w-3.5 me-1" />
            {t("reject")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminApplications() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [viewApplication, setViewApplication] = useState<GemachApplication | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [approveApplication, setApproveApplication] = useState<GemachApplication | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string | null>(null);
  const [isInviteCodeDialogOpen, setIsInviteCodeDialogOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const { data: applications = [], isLoading } = useQuery<GemachApplication[]>({
    queryKey: ["/api/applications"],
  });

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const { data: cityCategories = [] } = useQuery<CityCategory[]>({
    queryKey: ["/api/city-categories"],
  });

  const form = useForm<LocationFormData>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: "",
      contactPerson: "",
      address: "",
      zipCode: "",
      phone: "",
      email: "",
      regionId: 1,
      cityCategoryId: null,
      operatorPin: "1234",
      isActive: true,
      cashOnly: false,
      depositAmount: 20,
      paymentMethods: ["cash"],
      processingFeePercent: 300,
    },
  });

  const cityCategoriesByRegion = regions
    .slice()
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    .map((region) => ({
      region,
      categories: cityCategories
        .filter((cat) => cat.regionId === region.id)
        .sort((a, b) => {
          const order = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
          if (order !== 0) return order;
          return a.name.localeCompare(b.name);
        }),
    }))
    .filter((group) => group.categories.length > 0);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updateGemachApplicationStatus(id, status),
    onSuccess: () => {
      toast({ title: t("statusUpdated"), description: t("statusUpdateSuccess") });
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      setIsViewDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToUpdateStatus")} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const approveWithLocationMutation = useMutation({
    mutationFn: ({ id, locationData }: { id: number; locationData: InsertLocation }) =>
      approveApplicationWithLocation(id, locationData),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsApproveDialogOpen(false);
      setApproveApplication(null);
      form.reset();
      if (data.inviteCode) {
        setGeneratedInviteCode(data.inviteCode);
        setIsInviteCodeDialogOpen(true);
      } else {
        toast({ title: t("applicationApproved"), description: t("applicationApprovedSuccess") });
      }
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToApprove")} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resendConfirmationMutation = useMutation({
    mutationFn: (id: number) => resendApplicationConfirmationEmail(id),
    onSuccess: () => {
      toast({ title: t("emailResent"), description: t("emailResentSuccess") });
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToResendEmail")} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleReject = (id: number) => {
    updateStatusMutation.mutate({ id, status: "rejected" });
  };

  const handleRestoreToPending = (id: number) => {
    if (typeof window !== "undefined" && !window.confirm(t("restoreToPendingConfirm"))) return;
    updateStatusMutation.mutate({ id, status: "pending" });
  };

  const handleViewApplication = (application: GemachApplication) => {
    setViewApplication(application);
    setIsViewDialogOpen(true);
  };

  const getFullAddress = (app: GemachApplication) => {
    const parts = [app.streetAddress, app.city, app.state, app.zipCode, app.country].filter(Boolean);
    return parts.join(", ");
  };

  const handleStartApproval = (application: GemachApplication) => {
    setApproveApplication(application);
    let matchedCityCategoryId: number | null = null;
    if (application.community) {
      const communityLower = application.community.toLowerCase().trim();
      const matchedCategory = cityCategories.find(
        (cat) =>
          cat.name.toLowerCase().trim() === communityLower ||
          cat.slug.toLowerCase() === communityLower.replace(/\s+/g, "-")
      );
      if (matchedCategory) matchedCityCategoryId = matchedCategory.id;
    }
    form.reset({
      name: `${application.firstName} ${application.lastName}'s Gemach`,
      contactPerson: `${application.firstName} ${application.lastName}`,
      address: getFullAddress(application),
      zipCode: application.zipCode,
      phone: application.phone,
      email: application.email,
      regionId: matchedCityCategoryId
        ? (cityCategories.find((c) => c.id === matchedCityCategoryId)?.regionId ?? 1)
        : 1,
      cityCategoryId: matchedCityCategoryId,
      operatorPin: "1234",
      isActive: true,
      cashOnly: false,
      depositAmount: 20,
      paymentMethods: ["cash"],
      processingFeePercent: 300,
    });
    setIsApproveDialogOpen(true);
  };

  const onSubmitApproval = (data: LocationFormData) => {
    if (!approveApplication) return;
    approveWithLocationMutation.mutate({ id: approveApplication.id, locationData: data as InsertLocation });
  };

  // Legacy badge used in the view dialog (light-mode style)
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">{t("pending")}</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{t("approved")}</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">{t("rejected")}</Badge>;
      default:
        return <Badge variant="outline">{t("unknown")}</Badge>;
    }
  };

  const filteredApplications = applications
    .filter((application) => {
      if (filterStatus !== "all" && application.status !== filterStatus) return false;
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();
      return (
        application.firstName.toLowerCase().includes(searchLower) ||
        application.lastName.toLowerCase().includes(searchLower) ||
        application.email.toLowerCase().includes(searchLower) ||
        application.city.toLowerCase().includes(searchLower) ||
        application.state.toLowerCase().includes(searchLower) ||
        application.country.toLowerCase().includes(searchLower)
      );
    })
    .slice()
    .sort((a, b) => {
      const ad = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const bd = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return bd - ad;
    });

  const statusCounts = {
    all: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    approved: applications.filter((a) => a.status === "approved").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };
  const hiddenNonPendingCount = statusCounts.approved + statusCounts.rejected;

  const appsByMonth = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push(key);
    }
    const counts: Record<string, number> = {};
    months.forEach((m) => { counts[m] = 0; });
    applications.forEach((app) => {
      if (!app.submittedAt) return;
      const d = new Date(app.submittedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (counts[key] !== undefined) counts[key]++;
    });
    return months.map((key) => {
      const [year, month] = key.split("-");
      const label = new Date(Number(year), Number(month) - 1).toLocaleString("default", {
        month: "short",
        year: "2-digit",
      });
      return { month: label, Applications: counts[key] };
    });
  }, [applications]);

  return (
    <>
      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">{t("gemachApplications")}</h1>
        <p className="text-sm md:text-base text-muted-foreground">{t("reviewManageApplicationsDescription")}</p>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiTile icon={FileText} label={t("total")} value={statusCounts.all} />
        <KpiTile icon={Clock} label={t("pending")} value={statusCounts.pending} accent="bg-amber-500/20" />
        <KpiTile icon={CheckCircle2} label={t("approved")} value={statusCounts.approved} accent="bg-green-500/20" />
        <KpiTile icon={XCircle} label={t("rejected")} value={statusCounts.rejected} accent="bg-red-500/20" />
      </div>

      {/* ── Search + filter bar ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-grow">
          <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchApplications")}
            className="ps-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <Button
              key={s}
              variant={filterStatus === s ? "default" : "outline"}
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setFilterStatus(s)}
              data-testid={`filter-status-${s}`}
            >
              {t(s)} ({statusCounts[s]})
            </Button>
          ))}
        </div>
      </div>

      {/* Pending-only note banner */}
      {filterStatus === "pending" && hiddenNonPendingCount > 0 && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-blue-200/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-300"
          data-testid="hidden-applications-note"
        >
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>
            {t("hiddenApplicationsNote")
              .replace("{approved}", String(statusCounts.approved))
              .replace("{rejected}", String(statusCounts.rejected))}
          </span>
        </div>
      )}

      {/* ── Application card grid ─────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-52" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-44" />
            </div>
          ))}
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="glass-card rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <Users className="h-10 w-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">
            {searchTerm || filterStatus !== "all"
              ? t("noApplicationsFoundCriteria")
              : t("noApplicationsSubmittedYet")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredApplications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              onView={handleViewApplication}
              onApprove={handleStartApproval}
              onReject={handleReject}
              onRestore={handleRestoreToPending}
              onResend={(id) => resendConfirmationMutation.mutate(id)}
              resendPending={resendConfirmationMutation.isPending}
              updatePending={updateStatusMutation.isPending}
              t={t}
            />
          ))}
        </div>
      )}

      {/* ── Analytics (collapsible, closed by default) ────────────────── */}
      <div className="mt-8">
        <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 py-2 border-b border-border/40 text-left"
            >
              <h2 className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                {t("analyticsNewApplications")}
              </h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {analyticsOpen ? (
                  <><ChevronUp className="h-3.5 w-3.5" />Hide</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" />Show</>
                )}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    {t("analyticsNewApplications")}
                  </CardTitle>
                  <CardDescription>{t("analyticsLast12Months")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={appsByMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Applications"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "hsl(var(--primary))" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── View Application Dialog ────────────────────────────────────── */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{t("applicationDetails")}</DialogTitle>
            <DialogDescription>{t("reviewCompleteApplication")}</DialogDescription>
          </DialogHeader>
          {viewApplication && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t("firstName")}</h3>
                  <p>{viewApplication.firstName}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t("lastName")}</h3>
                  <p>{viewApplication.lastName}</p>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t("email")}</h3>
                <p>{viewApplication.email}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t("phoneNumber")}</h3>
                <p>{viewApplication.phone}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t("address")}</h3>
                <p>{viewApplication.streetAddress}</p>
                <p>
                  {viewApplication.city}, {viewApplication.state} {viewApplication.zipCode}
                </p>
                <p>{viewApplication.country}</p>
                {viewApplication.community && (
                  <p className="text-muted-foreground text-sm mt-1">
                    {t("community")}: {viewApplication.community}
                  </p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t("message")}</h3>
                <Textarea
                  value={viewApplication.message || t("noMessageProvided")}
                  readOnly
                  className="h-24 mt-1"
                />
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">{t("status")}</h3>
                <div className="mt-1">{getStatusBadge(viewApplication.status)}</div>
              </div>
              <div className="flex justify-end space-x-2 pt-4">
                {viewApplication.status === "pending" && (
                  <>
                    <Button variant="outline" onClick={() => handleReject(viewApplication.id)}>
                      <X className="me-2 h-4 w-4" />
                      {t("rejectApplication")}
                    </Button>
                    <Button
                      onClick={() => {
                        setIsViewDialogOpen(false);
                        handleStartApproval(viewApplication);
                      }}
                    >
                      <Plus className="me-2 h-4 w-4" />
                      {t("approveCreateLocation")}
                    </Button>
                  </>
                )}
                {viewApplication.status !== "pending" && (
                  <Button onClick={() => setIsViewDialogOpen(false)}>{t("close")}</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Approve & Create Location Dialog ──────────────────────────── */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("approveApplicationCreateLocation")}</DialogTitle>
            <DialogDescription>{t("fillLocationDetailsApprove")}</DialogDescription>
          </DialogHeader>
          {approveApplication && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-medium mb-2">{t("applicantInformation")}</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("name")}:</span>{" "}
                    {approveApplication.firstName} {approveApplication.lastName}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("email")}:</span>{" "}
                    {approveApplication.email}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("phoneNumber")}:</span>{" "}
                    {approveApplication.phone}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t("address")}:</span>{" "}
                    {approveApplication.streetAddress}, {approveApplication.city},{" "}
                    {approveApplication.state} {approveApplication.zipCode},{" "}
                    {approveApplication.country}
                    {approveApplication.community && ` (${approveApplication.community})`}
                  </div>
                </div>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitApproval)} className="space-y-5">
                  {/* Location Details section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("locationName")}
                      </span>
                      <div className="flex-1 border-t border-border/60 ms-1" />
                    </div>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">{t("locationName")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="h-11 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                              placeholder="e.g., Brooklyn Baby Banz Gemach"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">{t("fullAddress")}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="h-11 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                              placeholder={t("addressPlaceholder")}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">{t("zipCode")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-11 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">{t("phoneNumber")}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                  {...field}
                                  type="tel"
                                  className="h-11 ps-9 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">{t("email")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              <Input
                                {...field}
                                type="email"
                                className="h-11 ps-9 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Operator & Region section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("contactPerson")} &amp; {t("region")}
                      </span>
                      <div className="flex-1 border-t border-border/60 ms-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactPerson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">{t("contactPerson")}</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-11 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="regionId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">{t("region")}</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(parseInt(value));
                                form.setValue("cityCategoryId", null);
                              }}
                              value={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger className="h-11 text-sm border-border/70 hover:border-border transition-colors">
                                  <SelectValue placeholder={t("selectRegion")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {regions.map((region) => (
                                  <SelectItem key={region.id} value={region.id.toString()}>
                                    {region.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="cityCategoryId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">
                              {t("communityCategory")}
                              {approveApplication?.community && (
                                <span className="ms-1.5 text-[10px] text-muted-foreground/70">
                                  ({t("applicantSelected")}: {approveApplication.community})
                                </span>
                              )}
                            </FormLabel>
                            <Select
                              onValueChange={(value) => {
                                if (value === "none") {
                                  field.onChange(null);
                                  return;
                                }
                                const id = parseInt(value);
                                field.onChange(id);
                                const picked = cityCategories.find((c) => c.id === id);
                                if (picked && picked.regionId !== form.getValues("regionId")) {
                                  form.setValue("regionId", picked.regionId, { shouldDirty: true });
                                }
                              }}
                              value={field.value?.toString() ?? "none"}
                            >
                              <FormControl>
                                <SelectTrigger className="h-11 text-sm border-border/70 hover:border-border transition-colors">
                                  <SelectValue placeholder={t("selectCommunityCategory")} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="max-h-80">
                                <SelectItem value="none">{t("noCategoryOption")}</SelectItem>
                                {cityCategoriesByRegion.map((group) => (
                                  <div key={group.region.id}>
                                    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {group.region.name}
                                    </div>
                                    {group.categories.map((category) => (
                                      <SelectItem key={category.id} value={category.id.toString()}>
                                        {category.name}
                                        {category.stateCode ? (
                                          <span className="ms-1 text-muted-foreground">, {category.stateCode}</span>
                                        ) : null}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="operatorPin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-muted-foreground">{t("operatorPIN")}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                  {...field}
                                  className="h-11 ps-9 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                                  placeholder={t("pinPlaceholder")}
                                  value={field.value ?? ""}
                                  maxLength={6}
                                  inputMode="numeric"
                                  onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Deposit section */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("depositAmount")}
                      </span>
                      <div className="flex-1 border-t border-border/60 ms-1" />
                    </div>
                    <FormField
                      control={form.control}
                      name="depositAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-muted-foreground">
                            {t("depositAmount")} ($)
                          </FormLabel>
                          <FormControl>
                            <div className="relative max-w-[10rem]">
                              <DollarSign className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              <Input
                                {...field}
                                type="number"
                                className="h-11 ps-9 text-sm border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                                value={field.value ?? 20}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 20)}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t border-border/60 pt-4 flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 px-6 text-sm"
                      onClick={() => {
                        setIsApproveDialogOpen(false);
                        setApproveApplication(null);
                        form.reset();
                      }}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 px-6 text-sm"
                      disabled={approveWithLocationMutation.isPending}
                    >
                      {approveWithLocationMutation.isPending ? (
                        <>
                          <Loader2 className="me-2 h-4 w-4 animate-spin" />
                          {t("creatingLocation")}
                        </>
                      ) : (
                        <>
                          <Check className="me-2 h-4 w-4" />
                          {t("approveCreateLocation")}
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Invite Code Success Dialog ─────────────────────────────────── */}
      <Dialog open={isInviteCodeDialogOpen} onOpenChange={setIsInviteCodeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              {t("applicationApproved")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("applicationApprovedSuccessWithCode")} {t("shareInviteCodeDescription")}
            </p>
            <div className="bg-muted p-4 rounded-lg text-center">
              <p className="text-xs text-muted-foreground mb-2">{t("inviteCode")}</p>
              <p className="text-2xl font-mono font-bold tracking-wider">{generatedInviteCode}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t("inviteCodeOnceUse")}</p>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (generatedInviteCode) {
                    navigator.clipboard.writeText(generatedInviteCode);
                    toast({ title: t("copied"), description: t("inviteCodeCopied") });
                  }
                }}
                variant="outline"
                className="me-2"
              >
                {t("copyCode")}
              </Button>
              <Button onClick={() => setIsInviteCodeDialogOpen(false)}>{t("done")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
