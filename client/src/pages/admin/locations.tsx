import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getRegions, updateLocation, deleteLocation } from "@/lib/api";
import { Region, Location, OPERATOR_WELCOME_CHANNELS, type OperatorWelcomeChannel } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  DialogTrigger,
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
  Filter,
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
  ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminLocations() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinLocation, setPinLocation] = useState<Location | null>(null);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isPinManagementOpen, setIsPinManagementOpen] = useState(false);

  // ===== Onboarding (SMS / WhatsApp welcome) =====
  const [onboardingFilter, setOnboardingFilter] = useState<"all" | "not-sent" | "sent" | "failed" | "onboarded">("all");
  const [selectedOnboardingIds, setSelectedOnboardingIds] = useState<Set<number>>(new Set());
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(false);
  const [welcomeTarget, setWelcomeTarget] = useState<{ kind: "single"; id: number; loc: Location } | { kind: "selected" } | { kind: "all-not-onboarded" } | null>(null);
  const [defaultChannel, setDefaultChannelState] = useState<OperatorWelcomeChannel>(() => {
    try {
      const stored = localStorage.getItem("adminDefaultWelcomeChannel");
      if (stored && (OPERATOR_WELCOME_CHANNELS as readonly string[]).includes(stored)) return stored as OperatorWelcomeChannel;
    } catch {}
    return "both";
  });
  const [welcomeChannel, setWelcomeChannel] = useState<OperatorWelcomeChannel>(defaultChannel);
  const [rememberAsDefault, setRememberAsDefault] = useState(false);

  const setDefaultChannel = (c: OperatorWelcomeChannel) => {
    setDefaultChannelState(c);
    try { localStorage.setItem("adminDefaultWelcomeChannel", c); } catch {}
  };

  const twilioStatusQuery = useQuery<{
    sms: { configured: boolean; reason?: string };
    whatsapp: { configured: boolean; reason?: string; templates: { en?: string | null; he?: string | null } };
  }>({
    queryKey: ["/api/admin/twilio-status"],
    refetchOnWindowFocus: false,
  });

  const previewQuery = useQuery<{
    location: { id: number; name: string; locationCode: string };
    language: "en" | "he";
    message: { en: { subject: string; body: string }; he: { subject: string; body: string }; resolvedLanguage: "en" | "he" };
    welcomeUrl: string;
  }>({
    queryKey: ["/api/admin/locations/preview", welcomeTarget && welcomeTarget.kind === "single" ? welcomeTarget.id : null],
    queryFn: async () => {
      if (!welcomeTarget || welcomeTarget.kind !== "single") throw new Error("no preview target");
      const res = await apiRequest("GET", `/api/admin/locations/${welcomeTarget.id}/onboarding-preview`);
      return res.json();
    },
    enabled: welcomeDialogOpen && welcomeTarget?.kind === "single",
  });

  const sendWelcomeOneMutation = useMutation({
    mutationFn: async ({ id, channel, rememberAsDefault }: { id: number; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/locations/${id}/send-onboarding-welcome`, { channel, rememberAsDefault });
      return res.json();
    },
    onSuccess: (data: any) => {
      const sms = data.results?.sms;
      const wa = data.results?.whatsapp;
      const parts: string[] = [];
      if (sms) parts.push(`SMS: ${sms.ok ? "✓" : "✗ " + (sms.error || "failed")}`);
      if (wa) parts.push(`WhatsApp: ${wa.ok ? "✓" : "✗ " + (wa.error || "failed")}`);
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
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed to send", variant: "destructive" }),
  });

  const sendBulkOnboardingMutation = useMutation({
    mutationFn: async ({ locationIds, channel, rememberAsDefault }: { locationIds: number[]; channel: OperatorWelcomeChannel; rememberAsDefault?: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/locations/onboarding/send-bulk`, { locationIds, channel, rememberAsDefault });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk welcome complete",
        description: `Sent: ${data.summary?.sent ?? 0} · Skipped: ${data.summary?.skipped ?? 0} · Failed: ${data.summary?.failed ?? 0}`,
        variant: (data.summary?.failed ?? 0) > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setWelcomeDialogOpen(false);
      setWelcomeTarget(null);
      setSelectedOnboardingIds(new Set());
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const sendAllNotOnboardedMutation = useMutation({
    mutationFn: async ({ channel, rememberAsDefault }: { channel: OperatorWelcomeChannel; rememberAsDefault?: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/locations/onboarding/send-all`, { channel, rememberAsDefault });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "All-not-yet-onboarded complete",
        description: `Eligible: ${data.eligible ?? 0} · Sent: ${data.summary?.sent ?? 0} · Failed: ${data.summary?.failed ?? 0}`,
        variant: (data.summary?.failed ?? 0) > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setWelcomeDialogOpen(false);
      setWelcomeTarget(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const getOnboardingStatus = (loc: Location): "onboarded" | "sent" | "failed" | "not-sent" => {
    if (loc.onboardedAt) return "onboarded";
    const sms = loc.welcomeSmsStatus?.toLowerCase();
    const wa = loc.welcomeWhatsappStatus?.toLowerCase();
    // Twilio terminal statuses: queued/sending/sent/delivered = success; failed/undelivered = failure.
    const sentLike = (s?: string) => s === "sent" || s === "delivered" || s === "queued" || s === "sending" || s === "accepted";
    const failedLike = (s?: string) => s === "failed" || s === "undelivered";
    if (sentLike(sms) || sentLike(wa)) return "sent";
    if (failedLike(sms) || failedLike(wa)) return "failed";
    return "not-sent";
  };

  const openSinglePicker = (loc: Location) => {
    setWelcomeTarget({ kind: "single", id: loc.id, loc });
    const locDefault = loc.defaultWelcomeChannel as OperatorWelcomeChannel | null;
    setWelcomeChannel(locDefault && (OPERATOR_WELCOME_CHANNELS as readonly string[]).includes(locDefault) ? locDefault : defaultChannel);
    setRememberAsDefault(false);
    setWelcomeDialogOpen(true);
  };

  const openSelectedPicker = () => {
    if (selectedOnboardingIds.size === 0) return;
    setWelcomeTarget({ kind: "selected" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setWelcomeDialogOpen(true);
  };

  const openAllNotOnboardedPicker = () => {
    setWelcomeTarget({ kind: "all-not-onboarded" });
    setWelcomeChannel(defaultChannel);
    setRememberAsDefault(false);
    setWelcomeDialogOpen(true);
  };

  const sendFromDialog = () => {
    if (!welcomeTarget) return;
    if (welcomeTarget.kind === "single") {
      sendWelcomeOneMutation.mutate({ id: welcomeTarget.id, channel: welcomeChannel, rememberAsDefault });
    } else if (welcomeTarget.kind === "selected") {
      sendBulkOnboardingMutation.mutate({ locationIds: Array.from(selectedOnboardingIds), channel: welcomeChannel, rememberAsDefault });
    } else {
      sendAllNotOnboardedMutation.mutate({ channel: welcomeChannel, rememberAsDefault });
    }
  };

  const dialogIsPending = sendWelcomeOneMutation.isPending || sendBulkOnboardingMutation.isPending || sendAllNotOnboardedMutation.isPending;

  const toggleSelectAllOnboarding = (checked: boolean) => {
    if (checked) setSelectedOnboardingIds(new Set(onboardingFiltered.map((l) => l.id)));
    else setSelectedOnboardingIds(new Set());
  };

  const toggleOneOnboarding = (id: number, checked: boolean) => {
    setSelectedOnboardingIds((prev) => {
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

  const onboardingFiltered = useMemo(() => {
    return locations.filter((loc) => {
      if (onboardingFilter === "all") return true;
      return getOnboardingStatus(loc) === onboardingFilter;
    });
  }, [locations, onboardingFilter]);

  // SMS and WhatsApp both require a phone on file, so email-only rows are
  // ineligible (they would just be skipped by the server with "no phone").
  const eligibleNotOnboarded = useMemo(
    () => locations.filter((l) => getOnboardingStatus(l) !== "onboarded" && !!l.phone),
    [locations]
  );

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => 
      updateLocation(id, { isActive }),
    onSuccess: () => {
      toast({
        title: t('statusUpdated'),
        description: t('statusUpdateSuccess'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: `${t('failedToUpdateStatus')} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLocation(id),
    onSuccess: () => {
      toast({
        title: t('locationDeleted'),
        description: t('locationDeletedSuccess'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsDeleteDialogOpen(false);
      setDeletingLocation(null);
    },
    onError: (error: any) => {
      toast({
        title: t('error'),
        description: error.message || t('failedToDelete'),
        variant: "destructive",
      });
    },
  });

  const sendWelcomeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/locations/${id}/send-welcome`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Welcome email sent", description: `Sent to ${data.sentTo}` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to send", variant: "destructive" });
    },
  });

  const sendWelcomeAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/locations/send-welcome-all`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk welcome emails complete",
        description: `Sent: ${data.sent} • Skipped: ${data.skipped} • Failed: ${data.failed}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to bulk-send", variant: "destructive" });
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
    if (deletingLocation) {
      deleteMutation.mutate(deletingLocation.id);
    }
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

  const filteredLocations = locations.filter(location => {
    // Search filter
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
    
    // Region filter
    if (regionFilter !== "all" && location.regionId.toString() !== regionFilter) {
      return false;
    }
    
    // Status filter
    if (statusFilter === "active" && !location.isActive) return false;
    if (statusFilter === "inactive" && location.isActive) return false;
    
    return true;
  });

  // Stats
  const totalLocations = locations.length;
  const activeLocations = locations.filter(l => l.isActive).length;
  const inactiveLocations = totalLocations - activeLocations;

  return (
    <div className="py-6 md:py-10">
      <div className="container mx-auto px-4">
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-2 mb-6">
          <Button 
            variant="ghost" 
            onClick={() => window.location.href = '/admin'}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToDashboard')}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.href = '/'}
            className="flex items-center gap-2"
          >
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
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('addNewLocation')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('createNewLocation')}</DialogTitle>
                  <DialogDescription>
                    {t('addNewLocationDescription')}
                  </DialogDescription>
                </DialogHeader>
                <LocationForm 
                  regions={regions} 
                  onSuccess={() => setIsCreateDialogOpen(false)} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

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
            <CardTitle>{t('locations')}</CardTitle>
            <CardDescription>
              {t('manageAllGemachLocations')}
            </CardDescription>
            
            {/* Filters */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('search')}
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('filterByRegion')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allRegions')}</SelectItem>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id.toString()}>
                      {language === "he" && region.nameHe ? region.nameHe : region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            </div>
            
            {/* Active filters display */}
            {(regionFilter !== "all" || statusFilter !== "all" || searchTerm) && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className="text-sm text-muted-foreground">{t('activeFilters')}:</span>
                {searchTerm && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {t('search')}: {searchTerm}
                    <button onClick={() => setSearchTerm("")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {regionFilter !== "all" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {t('region')}: {getRegionNameById(parseInt(regionFilter))}
                    <button onClick={() => setRegionFilter("all")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {t('status')}: {statusFilter}
                    <button onClick={() => setStatusFilter("all")} className="ml-1 hover:text-destructive">×</button>
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSearchTerm(""); setRegionFilter("all"); setStatusFilter("all"); }}
                  className="text-xs"
                >
                  {t('clearAll')}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground mb-3">
              {t('showing')} {filteredLocations.length} / {totalLocations} {t('locations')}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">{t('name')}</TableHead>
                    <TableHead className="min-w-[180px] hidden md:table-cell">{t('coordinatorName')}</TableHead>
                    <TableHead className="min-w-[120px] hidden lg:table-cell">{t('region')}</TableHead>
                    <TableHead className="min-w-[80px]">{t('status')}</TableHead>
                    <TableHead className="min-w-[80px]">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLocations.length > 0 ? (
                    filteredLocations.map((location) => (
                      <TableRow key={location.id}>
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
                            {location.phone}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {location.email}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <Badge variant="outline">{getRegionNameById(location.regionId)}</Badge>
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
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        {searchTerm || regionFilter !== "all" || statusFilter !== "all" ? (
                          <div className="space-y-2">
                            <p className="text-muted-foreground">{t('noLocationsMatch')}</p>
                            <p className="text-sm text-gray-500">{t('tryAdjustingSearch')}</p>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => { setSearchTerm(""); setRegionFilter("all"); setStatusFilter("all"); }}
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
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Edit Location Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('editLocation')}</DialogTitle>
              <DialogDescription>
                {t('editLocationDescription')}
              </DialogDescription>
            </DialogHeader>
            {editingLocation && (
              <LocationForm
                location={editingLocation}
                regions={regions}
                onSuccess={closeEditDialog}
              />
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
              <Button 
                variant="outline" 
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('deleteLocationConfirm')}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PIN Management & Operator Onboarding */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>PIN & Onboarding</CardTitle>
                  <CardDescription>Send the welcome (SMS / WhatsApp), manage PINs, track who's onboarded.</CardDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <TwilioStatusBadge status={twilioStatusQuery.data} loading={twilioStatusQuery.isLoading} />
                <Button
                  variant="default"
                  size="sm"
                  onClick={openAllNotOnboardedPicker}
                  disabled={dialogIsPending || eligibleNotOnboarded.length === 0}
                  data-testid="button-onboarding-all-not-onboarded"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send Welcome to all not-onboarded ({eligibleNotOnboarded.length})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openSelectedPicker}
                  disabled={dialogIsPending || selectedOnboardingIds.size === 0}
                  data-testid="button-onboarding-bulk-selected"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send Welcome to selected ({selectedOnboardingIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Send the legacy setup email to every active location with an email address on file?")) {
                      sendWelcomeAllMutation.mutate();
                    }
                  }}
                  disabled={sendWelcomeAllMutation.isPending}
                  data-testid="button-send-welcome-all"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  {sendWelcomeAllMutation.isPending ? "Sending…" : "Email all"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPinManagementOpen(!isPinManagementOpen)}
                >
                  {isPinManagementOpen ? "Collapse" : "Expand"}
                </Button>
              </div>
            </div>
            {isPinManagementOpen && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <Label className="text-sm">Status filter:</Label>
                <Select value={onboardingFilter} onValueChange={(v) => { setOnboardingFilter(v as any); setSelectedOnboardingIds(new Set()); }}>
                  <SelectTrigger className="w-[180px]" data-testid="select-onboarding-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({locations.length})</SelectItem>
                    <SelectItem value="not-sent">Not Sent</SelectItem>
                    <SelectItem value="sent">Sent (awaiting onboarding)</SelectItem>
                    <SelectItem value="failed">Failed delivery</SelectItem>
                    <SelectItem value="onboarded">Onboarded</SelectItem>
                  </SelectContent>
                </Select>
                <Label className="text-sm ml-2">Default channel:</Label>
                <Select value={defaultChannel} onValueChange={(v) => setDefaultChannel(v as OperatorWelcomeChannel)}>
                  <SelectTrigger className="w-[160px]" data-testid="select-default-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS only</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          {isPinManagementOpen && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <Checkbox
                          checked={onboardingFiltered.length > 0 && selectedOnboardingIds.size === onboardingFiltered.length}
                          onCheckedChange={(v) => toggleSelectAllOnboarding(!!v)}
                          aria-label="Select all"
                          data-testid="checkbox-onboarding-select-all"
                        />
                      </TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="hidden md:table-cell">Contact</TableHead>
                      <TableHead>PIN</TableHead>
                      <TableHead>Onboarding</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onboardingFiltered.map((loc) => {
                      const status = getOnboardingStatus(loc);
                      const sms = loc.welcomeSmsStatus;
                      const smsErr = loc.welcomeSmsError;
                      const wa = loc.welcomeWhatsappStatus;
                      const waErr = loc.welcomeWhatsappError;
                      const lastSentAt = loc.welcomeSentAt as string | Date | null;
                      const sentDaysAgo = lastSentAt ? Math.max(0, Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 86400000)) : null;
                      return (
                        <TableRow key={loc.id} data-testid={`row-onboarding-${loc.id}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedOnboardingIds.has(loc.id)}
                              onCheckedChange={(v) => toggleOneOnboarding(loc.id, !!v)}
                              aria-label={`Select ${loc.name}`}
                              data-testid={`checkbox-onboarding-${loc.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            <div>{loc.name}</div>
                            {loc.nameHe && <div className="text-xs text-muted-foreground" dir="rtl">{loc.nameHe}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{loc.locationCode}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs">
                            {loc.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{loc.phone}</div>}
                            {loc.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" />{loc.email}</div>}
                          </TableCell>
                          <TableCell>
                            {loc.operatorPin ? (
                              <Badge variant="secondary" className="text-xs">PIN set</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">No PIN</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <OnboardingStatusBadge status={status} />
                              {status !== "onboarded" && sentDaysAgo !== null && (
                                <div className="text-[10px] text-muted-foreground" data-testid={`sent-ago-${loc.id}`}>
                                  Sent {sentDaysAgo === 0 ? "today" : sentDaysAgo === 1 ? "1 day ago" : `${sentDaysAgo} days ago`}
                                </div>
                              )}
                              {(sms || wa) && (
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                  {sms && (
                                    <div className={sms === "failed" ? "text-destructive" : ""}>
                                      SMS: {sms}{sms === "failed" && smsErr ? ` — ${smsErr}` : ""}
                                    </div>
                                  )}
                                  {wa && (
                                    <div className={wa === "failed" ? "text-destructive" : ""}>
                                      WA: {wa}{wa === "failed" && waErr ? ` — ${waErr}` : ""}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openSinglePicker(loc)}
                                disabled={dialogIsPending || !loc.phone}
                                title={!loc.phone ? "No phone on file — SMS/WhatsApp need a phone number" : "Send Welcome (SMS/WhatsApp)"}
                                data-testid={`button-send-onboarding-${loc.id}`}
                              >
                                <MessageSquare className="h-4 w-4 mr-1" />
                                Welcome
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleChangePinForLocation(loc)}
                                data-testid={`button-change-pin-${loc.id}`}
                                title="Change PIN"
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => sendWelcomeMutation.mutate(loc.id)}
                                disabled={sendWelcomeMutation.isPending || !loc.email || !loc.locationCode}
                                title={!loc.email ? "No email on file" : "Send legacy setup email"}
                                data-testid={`button-send-welcome-${loc.id}`}
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {onboardingFiltered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                          No locations match this filter.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>

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
                  <>To <strong>{welcomeTarget.loc.name}</strong> · {welcomeTarget.loc.locationCode} · {welcomeTarget.loc.phone || welcomeTarget.loc.email}</>
                )}
                {welcomeTarget?.kind === "selected" && (
                  <>To <strong>{selectedOnboardingIds.size} selected location(s)</strong></>
                )}
                {welcomeTarget?.kind === "all-not-onboarded" && (
                  <>To <strong>{eligibleNotOnboarded.length} location(s) not yet onboarded</strong></>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* Recipient list — shown for bulk and send-all so admins can see exactly
                who will receive a message before they hit Send. */}
            {welcomeTarget && welcomeTarget.kind !== "single" && (() => {
              const recipients = welcomeTarget.kind === "selected"
                ? locations.filter((l) => selectedOnboardingIds.has(l.id))
                : eligibleNotOnboarded;
              return (
                <div className="border rounded-md bg-muted/30 max-h-40 overflow-y-auto p-2" data-testid="recipient-list">
                  <div className="text-xs font-medium mb-1 text-muted-foreground">
                    Recipients ({recipients.length})
                  </div>
                  {recipients.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">No recipients</div>
                  ) : (
                    <ul className="text-xs space-y-0.5">
                      {recipients.slice(0, 50).map((r) => (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {r.name} <span className="text-muted-foreground">· {r.locationCode}</span>
                          </span>
                          <span className="text-muted-foreground shrink-0">{r.phone || "no phone"}</span>
                        </li>
                      ))}
                      {recipients.length > 50 && (
                        <li className="text-muted-foreground italic">…and {recipients.length - 50} more</li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="space-y-4 py-2">
              <div>
                <Label className="text-sm font-medium">Channel</Label>
                <RadioGroup
                  value={welcomeChannel}
                  onValueChange={(v) => setWelcomeChannel(v as OperatorWelcomeChannel)}
                  className="grid grid-cols-3 gap-2 mt-2"
                >
                  {[
                    { v: "sms" as const, label: "SMS", icon: MessageSquare, disabled: !twilioStatusQuery.data?.sms.configured },
                    { v: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle, disabled: !twilioStatusQuery.data?.whatsapp.configured },
                    { v: "both" as const, label: "Both", icon: Send, disabled: !twilioStatusQuery.data?.sms.configured && !twilioStatusQuery.data?.whatsapp.configured },
                  ].map(({ v, label, icon: Icon, disabled }) => (
                    <Label
                      key={v}
                      htmlFor={`channel-${v}`}
                      className={`flex flex-col items-center gap-1 border rounded-md p-2 text-sm ${welcomeChannel === v ? "border-primary bg-primary/5" : "border-input"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      data-testid={`channel-option-${v}`}
                    >
                      <RadioGroupItem id={`channel-${v}`} value={v} disabled={disabled} className="sr-only" />
                      <Icon className="h-4 w-4" />
                      {label}
                    </Label>
                  ))}
                </RadioGroup>
                {welcomeChannel !== defaultChannel && (
                  <button
                    type="button"
                    onClick={() => setDefaultChannel(welcomeChannel)}
                    className="text-xs text-muted-foreground hover:text-primary mt-1"
                  >
                    Save "{welcomeChannel}" as my default
                  </button>
                )}
                <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer select-none" data-testid="checkbox-remember-default-wrap">
                  <Checkbox
                    checked={rememberAsDefault}
                    onCheckedChange={(v) => setRememberAsDefault(!!v)}
                    data-testid="checkbox-remember-default"
                  />
                  <span>
                    Remember <strong>{welcomeChannel}</strong> as the default channel for {welcomeTarget?.kind === "single" ? "this location" : "these locations"}
                  </span>
                </label>
              </div>

              {twilioStatusQuery.data && (
                <>
                  {welcomeChannel !== "whatsapp" && !twilioStatusQuery.data.sms.configured && (
                    <p className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      SMS unavailable: {twilioStatusQuery.data.sms.reason}
                    </p>
                  )}
                  {welcomeChannel !== "sms" && !twilioStatusQuery.data.whatsapp.configured && (
                    <p className="text-xs text-destructive flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      WhatsApp unavailable: {twilioStatusQuery.data.whatsapp.reason}
                    </p>
                  )}
                </>
              )}

              {welcomeTarget?.kind === "single" && (
                <div>
                  <Label className="text-sm font-medium">Preview</Label>
                  {previewQuery.isLoading && (
                    <div className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading preview…
                    </div>
                  )}
                  {previewQuery.data && (
                    <Tabs defaultValue={previewQuery.data.message.resolvedLanguage} className="mt-2">
                      <TabsList className="grid grid-cols-2 w-full">
                        <TabsTrigger value="en" data-testid="preview-tab-en">English {previewQuery.data.message.resolvedLanguage === "en" && "(default)"}</TabsTrigger>
                        <TabsTrigger value="he" data-testid="preview-tab-he">עברית {previewQuery.data.message.resolvedLanguage === "he" && "(default)"}</TabsTrigger>
                      </TabsList>
                      <TabsContent value="en">
                        <pre className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono" data-testid="preview-body-en">
                          {previewQuery.data.message.en.body}
                        </pre>
                      </TabsContent>
                      <TabsContent value="he">
                        <pre dir="rtl" className="bg-muted/30 border rounded p-3 text-xs whitespace-pre-wrap font-mono" data-testid="preview-body-he">
                          {previewQuery.data.message.he.body}
                        </pre>
                      </TabsContent>
                    </Tabs>
                  )}
                  {previewQuery.data?.welcomeUrl && (
                    <a
                      href={previewQuery.data.welcomeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 mt-2"
                    >
                      <ExternalLink className="h-3 w-3" /> Open welcome link in a new tab
                    </a>
                  )}
                </div>
              )}

              {welcomeTarget && welcomeTarget.kind !== "single" && (
                <p className="text-xs text-muted-foreground">
                  Each location's message uses their own language (Hebrew if Hebrew name is on file, otherwise English) and a unique welcome link.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setWelcomeDialogOpen(false)} disabled={dialogIsPending}>Cancel</Button>
              <Button
                onClick={sendFromDialog}
                disabled={dialogIsPending}
                data-testid="button-send-welcome-confirm"
              >
                {dialogIsPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : <><Send className="h-4 w-4 mr-2" />Send Welcome</>}
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
                  placeholder="4–6 digits"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-confirm-pin">Confirm New PIN</Label>
                <Input
                  id="admin-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  placeholder="Re-enter PIN"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                {confirmPin && newPin !== confirmPin && (
                  <p className="text-sm text-red-500">PINs do not match</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPinDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (pinLocation) {
                    changePinMutation.mutate({ id: pinLocation.id, newPin, confirmPin });
                  }
                }}
                disabled={
                  changePinMutation.isPending ||
                  newPin.length < 4 ||
                  confirmPin.length < 4 ||
                  newPin !== confirmPin
                }
              >
                {changePinMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  <><ShieldCheck className="h-4 w-4 mr-2" /> Save PIN</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function OnboardingStatusBadge({ status }: { status: "onboarded" | "sent" | "failed" | "not-sent" }) {
  if (status === "onboarded") return <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs w-fit">Onboarded</Badge>;
  if (status === "sent") return <Badge variant="secondary" className="text-xs w-fit">Sent</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="text-xs w-fit">Failed</Badge>;
  return <Badge variant="outline" className="text-xs w-fit">Not sent</Badge>;
}

function TwilioStatusBadge({
  status,
  loading,
}: {
  status: { sms: { configured: boolean; reason?: string }; whatsapp: { configured: boolean; reason?: string } } | undefined;
  loading: boolean;
}) {
  if (loading || !status) {
    return <Badge variant="outline" className="text-xs"><Loader2 className="h-3 w-3 animate-spin mr-1" />Twilio</Badge>;
  }
  const smsOk = status.sms.configured;
  const waOk = status.whatsapp.configured;
  return (
    <div className="flex gap-1">
      <Badge
        variant={smsOk ? "secondary" : "outline"}
        className={`text-xs ${smsOk ? "" : "text-muted-foreground"}`}
        title={smsOk ? "SMS ready" : status.sms.reason}
        data-testid="badge-twilio-sms"
      >
        <MessageSquare className="h-3 w-3 mr-1" /> {smsOk ? "SMS ✓" : "SMS off"}
      </Badge>
      <Badge
        variant={waOk ? "secondary" : "outline"}
        className={`text-xs ${waOk ? "" : "text-muted-foreground"}`}
        title={waOk ? "WhatsApp ready" : status.whatsapp.reason}
        data-testid="badge-twilio-wa"
      >
        <MessageCircle className="h-3 w-3 mr-1" /> {waOk ? "WA ✓" : "WA off"}
      </Badge>
    </div>
  );
}
