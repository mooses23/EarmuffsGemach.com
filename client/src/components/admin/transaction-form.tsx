import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insertTransactionSchema } from "@/lib/types";
import type { InsertTransaction, Transaction, Location } from "@/lib/types";
import { createTransaction, updateTransaction } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoaderCircle, User, Phone, Mail, MapPin, DollarSign, CalendarIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TransactionFormProps {
  transaction?: Transaction;
  locations: Location[];
  onSuccess?: () => void;
}

function SectionHeading({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex-1 border-t border-border/60 ml-1" />
    </div>
  );
}

const inputClass =
  "h-11 px-3 text-sm border-border/70 transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0";

const iconInputClass =
  "h-11 pl-9 text-sm border-border/70 transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0";

const labelClass = "text-xs font-medium text-muted-foreground";

function IconInputWrapper({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      {children}
    </div>
  );
}

export function TransactionForm({ transaction, locations, onSuccess }: TransactionFormProps) {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();

  const form = useForm<InsertTransaction & { expectedReturnDate: Date | undefined }>({
    resolver: zodResolver(insertTransactionSchema),
    defaultValues: transaction ? {
      locationId: transaction.locationId,
      borrowerName: transaction.borrowerName,
      borrowerEmail: transaction.borrowerEmail || "",
      borrowerPhone: transaction.borrowerPhone || "",
      depositAmount: transaction.depositAmount,
      expectedReturnDate: transaction.expectedReturnDate ? new Date(transaction.expectedReturnDate) : undefined,
      notes: transaction.notes || "",
    } : {
      locationId: locations[0]?.id || 1,
      borrowerName: "",
      borrowerEmail: "",
      borrowerPhone: "",
      depositAmount: 20,
      expectedReturnDate: undefined,
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertTransaction) => createTransaction(data),
    onSuccess: () => {
      toast({
        title: t("success"),
        description: t("transactionCreatedSuccess"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      form.reset();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToRecordTransaction")}: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: InsertTransaction) => updateTransaction(transaction!.id, data),
    onSuccess: () => {
      toast({
        title: t("success"),
        description: t("transactionUpdatedSuccessful"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast({
        title: t("error"),
        description: `${t("failedToUpdateTransaction")}: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertTransaction & { expectedReturnDate: Date | undefined }) => {
    const formattedData: InsertTransaction = {
      ...data,
      expectedReturnDate: data.expectedReturnDate ? data.expectedReturnDate : undefined,
      borrowerEmail: data.borrowerEmail || undefined,
      borrowerPhone: data.borrowerPhone || undefined,
      notes: data.notes || undefined,
    };

    if (transaction) {
      updateMutation.mutate(formattedData);
    } else {
      createMutation.mutate(formattedData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

        <div className="space-y-3">
          <SectionHeading icon={MapPin} label={t("gemachLocation")} />
          <FormField
            control={form.control}
            name="locationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("gemachLocation")}</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(parseInt(value, 10))}
                  defaultValue={field.value.toString()}
                >
                  <FormControl>
                    <SelectTrigger className="h-11 text-sm border-border/70 hover:border-border transition-colors">
                      <SelectValue placeholder={t("selectALocationPlaceholder")} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id.toString()}>
                        {language === "he" && location.nameHe ? location.nameHe : location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-3">
          <SectionHeading icon={User} label={t("borrowerInfo")} />
          <FormField
            control={form.control}
            name="borrowerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("borrowerNameLabel")}</FormLabel>
                <FormControl>
                  <IconInputWrapper icon={User}>
                    <Input {...field} className={iconInputClass} />
                  </IconInputWrapper>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="borrowerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>{t("borrowerEmailOptionalLabel")}</FormLabel>
                  <FormControl>
                    <IconInputWrapper icon={Mail}>
                      <Input
                        type="email"
                        {...field}
                        className={iconInputClass}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </IconInputWrapper>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="borrowerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>{t("borrowerPhoneOptionalLabel")}</FormLabel>
                  <FormControl>
                    <IconInputWrapper icon={Phone}>
                      <Input
                        {...field}
                        className={iconInputClass}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </IconInputWrapper>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeading icon={DollarSign} label={t("transactionDetails")} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="depositAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>{t("depositAmount")}</FormLabel>
                  <FormControl>
                    <IconInputWrapper icon={DollarSign}>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        {...field}
                        className={iconInputClass}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                      />
                    </IconInputWrapper>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expectedReturnDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className={labelClass}>{t("expectedReturnDate")}</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-11 w-full pl-3 text-left text-sm font-normal border-border/70 hover:border-border transition-colors",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>{t("pickADate")}</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel className={labelClass}>{t("notes")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    {...field}
                    className="text-sm leading-relaxed border-border/70 hover:border-border transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 border-t border-border/60 bg-background z-10">
          <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={isPending}>
            {isPending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                {transaction ? t("updating") : t("recording")}
              </>
            ) : transaction ? t("updateTransaction") : t("recordTransaction")}
          </Button>
        </div>

      </form>
    </Form>
  );
}
