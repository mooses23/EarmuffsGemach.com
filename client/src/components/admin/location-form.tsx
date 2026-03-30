import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertLocationSchema } from "@/lib/types";
import type { InsertLocation, Location } from "@/lib/types";
import { createLocation, updateLocation } from "@/lib/api";
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
import { LoaderCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LocationFormProps {
  location?: Location;
  regions: { id: number; name: string }[];
  onSuccess?: () => void;
}

export function LocationForm({ location, regions, onSuccess }: LocationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertLocation>({
    resolver: zodResolver(insertLocationSchema.omit({ locationCode: true, operatorPin: true })),
    mode: "onChange",
    defaultValues: location ? {
      name: location.name || "",
      contactPerson: location.contactPerson || "",
      address: location.address || "",
      zipCode: location.zipCode || "",
      phone: location.phone || "",
      email: location.email || "",
      regionId: location.regionId || 1,
      isActive: location.isActive ?? true,
      cashOnly: location.cashOnly || false,
      depositAmount: location.depositAmount || 20,
    } : {
      name: "",
      contactPerson: "",
      address: "",
      zipCode: "",
      phone: "",
      email: "",
      regionId: regions[0]?.id || 1,
      isActive: true,
      cashOnly: false,
      depositAmount: 20,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertLocation) => createLocation(data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Location has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create location: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: InsertLocation) => updateLocation(location!.id, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Location has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update location: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertLocation) => {
    if (location) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Gemach Name</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  className="w-full"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contactPerson"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Person</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  className="w-full"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
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
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  className="w-full"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="zipCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Zip Code (Optional)</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  className="w-full"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    className="w-full"
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input 
                    type="email" 
                    {...field} 
                    className="w-full"
                    value={field.value || ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="regionId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Region</FormLabel>
              <Select
                onValueChange={(value) => field.onChange(parseInt(value, 10))}
                value={field.value?.toString() || ""}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a region" />
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

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active Status</FormLabel>
                <p className="text-sm text-muted-foreground">
                  Set whether this gemach location is currently active and visible to users.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="depositAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deposit Amount ($)</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  min="1" 
                  step="1"
                  value={field.value || 20}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 20)} 
                />
              </FormControl>
              <FormDescription>
                Set the deposit amount required for borrowing earmuffs at this location.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />


        <FormField
          control={form.control}
          name="paymentMethods"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">Payment Methods</FormLabel>
              <FormDescription>
                Select which payment methods are available at this location.
              </FormDescription>
              <div className="grid grid-cols-2 gap-4 pt-2">
                {[
                  { id: "cash", label: "Cash" },
                  { id: "stripe", label: "Stripe (Credit/Debit Cards)" },
                  { id: "paypal", label: "PayPal" },
                  { id: "square", label: "Square" }
                ].map((method) => (
                  <FormItem key={method.id} className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value?.includes(method.id) || false}
                        onCheckedChange={(checked) => {
                          const currentMethods = field.value || ["cash"];
                          if (checked) {
                            field.onChange([...currentMethods, method.id]);
                          } else {
                            field.onChange(currentMethods.filter((m) => m !== method.id));
                          }
                        }}
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-normal">
                      {method.label}
                    </FormLabel>
                  </FormItem>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cashOnly"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Cash Only (Legacy)</FormLabel>
                <p className="text-sm text-muted-foreground">
                  This setting is maintained for compatibility. Use Payment Methods above instead.
                </p>
              </div>
              <FormControl>
                <Switch
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              {location ? "Updating..." : "Creating..."}
            </>
          ) : location ? "Update Location" : "Create Location"}
        </Button>
      </form>
    </Form>
  );
}
