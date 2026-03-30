import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getRegions, updateLocation, deleteLocation } from "@/lib/api";
import { Region, Location } from "@shared/schema";
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
  ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminLocations() {
  const { toast } = useToast();
  const { t } = useLanguage();
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

  const { data: regions = [] } = useQuery<Region[]>({
    queryKey: ["/api/regions"],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

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
    return region ? region.name : "Unknown";
  };

  const filteredLocations = locations.filter(location => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        location.name.toLowerCase().includes(searchLower) ||
        location.contactPerson.toLowerCase().includes(searchLower) ||
        location.address.toLowerCase().includes(searchLower) ||
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
                      {region.name}
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
                            <span>{location.name}</span>
                            {location.locationCode && (
                              <Badge variant="outline" className="text-xs">{location.locationCode}</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center mt-1">
                            <MapPin className="h-3 w-3 mr-1" />
                            {location.address}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div>{location.contactPerson}</div>
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

        {/* PIN Management Card */}
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>PIN Management</CardTitle>
                  <CardDescription>Manage operator PINs for all locations</CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPinManagementOpen(!isPinManagementOpen)}
              >
                {isPinManagementOpen ? "Collapse" : "Expand"}
              </Button>
            </div>
          </CardHeader>
          {isPinManagementOpen && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Location Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="hidden md:table-cell">Region</TableHead>
                      <TableHead>PIN Status</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locations.map((loc) => (
                      <TableRow key={loc.id}>
                        <TableCell className="font-medium">{loc.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{loc.locationCode}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {getRegionNameById(loc.regionId)}
                        </TableCell>
                        <TableCell>
                          {loc.operatorPin ? (
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                              <KeyRound className="h-3 w-3" />
                              PIN set
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <KeyRound className="h-3 w-3" />
                              No PIN
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleChangePinForLocation(loc)}
                          >
                            <KeyRound className="h-4 w-4 mr-1" />
                            Change PIN
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>

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
