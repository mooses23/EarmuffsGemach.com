import { useState } from "react";
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
  ArrowLeft,
  Home,
  Plus,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
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

export default function AdminApplications() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [viewApplication, setViewApplication] = useState<GemachApplication | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [approveApplication, setApproveApplication] = useState<GemachApplication | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string | null>(null);
  const [isInviteCodeDialogOpen, setIsInviteCodeDialogOpen] = useState(false);

  const { data: applications = [] } = useQuery<GemachApplication[]>({
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

  const selectedRegionId = form.watch("regionId");
  
  const filteredCityCategories = cityCategories.filter(
    (cat) => cat.regionId === selectedRegionId
  );

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      updateGemachApplicationStatus(id, status),
    onSuccess: () => {
      toast({
        title: t('statusUpdated'),
        description: t('statusUpdateSuccess'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/applications"] });
      setIsViewDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: `${t('failedToUpdateStatus')} ${error.message}`,
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
      
      // Show invite code dialog
      if (data.inviteCode) {
        setGeneratedInviteCode(data.inviteCode);
        setIsInviteCodeDialogOpen(true);
      } else {
        toast({
          title: t('applicationApproved'),
          description: t('applicationApprovedSuccess'),
        });
      }
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: `${t('failedToApprove')} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resendConfirmationMutation = useMutation({
    mutationFn: (id: number) => resendApplicationConfirmationEmail(id),
    onSuccess: () => {
      toast({
        title: t('emailResent'),
        description: t('emailResentSuccess'),
      });
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: `${t('failedToResendEmail')} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleReject = (id: number) => {
    updateStatusMutation.mutate({ id, status: "rejected" });
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
    
    // Try to match applicant's community to an existing city category
    let matchedCityCategoryId: number | null = null;
    if (application.community) {
      const communityLower = application.community.toLowerCase().trim();
      const matchedCategory = cityCategories.find(
        cat => cat.name.toLowerCase().trim() === communityLower ||
               cat.slug.toLowerCase() === communityLower.replace(/\s+/g, '-')
      );
      if (matchedCategory) {
        matchedCityCategoryId = matchedCategory.id;
      }
    }
    
    form.reset({
      name: `${application.firstName} ${application.lastName}'s Gemach`,
      contactPerson: `${application.firstName} ${application.lastName}`,
      address: getFullAddress(application),
      zipCode: application.zipCode,
      phone: application.phone,
      email: application.email,
      regionId: matchedCityCategoryId ? (cityCategories.find(c => c.id === matchedCityCategoryId)?.regionId ?? 1) : 1,
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
    
    approveWithLocationMutation.mutate({ 
      id: approveApplication.id, 
      locationData: data as InsertLocation
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">{t('pending')}</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{t('approved')}</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">{t('rejected')}</Badge>;
      default:
        return <Badge variant="outline">{t('unknown')}</Badge>;
    }
  };

  const filteredApplications = applications.filter(application => {
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
  });

  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
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
            <h1 className="text-3xl font-bold">{t('gemachApplications')}</h1>
            <p className="text-muted-foreground">{t('reviewManageApplicationsDescription')}</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t('applications')}</CardTitle>
            <CardDescription>
              {t('reviewManageApplicationsFromVolunteers')}
            </CardDescription>
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('searchApplications')}
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={filterStatus === "all" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("all")}
                >
                  {t('all')}
                </Button>
                <Button 
                  variant={filterStatus === "pending" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("pending")}
                >
                  {t('pending')}
                </Button>
                <Button 
                  variant={filterStatus === "approved" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("approved")}
                >
                  {t('approved')}
                </Button>
                <Button 
                  variant={filterStatus === "rejected" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("rejected")}
                >
                  {t('rejected')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('applicant')}</TableHead>
                    <TableHead>{t('location')}</TableHead>
                    <TableHead>{t('dateSubmitted')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead>{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApplications.length > 0 ? (
                    filteredApplications.map((application) => (
                      <TableRow key={application.id}>
                        <TableCell>
                          <div className="font-medium">
                            {application.firstName} {application.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {application.email}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center">
                            <Phone className="h-3 w-3 mr-1" />
                            {application.phone}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                            {application.city}, {application.state}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {application.country}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                            <span className="text-sm">
                              {format(new Date(application.submittedAt), "MMM d, yyyy")}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center mt-1">
                            <Clock className="h-3 w-3 mr-1" />
                            {format(new Date(application.submittedAt), "h:mm a")}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(application.status)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('openMenu')}</span>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewApplication(application)}>
                                <Eye className="mr-2 h-4 w-4" />
                                {t('viewDetails')}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => resendConfirmationMutation.mutate(application.id)}
                                disabled={resendConfirmationMutation.isPending}
                              >
                                {resendConfirmationMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Mail className="mr-2 h-4 w-4" />
                                )}
                                {t('resendConfirmationEmail')}
                              </DropdownMenuItem>
                              {application.status === "pending" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleStartApproval(application)}>
                                    <Plus className="mr-2 h-4 w-4 text-green-600" />
                                    {t('approveCreateLocation')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleReject(application.id)}>
                                    <X className="mr-2 h-4 w-4 text-red-600" />
                                    {t('rejectApplication')}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        {searchTerm || filterStatus !== "all" ? (
                          <p className="text-muted-foreground">{t('noApplicationsFoundCriteria')}</p>
                        ) : (
                          <p className="text-muted-foreground">{t('noApplicationsSubmittedYet')}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* View Application Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>{t('applicationDetails')}</DialogTitle>
              <DialogDescription>
                {t('reviewCompleteApplication')}
              </DialogDescription>
            </DialogHeader>
            {viewApplication && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">{t('firstName')}</h3>
                    <p>{viewApplication.firstName}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">{t('lastName')}</h3>
                    <p>{viewApplication.lastName}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t('email')}</h3>
                  <p>{viewApplication.email}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t('phoneNumber')}</h3>
                  <p>{viewApplication.phone}</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t('address')}</h3>
                  <p>{viewApplication.streetAddress}</p>
                  <p>{viewApplication.city}, {viewApplication.state} {viewApplication.zipCode}</p>
                  <p>{viewApplication.country}</p>
                  {viewApplication.community && (
                    <p className="text-muted-foreground text-sm mt-1">{t('community')}: {viewApplication.community}</p>
                  )}
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t('message')}</h3>
                  <Textarea 
                    value={viewApplication.message || t('noMessageProvided')} 
                    readOnly 
                    className="h-24 mt-1"
                  />
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{t('status')}</h3>
                  <div className="mt-1">{getStatusBadge(viewApplication.status)}</div>
                </div>
                
                <div className="flex justify-end space-x-2 pt-4">
                  {viewApplication.status === "pending" && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => handleReject(viewApplication.id)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        {t('rejectApplication')}
                      </Button>
                      <Button 
                        onClick={() => {
                          setIsViewDialogOpen(false);
                          handleStartApproval(viewApplication);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('approveCreateLocation')}
                      </Button>
                    </>
                  )}
                  {viewApplication.status !== "pending" && (
                    <Button onClick={() => setIsViewDialogOpen(false)}>
                      {t('close')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Approve Application & Create Location Dialog */}
        <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
          <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('approveApplicationCreateLocation')}</DialogTitle>
              <DialogDescription>
                {t('fillLocationDetailsApprove')}
              </DialogDescription>
            </DialogHeader>
            {approveApplication && (
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-lg">
                  <h4 className="font-medium mb-2">{t('applicantInformation')}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t('name')}:</span>{" "}
                      {approveApplication.firstName} {approveApplication.lastName}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('email')}:</span>{" "}
                      {approveApplication.email}
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('phoneNumber')}:</span>{" "}
                      {approveApplication.phone}
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t('address')}:</span>{" "}
                      {approveApplication.streetAddress}, {approveApplication.city}, {approveApplication.state} {approveApplication.zipCode}, {approveApplication.country}
                      {approveApplication.community && ` (${approveApplication.community})`}
                    </div>
                  </div>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitApproval)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('locationName')}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., Brooklyn Baby Banz Gemach" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactPerson"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('contactPerson')}</FormLabel>
                            <FormControl>
                              <Input {...field} />
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
                            <FormLabel>{t('region')}</FormLabel>
                            <Select 
                              onValueChange={(value) => {
                                field.onChange(parseInt(value));
                                form.setValue("cityCategoryId", null);
                              }}
                              value={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('selectRegion')} />
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
                            <FormLabel>
                              {t('communityCategory')}
                              {approveApplication?.community && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  ({t('applicantSelected')}: {approveApplication.community})
                                </span>
                              )}
                            </FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(value === "none" ? null : parseInt(value))}
                              value={field.value?.toString() ?? "none"}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={t('selectCommunityCategory')} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">{t('noCategoryOption')}</SelectItem>
                                {filteredCityCategories.map((category) => (
                                  <SelectItem key={category.id} value={category.id.toString()}>
                                    {category.name}
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
                        name="operatorPin"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('operatorPIN')}</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                placeholder={t('pinPlaceholder')}
                                value={field.value ?? ""}
                                maxLength={6}
                                inputMode="numeric"
                                onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fullAddress')}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={t('addressPlaceholder')} />
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
                            <FormLabel>{t('zipCode')}</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} />
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
                            <FormLabel>{t('phoneNumber')}</FormLabel>
                            <FormControl>
                              <Input {...field} type="tel" />
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
                          <FormLabel>{t('email')}</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="depositAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('depositAmount')} ($)</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="number" 
                                value={field.value ?? 20}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 20)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button 
                        type="button"
                        variant="outline" 
                        onClick={() => {
                          setIsApproveDialogOpen(false);
                          setApproveApplication(null);
                          form.reset();
                        }}
                      >
                        {t('cancel')}
                      </Button>
                      <Button 
                        type="submit"
                        disabled={approveWithLocationMutation.isPending}
                      >
                        {approveWithLocationMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('creatingLocation')}
                          </>
                        ) : (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            {t('approveCreateLocation')}
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

        {/* Invite Code Success Dialog */}
        <Dialog open={isInviteCodeDialogOpen} onOpenChange={setIsInviteCodeDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                {t('applicationApproved')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('applicationApprovedSuccessWithCode')} {t('shareInviteCodeDescription')}
              </p>
              <div className="bg-muted p-4 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-2">{t('inviteCode')}</p>
                <p className="text-2xl font-mono font-bold tracking-wider">{generatedInviteCode}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('inviteCodeOnceUse')}
              </p>
              <div className="flex justify-end">
                <Button 
                  onClick={() => {
                    if (generatedInviteCode) {
                      navigator.clipboard.writeText(generatedInviteCode);
                      toast({
                        title: t('copied'),
                        description: t('inviteCodeCopied'),
                      });
                    }
                  }}
                  variant="outline"
                  className="mr-2"
                >
                  {t('copyCode')}
                </Button>
                <Button onClick={() => setIsInviteCodeDialogOpen(false)}>
                  {t('done')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
