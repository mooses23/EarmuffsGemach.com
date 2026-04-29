import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Save, X, CreditCard, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertPaymentMethodSchema } from "@shared/schema";

const formSchema = insertPaymentMethodSchema.extend({
  processingFeePercent: z.number().min(0).max(1000),
  fixedFee: z.number().min(0),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  webhookSecret: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

interface PaymentMethod {
  id: number;
  name: string;
  displayName: string;
  provider: string | null;
  isActive: boolean;
  isAvailableToLocations: boolean;
  processingFeePercent: number;
  fixedFee: number;
  requiresApi: boolean;
  apiKey: string | null;
  apiSecret: string | null;
  webhookSecret: string | null;
  isConfigured: boolean;
  createdAt: string;
}

export default function PaymentMethodsAdmin() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const { data: paymentMethods = [], isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      displayName: "",
      provider: "",
      isActive: true,
      isAvailableToLocations: false,
      processingFeePercent: 0,
      fixedFee: 0,
      requiresApi: false,
      apiKey: "",
      apiSecret: "",
      webhookSecret: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("POST", "/api/payment-methods", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setIsCreating(false);
      form.reset();
      toast({ title: t('paymentMethodCreated') });
    },
    onError: (error: Error) => {
      toast({
        title: t('failedToCreatePaymentMethod'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FormData> }) => {
      const response = await apiRequest("PATCH", `/api/payment-methods/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setEditingId(null);
      toast({ title: t('paymentMethodUpdated') });
    },
    onError: (error: Error) => {
      toast({
        title: t('failedToUpdatePaymentMethod'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/payment-methods/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: t('paymentMethodDeleted') });
    },
    onError: (error: Error) => {
      toast({
        title: t('failedToDeletePaymentMethod'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const configureMutation = useMutation({
    mutationFn: async ({ id, credentials }: { id: number; credentials: { apiKey: string; apiSecret: string; webhookSecret?: string; } }) => {
      const response = await apiRequest("POST", `/api/payment-methods/${id}/configure`, credentials);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ 
        title: t('paymentMethodConfigured'),
        description: `${data.method?.displayName} ${t('isNowActiveAcrossAllLocations')}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('failedToConfigurePaymentMethod'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = (data: FormData) => {
    createMutation.mutate(data);
  };

  const handleEdit = (method: PaymentMethod) => {
    setEditingId(method.id);
    form.reset({
      name: method.name,
      displayName: method.displayName,
      provider: method.provider,
      isActive: method.isActive,
      isAvailableToLocations: method.isAvailableToLocations,
      processingFeePercent: method.processingFeePercent,
      fixedFee: method.fixedFee,
      requiresApi: method.requiresApi,
      apiKey: method.apiKey || "",
      apiSecret: method.apiSecret || "",
      webhookSecret: method.webhookSecret || "",
    });
  };

  const handleUpdate = (data: FormData) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    }
  };

  const toggleAvailability = async (method: PaymentMethod) => {
    updateMutation.mutate({
      id: method.id,
      data: { isAvailableToLocations: !method.isAvailableToLocations }
    });
  };

  const formatFee = (percent: number, fixed: number) => {
    if (percent === 0 && fixed === 0) return t('noFees');
    const parts = [];
    if (percent > 0) parts.push(`${(percent / 100).toFixed(2)}%`);
    if (fixed > 0) parts.push(`$${(fixed / 100).toFixed(2)}`);
    return parts.join(" + ");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
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

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('paymentMethodsManagement')}</h1>
        <Button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          {t('addPaymentMethod')}
        </Button>
      </div>

      {/* System Synchronization Info */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-blue-100 rounded-full">
              <Plus className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">{t('globalPaymentSystem')}</h3>
              <p className="text-gray-600 mb-3">
                {t('globalPaymentSystemDescription')}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>{t('realTimeSynchronization')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>{t('automaticApiConfiguration')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span>{t('globalAvailabilityControl')}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {isCreating && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('createNewPaymentMethod')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">{t('methodName')}</Label>
                  <Input
                    id="name"
                    {...form.register("name")}
                    placeholder={t('methodNamePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="displayName">{t('displayName')}</Label>
                  <Input
                    id="displayName"
                    {...form.register("displayName")}
                    placeholder={t('displayNamePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="provider">{t('provider')}</Label>
                  <Input
                    id="provider"
                    {...form.register("provider")}
                    placeholder={t('providerPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="processingFeePercent">{t('processingFeePercent')}</Label>
                  <Input
                    id="processingFeePercent"
                    type="number"
                    step="0.01"
                    {...form.register("processingFeePercent", { valueAsNumber: true })}
                    placeholder={t('processingFeePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="fixedFee">{t('fixedFeeCents')}</Label>
                  <Input
                    id="fixedFee"
                    type="number"
                    {...form.register("fixedFee", { valueAsNumber: true })}
                    placeholder={t('fixedFeePlaceholder')}
                  />
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    {...form.register("isActive")}
                  />
                  <Label htmlFor="isActive">{t('active')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isAvailableToLocations"
                    {...form.register("isAvailableToLocations")}
                  />
                  <Label htmlFor="isAvailableToLocations">{t('availableToLocations')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="requiresApi"
                    {...form.register("requiresApi")}
                  />
                  <Label htmlFor="requiresApi">{t('requiresApi')}</Label>
                </div>
              </div>

              {/* API Credentials Section */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">{t('apiConfigurationOptional')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="apiKey">{t('apiKey')}</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      {...form.register("apiKey")}
                      placeholder={t('apiKeyPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="apiSecret">{t('apiSecret')}</Label>
                    <Input
                      id="apiSecret"
                      type="password"
                      {...form.register("apiSecret")}
                      placeholder={t('apiSecretPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label htmlFor="webhookSecret">{t('webhookSecretOptional')}</Label>
                    <Input
                      id="webhookSecret"
                      type="password"
                      {...form.register("webhookSecret")}
                      placeholder={t('webhookSecretPlaceholder')}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('apiCredentialsAutoActivate')}
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('createMethod')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreating(false);
                    form.reset();
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('cancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Payment Methods List */}
      <div className="grid gap-4">
        {paymentMethods.map((method) => (
          <Card key={method.id}>
            <CardContent className="p-6">
              {editingId === method.id ? (
                <form onSubmit={form.handleSubmit(handleUpdate)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`name-${method.id}`}>{t('methodName')}</Label>
                      <Input
                        id={`name-${method.id}`}
                        {...form.register("name")}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`displayName-${method.id}`}>{t('displayName')}</Label>
                      <Input
                        id={`displayName-${method.id}`}
                        {...form.register("displayName")}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`provider-${method.id}`}>{t('provider')}</Label>
                      <Input
                        id={`provider-${method.id}`}
                        {...form.register("provider")}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`processingFeePercent-${method.id}`}>{t('processingFeePercent')}</Label>
                      <Input
                        id={`processingFeePercent-${method.id}`}
                        type="number"
                        step="0.01"
                        {...form.register("processingFeePercent", { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`fixedFee-${method.id}`}>{t('fixedFeeCents')}</Label>
                      <Input
                        id={`fixedFee-${method.id}`}
                        type="number"
                        {...form.register("fixedFee", { valueAsNumber: true })}
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`isActive-${method.id}`}
                        {...form.register("isActive")}
                      />
                      <Label htmlFor={`isActive-${method.id}`}>{t('active')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`isAvailableToLocations-${method.id}`}
                        {...form.register("isAvailableToLocations")}
                      />
                      <Label htmlFor={`isAvailableToLocations-${method.id}`}>{t('availableToLocations')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`requiresApi-${method.id}`}
                        {...form.register("requiresApi")}
                      />
                      <Label htmlFor={`requiresApi-${method.id}`}>{t('requiresApi')}</Label>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" disabled={updateMutation.isPending}>
                      <Save className="h-4 w-4 mr-2" />
                      {t('saveChanges')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      {t('cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <h3 className="text-xl font-semibold">{method.displayName}</h3>
                      <Badge variant={method.isActive ? "default" : "secondary"}>
                        {method.isActive ? t('active') : t('inactive')}
                      </Badge>
                      <Badge variant={method.isAvailableToLocations ? "default" : "outline"}>
                        {method.isAvailableToLocations ? t('availableToLocations') : t('notAvailable')}
                      </Badge>
                      {method.requiresApi && (
                        <Badge variant="outline">{t('requiresApi')}</Badge>
                      )}
                      {method.requiresApi && (
                        <Badge variant={method.isConfigured ? "default" : "destructive"}>
                          {method.isConfigured ? t('apiConfigured') : t('apiNotConfigured')}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-3">
                      <div>
                        <strong>{t('method')}:</strong> {method.name}
                      </div>
                      <div>
                        <strong>{t('provider')}:</strong> {method.provider || t('manual')}
                      </div>
                      <div>
                        <strong>{t('fees')}:</strong> {formatFee(method.processingFeePercent, method.fixedFee)}
                      </div>
                    </div>
                    {method.requiresApi && !method.isConfigured && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3">
                        <p className="text-sm text-yellow-800">
                          <strong>{t('apiConfigurationRequired')}:</strong> {t('apiConfigurationRequiredDescription')}
                        </p>
                      </div>
                    )}
                    {method.isConfigured && method.isAvailableToLocations && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3 mb-3">
                        <p className="text-sm text-green-800">
                          <strong>{t('synchronized')}:</strong> {t('synchronizedDescription')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleAvailability(method)}
                      disabled={updateMutation.isPending}
                    >
                      {method.isAvailableToLocations ? t('hideFromLocations') : t('makeAvailable')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(method)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(method.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {paymentMethods.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">{t('noPaymentMethodsConfigured')}</p>
            <Button
              onClick={() => setIsCreating(true)}
              className="mt-4 flex items-center gap-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              {t('addFirstPaymentMethod')}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}