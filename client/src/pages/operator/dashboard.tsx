import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Home, LogOut, Package, ArrowRight, ArrowLeft, Phone, User, DollarSign, Check, AlertTriangle, Plus, Search, RotateCcw, CreditCard, CheckCircle, XCircle, Trash2, Clock, KeyRound, ShieldCheck, BellRing, Mail, MessageSquare } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useLocation } from "wouter";
import { useOperatorAuth } from "@/hooks/use-operator-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Transaction, Location, HEADBAND_COLORS, InventoryByColor, ReturnReminderEventWithSender } from "@shared/schema";
import { isPhoneSendableViaSms } from "@shared/phone";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { format, isAfter, addDays } from "date-fns";
import StripeSetupCheckout from "@/components/payment/stripe-setup-checkout";

function formatLocalizedDate(date: Date, language: 'en' | 'he', includeTime: boolean = true): string {
  const locale = language === 'he' ? 'he-IL' : 'en-US';
  const options: Intl.DateTimeFormatOptions = includeTime 
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: language === 'en' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

const COLOR_SWATCHES: Record<string, string> = {
  red: "#EF4444",
  blue: "#3B82F6",
  black: "#1F2937",
  white: "#F9FAFB",
  pink: "#EC4899",
  purple: "#8B5CF6",
  green: "#22C55E",
  orange: "#F97316",
  yellow: "#EAB308",
  gray: "#6B7280",
};

function ColorSwatch({ color, size = "md" }: { color: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };
  const bgColor = COLOR_SWATCHES[color] || "#9CA3AF";
  const isLight = color === "white" || color === "yellow";
  
  return (
    <div 
      className={`${sizes[size]} rounded-full border-2 ${isLight ? 'border-gray-300' : 'border-transparent'}`}
      style={{ backgroundColor: bgColor }}
    />
  );
}

function StockOverview({ inventory, totalStock, onAddStock, onEditStock }: { inventory: { color: string; quantity: number }[]; totalStock: number; onAddStock: () => void; onEditStock: (color: string, currentQty: number) => void }) {
  const { t } = useLanguage();
  const inventoryByColor = inventory.reduce((acc, item) => ({ ...acc, [item.color]: item.quantity }), {} as InventoryByColor);
  
  const lowStockThreshold = 3;
  const lowStockColors = Object.entries(inventoryByColor).filter(([_, qty]) => (qty || 0) <= lowStockThreshold && (qty || 0) > 0);
  
  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Package className="h-5 w-5" />
              {t('stockOverview')}
            </CardTitle>
            <CardDescription className="text-slate-400">{t('currentHeadbandInventory')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onAddStock} className="border-white/20 hover:bg-white/10">
            <Plus className="h-4 w-4 mr-1" /> {t('addStock')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-3xl font-bold text-white">{totalStock}</div>
          <div className="text-sm text-slate-400">{t('totalHeadbandsInStock')}</div>
        </div>
        
        {lowStockColors.length > 0 && (
          <div className="mb-4 p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-amber-300 font-medium mb-2">
              <AlertTriangle className="h-4 w-4" /> {t('lowStockAlert')}
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockColors.map(([color, qty]) => (
                <Badge key={color} variant="outline" className="bg-amber-500/20 border-amber-500/30 text-amber-300">
                  <ColorSwatch color={color} size="sm" />
                  <span className="ml-1 capitalize">{color}: {qty}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {Object.entries(inventoryByColor).filter(([_, qty]) => (qty || 0) > 0).map(([color, qty]) => (
            <button
              key={color}
              onClick={() => onEditStock(color, qty || 0)}
              className="flex items-center gap-2 p-2 border border-white/10 rounded-lg hover:bg-white/10 hover:border-primary/50 transition-colors cursor-pointer text-left"
            >
              <ColorSwatch color={color} />
              <div>
                <div className="text-sm capitalize font-medium text-white">{color}</div>
                <div className="text-lg font-bold text-white">{qty}</div>
              </div>
            </button>
          ))}
          {inventory.length === 0 && (
            <div className="col-span-full text-center py-4 text-slate-400">
              {t('noInventoryData')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RestockingInstructions() {
  const { t } = useLanguage();
  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-white">
          <Package className="h-5 w-5" />
          {t('restockingInstructions')}
        </CardTitle>
        <CardDescription className="text-slate-400">{t('howToReorder')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 text-sm text-slate-300">
          <div>
            <h4 className="font-semibold mb-2 text-white">{t('usCanadaOrders')}</h4>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>{t('goTo')} <a href="https://usa.banzworld.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" aria-label={t('visitBabyBanzWebsite')}>usa.banzworld.com</a></li>
              <li>{t('clickOnAccount')}</li>
              <li>{t('logInWith')}
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li><strong className="text-white">{t('emailLabel')}</strong> earmuffsgemach@gmail.com</li>
                  <li><strong className="text-white">{t('passwordLabel')}</strong> Babybanz</li>
                </ul>
              </li>
              <li>{t('discountAutoApply')}</li>
              <li>{t('enterShippingPayment')}</li>
            </ol>
          </div>
          
          <div className="border-t border-white/10 pt-4">
            <h4 className="font-semibold mb-2 text-white">{t('ifDiscountsNoPopulate')}</h4>
            <p className="mb-2">{t('useDiscountCodes')}</p>
            <div className="space-y-2 ml-2">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="font-mono border-white/20 text-slate-300">GEMACHSHIP</Badge>
                <span>{t('forFreeShipping')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{t('combineWith')}</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="font-mono border-white/20 text-slate-300">GEMACH</Badge>
                <span>{t('for50Off')}</span>
              </div>
            </div>
          </div>
          
          <div className="border-t border-white/10 pt-4">
            <p className="text-xs text-slate-400 italic">
              {t('restockingNote')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReminderHistoryTimeline({ tx, locationId }: { tx: Transaction; locationId: number }) {
  const { t, language } = useLanguage();
  const reminderCount = tx.returnReminderCount ?? 0;
  const enabled = reminderCount > 0;
  const [senderFilter, setSenderFilter] = useState<string>('__all__');

  const { data, isLoading } = useQuery<{ events: ReturnReminderEventWithSender[] }>({
    queryKey: ['/api/locations', locationId, 'transactions', tx.id, 'return-reminders'],
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/locations/${locationId}/transactions/${tx.id}/return-reminders`,
      );
      return res.json();
    },
    enabled,
  });

  const events = data?.events ?? [];
  const unknownLabel = t('reminderHistorySenderUnknown');
  const senderOptions = Array.from(
    new Map(
      events.map((ev) => {
        const key = ev.sentByUserId != null ? `id:${ev.sentByUserId}` : `name:${ev.senderName ?? '__unknown__'}`;
        const label = ev.senderName ?? unknownLabel;
        return [key, { key, label }];
      }),
    ).values(),
  );
  const filteredEvents = senderFilter === '__all__'
    ? events
    : events.filter((ev) => {
        const key = ev.sentByUserId != null ? `id:${ev.sentByUserId}` : `name:${ev.senderName ?? '__unknown__'}`;
        return key === senderFilter;
      });

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3" data-testid={`reminder-history-${tx.id}`}>
      <div className="flex items-center gap-2 mb-2">
        <BellRing className="h-4 w-4 text-amber-300" />
        <span className="text-sm font-medium text-white">{t('reminderHistoryTitle')}</span>
        {enabled && (
          <span className="text-xs text-slate-400">({reminderCount})</span>
        )}
      </div>
      {!enabled ? (
        <p className="text-xs text-slate-400">{t('reminderHistoryEmpty')}</p>
      ) : isLoading ? (
        <p className="text-xs text-slate-400">{t('reminderHistoryLoading')}</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-400">{t('reminderHistoryEmpty')}</p>
      ) : (
        <>
          {senderOptions.length > 1 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5" data-testid={`reminder-history-filter-${tx.id}`}>
              <span className="text-[10px] uppercase tracking-wide text-slate-400 me-1">
                {t('reminderHistoryFilterLabel')}:
              </span>
              <button
                type="button"
                onClick={() => setSenderFilter('__all__')}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  senderFilter === '__all__'
                    ? 'bg-amber-300/20 border-amber-300/60 text-amber-200'
                    : 'border-white/20 text-slate-300 hover:bg-white/10'
                }`}
                data-testid={`reminder-history-filter-chip-all-${tx.id}`}
              >
                {t('reminderHistoryFilterAll')}
              </button>
              {senderOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSenderFilter(opt.key)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    senderFilter === opt.key
                      ? 'bg-amber-300/20 border-amber-300/60 text-amber-200'
                      : 'border-white/20 text-slate-300 hover:bg-white/10'
                  }`}
                  data-testid={`reminder-history-filter-chip-${tx.id}-${opt.key}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {filteredEvents.length === 0 ? (
            <p className="text-xs text-slate-400">{t('reminderHistoryFilterEmpty')}</p>
          ) : (
            <ol className="space-y-1.5">
              {filteredEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center gap-2 text-xs text-slate-300"
                  data-testid={`reminder-history-item-${ev.id}`}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 flex-shrink-0" />
                  <span className="text-slate-200">{formatLocalizedDate(new Date(ev.sentAt), language)}</span>
                  <span className="text-slate-500">·</span>
                  <span
                    className="inline-flex items-center gap-1 uppercase tracking-wide text-[10px] text-slate-400"
                    data-testid={`reminder-history-channel-${ev.id}`}
                  >
                    {ev.channel === 'sms'
                      ? <Phone className="h-3 w-3" />
                      : <Mail className="h-3 w-3" />}
                    {ev.channel === 'sms' ? t('reminderChannelSms') : t('reminderChannelEmail')}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="uppercase tracking-wide text-[10px] text-slate-400">{ev.language}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-300" data-testid={`reminder-history-sender-${ev.id}`}>
                    {t('reminderHistorySender').replace('{{name}}', ev.senderName ?? unknownLabel)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

// Operator-scoped Twilio status. Cached per session via React Query so the
// reminder dialog can show the SMS option (or a "not configured" tooltip)
// without re-fetching on every transaction. Failure to fetch is treated
// as "not configured" — the dashboard never blocks on this signal.
function useSmsConfigStatus(): { configured: boolean; reason?: string; isLoading: boolean } {
  const { data, isLoading } = useQuery<{ configured: boolean; reason?: string }>({
    queryKey: ['/api/operator/sms-config-status'],
    staleTime: 5 * 60 * 1000,
  });
  return {
    configured: !!data?.configured,
    reason: data?.reason,
    isLoading,
  };
}

function ReturnReminderButton({ tx, locationId }: { tx: Transaction; locationId: number }) {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const email = (tx.borrowerEmail || '').trim();
  const isPlaceholderEmail = !email || email.toLowerCase().endsWith('@placeholder.local');
  const hasEmail = !isPlaceholderEmail;
  const phone = (tx.borrowerPhone || '').trim();
  const hasPhone = isPhoneSendableViaSms(phone);
  const lastSent = tx.lastReturnReminderAt ? new Date(tx.lastReturnReminderAt) : null;
  const sentRecently = !!(lastSent && (Date.now() - lastSent.getTime()) < 24 * 60 * 60 * 1000);

  const sms = useSmsConfigStatus();
  const smsAvailable = sms.configured;

  // Prefer SMS when phone + email + Twilio are all available; otherwise
  // fall back to whichever channel is usable.
  const computeDefaultChannel = (): 'email' | 'sms' => {
    if (smsAvailable && hasPhone && hasEmail) return 'sms';
    if (hasEmail) return 'email';
    if (smsAvailable && hasPhone) return 'sms';
    return 'email';
  };
  const [channel, setChannel] = useState<'email' | 'sms'>(computeDefaultChannel());

  useEffect(() => {
    if (confirmOpen) setChannel(computeDefaultChannel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmOpen, smsAvailable, hasPhone, hasEmail]);

  const mutation = useMutation({
    mutationFn: async (chosenChannel: 'email' | 'sms') => {
      return apiRequest('POST', `/api/locations/${locationId}/transactions/${tx.id}/return-reminder`, { channel: chosenChannel });
    },
    onSuccess: (_data, chosenChannel) => {
      toast({
        title: t('reminderSent'),
        description: chosenChannel === 'sms' ? t('reminderSentToastSms') : t('reminderSentToastEmail'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/locations', locationId, 'transactions'] });
      queryClient.invalidateQueries({ queryKey: [`/api/locations/${locationId}/transactions`] });
      queryClient.invalidateQueries({ queryKey: ['/api/locations', locationId, 'transactions', tx.id, 'return-reminders'] });
      setConfirmOpen(false);
    },
    onError: (err: any) => {
      toast({ title: t('reminderFailed'), description: err?.message || '', variant: 'destructive' });
    },
  });

  let disabledReason: string | null = null;
  if (tx.isReturned) disabledReason = t('reminderAlreadyReturnedTooltip');
  else if (!hasEmail && !(smsAvailable && hasPhone)) {
    if (hasPhone && !smsAvailable) {
      disabledReason = t('reminderChannelSmsNotConfiguredTooltip');
    } else if (smsAvailable) {
      disabledReason = t('reminderNoContactTooltip');
    } else {
      disabledReason = t('reminderNoEmailTooltip');
    }
  } else if (sentRecently) disabledReason = t('reminderRecentlySentTooltip');

  const button = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={!!disabledReason || mutation.isPending}
      onClick={() => setConfirmOpen(true)}
      className="border-white/20 text-slate-200 hover:bg-white/10 disabled:opacity-50"
      data-testid={`button-send-reminder-${tx.id}`}
    >
      {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <BellRing className="h-3.5 w-3.5 mr-1" />}
      {t('sendReturnReminder')}
      {(tx.returnReminderCount ?? 0) > 0 && (
        <span className="ml-1 text-xs opacity-70">({tx.returnReminderCount})</span>
      )}
    </Button>
  );

  return (
    <>
      {disabledReason ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0}>{button}</span></TooltipTrigger>
            <TooltipContent><p className="max-w-xs text-xs">{disabledReason}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : button}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reminderConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {t('reminderConfirmBody').replace('{{name}}', tx.borrowerName)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2" data-testid={`reminder-channel-group-${tx.id}`}>
            <Label className="text-sm font-medium">{t('reminderChannelLabel')}</Label>
            <RadioGroup
              value={channel}
              onValueChange={(v) => setChannel(v as 'email' | 'sms')}
              className="gap-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem
                  value="email"
                  id={`reminder-channel-email-${tx.id}`}
                  disabled={!hasEmail}
                  data-testid={`reminder-channel-email-${tx.id}`}
                />
                <Label htmlFor={`reminder-channel-email-${tx.id}`} className="flex flex-col gap-0.5 cursor-pointer">
                  <span className="flex items-center gap-1.5 text-sm">
                    <Mail className="h-3.5 w-3.5" />
                    {t('reminderChannelEmail')}
                    {hasEmail && <span className="text-xs text-muted-foreground">· {email}</span>}
                  </span>
                  {!hasEmail && (
                    <span className="text-xs text-muted-foreground" data-testid={`reminder-channel-email-hint-${tx.id}`}>
                      {t('reminderChannelEmailMissing')}
                    </span>
                  )}
                </Label>
              </div>
              {smsAvailable ? (
                <div className="flex items-start gap-2">
                  <RadioGroupItem
                    value="sms"
                    id={`reminder-channel-sms-${tx.id}`}
                    disabled={!hasPhone}
                    data-testid={`reminder-channel-sms-${tx.id}`}
                  />
                  <Label htmlFor={`reminder-channel-sms-${tx.id}`} className="flex flex-col gap-0.5 cursor-pointer">
                    <span className="flex items-center gap-1.5 text-sm">
                      <Phone className="h-3.5 w-3.5" />
                      {t('reminderChannelSms')}
                      {hasPhone && <span className="text-xs text-muted-foreground">· {phone}</span>}
                    </span>
                    {!hasPhone && (
                      <span className="text-xs text-muted-foreground" data-testid={`reminder-channel-sms-hint-${tx.id}`}>
                        {t('reminderChannelSmsMissing')}
                      </span>
                    )}
                  </Label>
                </div>
              ) : hasPhone ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                        data-testid={`reminder-channel-sms-unavailable-${tx.id}`}
                      >
                        <MessageSquare className="h-3.5 w-3.5 opacity-50" />
                        {t('reminderChannelSmsNotConfigured')}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">{sms.reason || t('reminderChannelSmsNotConfiguredTooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </RadioGroup>
          </div>

          {lastSent && (
            <div className="text-xs text-muted-foreground">
              {t('reminderLastSentLabel')}: {formatLocalizedDate(lastSent, language)}
              {(tx.returnReminderCount ?? 0) > 0 && ` · ${t('reminderCountLabel')}: ${tx.returnReminderCount}`}
            </div>
          )}
          {(tx.returnReminderCount ?? 0) > 0 && (
            <ReminderHistoryTimeline tx={tx} locationId={locationId} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={mutation.isPending}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => mutation.mutate(channel)}
              disabled={
                mutation.isPending ||
                (channel === 'email' && !hasEmail) ||
                (channel === 'sms' && (!smsAvailable || !hasPhone))
              }
              data-testid={`button-confirm-reminder-${tx.id}`}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('sendReminder')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Standalone refund dialog reachable from Recent Activity. Used for charged
// transactions that have already been auto-marked returned (which the
// ReturnWizard filters out), and for follow-up partial refunds against rows
// already in PARTIALLY_REFUNDED status.
function RefundChargedDialog({
  tx,
  open,
  onOpenChange,
  locationId,
}: {
  tx: Transaction;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locationId: number;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const depositCents = Math.round((tx.depositAmount || 0) * 100);
  // Mirror server formula in /refund-pay-later: maxRefundCents = depositCents
  // + depositFeeCents. Including the processing fee here keeps the dialog's
  // "Remaining refundable" total in sync with what the server will accept;
  // otherwise borrowers paying via Stripe (where a fee was added on top of
  // the deposit) would see a smaller cap than what's actually refundable.
  const feeCents = (tx.depositFeeCents ?? 0) as number;
  const maxRefundCents = depositCents + feeCents;
  const alreadyRefundedCents = Math.round(((tx.refundAmount ?? 0) as number) * 100);
  const remainingCents = Math.max(0, maxRefundCents - alreadyRefundedCents);
  const remaining = remainingCents / 100;
  const [isPartial, setIsPartial] = useState(false);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [reason, setReason] = useState("");
  const [physicallyReturned, setPhysicallyReturned] = useState(!tx.isReturned);

  useEffect(() => {
    if (open) {
      setIsPartial(false);
      setAmount(remaining.toFixed(2));
      setReason("");
      setPhysicallyReturned(!tx.isReturned);
    }
  }, [open, remaining, tx.isReturned]);

  const refundMutation = useMutation({
    mutationFn: async () => {
      const refundAmount = isPartial ? parseFloat(amount) : undefined;
      const res = await apiRequest("POST", `/api/operator/transactions/${tx.id}/refund-pay-later`, {
        refundAmount,
        reason: reason.trim() || undefined,
        itemPhysicallyReturned: physicallyReturned,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("success"), description: t("stripeRefundProcessed").replace("${amount}", (isPartial ? parseFloat(amount) : remaining).toFixed(2)) });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "inventory"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: t("error"), description: err.message, variant: "destructive" });
    },
  });

  const partialAmt = parseFloat(amount);
  const validPartial = !isPartial || (Number.isFinite(partialAmt) && partialAmt > 0 && partialAmt <= remaining);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t("refundDeposit")}</DialogTitle>
          <DialogDescription className="text-slate-400">
            {tx.borrowerName} · {t("txNumber")}{tx.id}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-slate-300">
            <div>{t("originalChargeLabel")}: <span className="text-white font-medium">${(depositCents / 100).toFixed(2)}</span></div>
            {alreadyRefundedCents > 0 && (
              <div>{t("alreadyRefundedLabel")}: <span className="text-amber-300 font-medium">${(alreadyRefundedCents / 100).toFixed(2)}</span></div>
            )}
            <div>{t("remainingRefundableLabel")}: <span className="text-white font-medium">${remaining.toFixed(2)}</span></div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={isPartial ? "outline" : "default"}
              onClick={() => { setIsPartial(false); setAmount(remaining.toFixed(2)); }}
              data-testid="button-refund-full"
            >
              {t("fullRefund")}
            </Button>
            <Button
              size="sm"
              variant={isPartial ? "default" : "outline"}
              onClick={() => { setIsPartial(true); setAmount(""); }}
              data-testid="button-refund-partial"
            >
              {t("partialRefund")}
            </Button>
          </div>

          {isPartial && (
            <div>
              <Label className="text-slate-300 text-sm">{t("refundAmountLabel")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-refund-amount"
              />
            </div>
          )}

          <div>
            <Label className="text-slate-300 text-sm">{t("reasonLabel")}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              maxLength={500}
              className="bg-white/5 border-white/10 text-white"
              data-testid="input-refund-reason"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={physicallyReturned}
              onChange={(e) => setPhysicallyReturned(e.target.checked)}
              className="mt-1"
              data-testid="checkbox-item-physically-returned"
            />
            <span>
              {tx.isReturned
                ? t("itemPhysicallyReturnedConfirmLabel")
                : t("itemPhysicallyReturnedLabel")}
            </span>
          </label>
          {tx.isReturned && tx.actualReturnDate && (
            <div className="text-xs text-slate-400" data-testid="text-already-returned-notice">
              {t("itemAlreadyReturnedNotice")}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button
            onClick={() => refundMutation.mutate()}
            disabled={!validPartial || refundMutation.isPending || remaining <= 0}
            data-testid="button-confirm-refund"
          >
            {refundMutation.isPending ? t("processing") : t("confirmRefund")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecentActivity({ transactions, locationId, locationCode }: { transactions: Transaction[]; locationId: number; locationCode?: string }) {
  const { t, language } = useLanguage();
  const [refundTx, setRefundTx] = useState<Transaction | null>(null);
  const [showFindPast, setShowFindPast] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const locationTxns = [...transactions].filter(tx => tx.locationId === locationId);
  const recentTransactions = locationTxns
    .sort((a, b) => new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime())
    .slice(0, 5);

  // Charged or partially-refunded transactions for the "Find past" dialog —
  // these are the ones eligible for refund regardless of their isReturned flag.
  const chargedTransactions = locationTxns
    .filter(tx => tx.payLaterStatus === "CHARGED" || tx.payLaterStatus === "PARTIALLY_REFUNDED")
    .sort((a, b) => new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime());

  const filteredCharged = searchQuery.trim()
    ? chargedTransactions.filter(tx =>
        tx.borrowerName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        String(tx.id).includes(searchQuery.trim())
      )
    : chargedTransactions;

  const isRefundable = (tx: Transaction) =>
    tx.payLaterStatus === "CHARGED" || tx.payLaterStatus === "PARTIALLY_REFUNDED";
  
  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white">{t('recentActivityLabel')}</CardTitle>
            <CardDescription className="text-slate-400">{t('last5Transactions')}</CardDescription>
          </div>
          {locationCode && (
            <Badge variant="outline" className="text-sm border-white/20 text-slate-300">
              {t('gemach')} {locationCode}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {recentTransactions.length === 0 ? (
          <div className="text-center py-4 text-slate-400">{t('noRecentActivityOperator')}</div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex flex-col gap-2 p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {tx.headbandColor && <ColorSwatch color={tx.headbandColor} size="sm" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{tx.borrowerName}</span>
                      <span className="text-xs text-slate-400 bg-white/10 px-1.5 py-0.5 rounded">
                        {t('txNumber')}{tx.id}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatLocalizedDate(new Date(tx.borrowDate), language)}
                    </div>
                    {!tx.isReturned && tx.lastReturnReminderAt && (
                      <div className="text-xs text-amber-300 mt-0.5" data-testid={`text-reminder-sent-${tx.id}`}>
                        <BellRing className="inline h-3 w-3 mr-1 -mt-0.5" />
                        {t('reminderSentInline').replace('{{date}}', formatLocalizedDate(new Date(tx.lastReturnReminderAt), language))}
                        {(tx.returnReminderCount ?? 0) > 1 && ` · ×${tx.returnReminderCount}`}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:flex-row-reverse">
                  <div className="text-right">
                    <Badge variant={tx.isReturned ? "outline" : "default"} className={tx.isReturned ? "mb-1 border-white/20 text-slate-300" : "mb-1"}>
                      {tx.payLaterStatus === "REFUNDED"
                        ? t("refundedLabel")
                        : tx.payLaterStatus === "PARTIALLY_REFUNDED"
                          ? t("partiallyRefundedLabel")
                          : tx.isReturned ? t("returned") : t("activeBorrow")}
                    </Badge>
                    <div className="text-xs font-medium text-white">${tx.depositAmount.toFixed(2)}</div>
                  </div>
                  {!tx.isReturned && (
                    <ReturnReminderButton tx={tx} locationId={locationId} />
                  )}
                  {isRefundable(tx) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRefundTx(tx)}
                      data-testid={`button-refund-${tx.id}`}
                    >
                      {t("refundDeposit") || "Refund"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-right">
          <Button
            variant="link"
            size="sm"
            className="text-slate-300"
            onClick={() => setShowFindPast(true)}
            data-testid="button-find-past-charged"
          >
            {t("findPastChargedTransaction")}
          </Button>
        </div>
      </CardContent>

      {refundTx && (
        <RefundChargedDialog
          tx={refundTx}
          open={!!refundTx}
          onOpenChange={(v) => !v && setRefundTx(null)}
          locationId={locationId}
        />
      )}

      <Dialog open={showFindPast} onOpenChange={setShowFindPast}>
        <DialogContent className="glass-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{t("findPastChargedTitle")}</DialogTitle>
            <DialogDescription className="text-slate-400">
              {t("findPastChargedDescription")}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={t("searchBorrowerOrId")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white/5 border-white/10 text-white"
            data-testid="input-find-past-search"
          />
          <div className="max-h-80 overflow-y-auto space-y-2 mt-2">
            {filteredCharged.length === 0 ? (
              <div className="text-center py-4 text-slate-400">
                {t("noChargedTransactionsFound")}
              </div>
            ) : (
              filteredCharged.map(tx => {
                const refundedCents = Math.round(((tx.refundAmount ?? 0) as number) * 100);
                const depositCents = Math.round((tx.depositAmount || 0) * 100);
                const feeCents = (tx.depositFeeCents ?? 0) as number;
                const remaining = Math.max(0, (depositCents + feeCents) - refundedCents) / 100;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-2 bg-white/5 border border-white/10 rounded hover:bg-white/10"
                    data-testid={`row-past-charged-${tx.id}`}
                  >
                    <div className="text-sm">
                      <div className="text-white font-medium">{tx.borrowerName} <span className="text-slate-400 text-xs">#{tx.id}</span></div>
                      <div className="text-xs text-slate-400">
                        {formatLocalizedDate(new Date(tx.borrowDate), language)} · ${tx.depositAmount.toFixed(2)}
                        {refundedCents > 0 && <span className="text-amber-300"> · refunded ${(refundedCents / 100).toFixed(2)}</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={remaining <= 0}
                      onClick={() => {
                        setShowFindPast(false);
                        setRefundTx(tx);
                      }}
                      data-testid={`button-past-charged-refund-${tx.id}`}
                    >
                      {t("refundDeposit") || "Refund"}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function NumericKeypad({ value, onChange, maxValue = 999 }: { value: string; onChange: (val: string) => void; maxValue?: number }) {
  const handleKeyPress = (key: string) => {
    if (key === "backspace") {
      onChange(value.slice(0, -1));
    } else if (key === ".") {
      if (!value.includes(".")) {
        onChange(value + ".");
      }
    } else {
      const newValue = value + key;
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue) && numValue <= maxValue) {
        onChange(newValue);
      }
    }
  };
  
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];
  
  return (
    <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
      {keys.map((key) => (
        <Button
          key={key}
          variant="outline"
          size="lg"
          className="h-14 text-xl font-semibold"
          onClick={() => handleKeyPress(key)}
        >
          {key === "backspace" ? "⌫" : key}
        </Button>
      ))}
    </div>
  );
}

function LendWizard({ 
  location, 
  inventory,
  onComplete, 
  onCancel,
  transactions = []
}: { 
  location: Location; 
  inventory: { color: string; quantity: number }[];
  onComplete: () => void; 
  onCancel: () => void;
  transactions?: Transaction[];
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerPhone, setBorrowerPhone] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [depositAmount, setDepositAmount] = useState(location.depositAmount?.toString() || "20");
  const [depositEdited, setDepositEdited] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [stripePublishableKey, setStripePublishableKey] = useState<string | null>(null);
  const [serverFeeQuote, setServerFeeQuote] = useState<{ depositCents: number; feeCents: number; totalCents: number } | null>(null);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  
  const handleDepositChange = (newValue: string) => {
    if (!depositEdited) {
      if (newValue.length > depositAmount.length) {
        const typedChar = newValue.slice(-1);
        if (/[0-9]/.test(typedChar)) {
          setDepositAmount(typedChar);
          setDepositEdited(true);
          return;
        }
      }
      setDepositEdited(true);
    }
    setDepositAmount(newValue);
  };
  
  const availableColors = inventory.filter(item => item.quantity > 0).map(item => [item.color, item.quantity] as [string, number]);
  
  useEffect(() => {
    if (borrowerPhone.trim()) {
      const previousBorrower = transactions.find(tx => tx.borrowerPhone === borrowerPhone);
      if (previousBorrower && !borrowerName) {
        setBorrowerName(previousBorrower.borrowerName);
      }
    }
  }, [borrowerPhone, transactions, borrowerName]);
  
  const createTransactionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/transactions", {
        locationId: location.id,
        borrowerName,
        borrowerPhone,
        headbandColor: selectedColor,
        depositAmount: parseFloat(depositAmount),
        depositPaymentMethod: paymentMethod,
        expectedReturnDate: addDays(new Date(), 7).toISOString(),
      });
      return res.json();
    },
    onSuccess: async () => {
      await apiRequest("DELETE", `/api/locations/${location.id}/inventory`, {
        color: selectedColor,
        quantity: 1,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] });
      toast({ title: t('success'), description: t('earmuffsLentSuccessfully') });
      onComplete();
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: error.message, variant: "destructive" });
    },
  });

  const PLACEHOLDER_EMAIL_DOMAIN = "@placeholder.local";

  const initiateCardSetup = async () => {
    setIsInitiatingPayment(true);
    try {
      const emailToUse = borrowerEmail.trim() || `${borrowerPhone.replace(/\D/g, '')}${PLACEHOLDER_EMAIL_DOMAIN}`;
      const amountCents = Math.round(parseFloat(depositAmount) * 100);
      
      const res = await apiRequest("POST", "/api/deposits/setup-intent", {
        locationId: location.id,
        borrowerName,
        borrowerEmail: emailToUse,
        borrowerPhone,
        amountCents,
      });
      
      const data = await res.json();
      
      if (data.clientSecret && data.publishableKey) {
        setStripeClientSecret(data.clientSecret);
        setStripePublishableKey(data.publishableKey);
        // Fetch server-authoritative fee quote so the displayed max-charge amount
        // matches what the server will actually charge.
        try {
          const qr = await fetch(`/api/deposits/fee-quote?locationId=${location.id}&depositCents=${amountCents}`);
          if (qr.ok) setServerFeeQuote(await qr.json());
        } catch { /* non-fatal — UI falls back to location defaults */ }
        setStep(5);
      } else {
        throw new Error(data.message || "Failed to initialize card setup");
      }
    } catch (error: any) {
      toast({ 
        title: t('error'), 
        description: error.message || t('error'), 
        variant: "destructive" 
      });
    } finally {
      setIsInitiatingPayment(false);
    }
  };

  const handleStripeError = (error: string) => {
    toast({ 
      title: t('error'), 
      description: error, 
      variant: "destructive" 
    });
  };
  
  const totalSteps = paymentMethod === "card" ? 5 : 4;
  
  const canProceed = () => {
    switch (step) {
      case 1: return selectedColor !== "";
      case 2: return borrowerName.trim() !== "" && borrowerPhone.trim() !== "";
      case 3: return parseFloat(depositAmount) > 0;
      case 4: return true;
      case 5: return false;
      default: return false;
    }
  };
  
  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else if (step === 4) {
      if (paymentMethod === "card") {
        initiateCardSetup();
      } else {
        createTransactionMutation.mutate();
      }
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${s === step ? "bg-primary text-primary-foreground" : s < step ? "bg-green-500 text-white" : "bg-white/10 text-slate-400"}`}
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={step === 5} className="hover:bg-white/10 text-slate-300">{t('cancel')}</Button>
      </div>
      
      {step === 1 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">{t('selectColor')}</h3>
          {availableColors.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {t('noInventoryData')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {availableColors.map(([color, qty]) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all
                    ${selectedColor === color ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"}`}
                >
                  <ColorSwatch color={color} size="lg" />
                  <span className="capitalize font-medium">{color}</span>
                  <Badge variant="secondary">{qty} {t('available')}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      
      {step === 2 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">{t('borrowerDetails')}</h3>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="text-sm font-medium mb-1 block text-slate-300">{t('fullName')}</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  placeholder={t('enterBorrowerNamePlaceholder')}
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block text-slate-300">{t('phoneNumber')}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                  placeholder={t('enterPhoneNumberPlaceholder')}
                  value={borrowerPhone}
                  onChange={(e) => setBorrowerPhone(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {step === 3 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">{t('depositDetails')}</h3>
          <div className="space-y-6">
            <div className="flex justify-center gap-3 mb-6">
              <Button
                variant={paymentMethod === "cash" ? "default" : "outline"}
                size="lg"
                onClick={() => setPaymentMethod("cash")}
                className="flex-1 max-w-[160px]"
              >
                <DollarSign className="h-5 w-5 mr-1" /> {t('cashPayment')}
              </Button>
              <Button
                variant={paymentMethod === "card" ? "default" : "outline"}
                size="lg"
                onClick={() => setPaymentMethod("card")}
                className="flex-1 max-w-[160px]"
              >
                <CreditCard className="h-5 w-5 mr-1" /> {t('cardPayment')}
              </Button>
            </div>
            
            {paymentMethod === "card" && (
              <div className="p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-blue-300 text-sm">
                  <CreditCard className="h-4 w-4" />
                  <span>{t('cardSaveMessage')}</span>
                </div>
              </div>
            )}
            
            <div className="text-center mb-4">
              <div className="text-4xl font-bold text-white">${depositAmount || "0"}</div>
              <div className="text-sm text-slate-400">{t('depositAmount')}</div>
            </div>
            
            <NumericKeypad value={depositAmount} onChange={handleDepositChange} />
          </div>
        </div>
      )}
      
      {step === 4 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">{t('confirmTransaction')}</h3>
          <div className="max-w-md space-y-4 p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-slate-400">{t('selectColor')}</span>
              <div className="flex items-center gap-2">
                <ColorSwatch color={selectedColor} size="sm" />
                <span className="capitalize font-medium text-white">{selectedColor}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-slate-400">{t('borrower')}</span>
              <span className="font-medium text-white">{borrowerName}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-slate-400">{t('phoneNumber')}</span>
              <span className="font-medium text-white">{borrowerPhone}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-slate-400">{t('depositAmount')}</span>
              <span className="font-bold text-lg text-white">${depositAmount}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">{t('paymentMethod')}</span>
              <Badge variant="outline" className="capitalize border-white/20 text-slate-300">{paymentMethod}</Badge>
            </div>
          </div>
          {paymentMethod === "card" && (
            <div className="mt-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-blue-300 text-sm">
                <CreditCard className="h-4 w-4" />
                <span>{t('cardSaveMessage')}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 5 && stripeClientSecret && stripePublishableKey && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">{t('saveCardForDeposit')}</h3>
          <div className="max-w-md mb-4 p-3 bg-white/5 border border-white/10 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">{t('amountToAuthorize')}</span>
              <span className="font-bold text-white">${depositAmount}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-slate-400">{t('borrower')}:</span>
              <span className="text-white">{borrowerName}</span>
            </div>
          </div>
          <StripeSetupCheckout
            clientSecret={stripeClientSecret}
            publishableKey={stripePublishableKey}
            gemachName={location.name}
            maxChargeAmount={serverFeeQuote
              ? serverFeeQuote.totalCents / 100
              : (() => {
                  const dc = Math.round((parseFloat(depositAmount) || 0) * 100);
                  return (dc + Math.ceil(dc * (location.processingFeePercent ?? 300) / 10000) + (location.processingFeeFixed ?? 30)) / 100;
                })()}
            feeBreakdown={serverFeeQuote ?? undefined}
            currency="usd"
            onSuccess={async () => {
              try {
                // For card deposit, we need to assign the headband and update inventory
                await apiRequest("DELETE", `/api/locations/${location.id}/inventory`, {
                  color: selectedColor,
                    quantity: 1,
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "inventory"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/operator/transactions/pending"] });
                  toast({ title: t('success'), description: t('earmuffsLentSuccessfully') });
                  onComplete();
                } catch (error: any) {
                  toast({ 
                    title: t('error'), 
                    description: error.message || t('error'), 
                    variant: "destructive" 
                  });
                  // Still complete since the card was saved successfully
                  onComplete();
                }
              }}
              onError={handleStripeError}
            />
        </div>
      )}
      
      {step !== 5 && (
        <div className="flex justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(step - 1) : onCancel()}
            disabled={createTransactionMutation.isPending || isInitiatingPayment}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? t('cancel') : t('back')}
          </Button>
          <Button 
            onClick={handleNext} 
            disabled={!canProceed() || createTransactionMutation.isPending || isInitiatingPayment}
          >
            {createTransactionMutation.isPending || isInitiatingPayment ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('loading')}...</>
            ) : step === 4 && paymentMethod === "card" ? (
              <><CreditCard className="h-4 w-4 mr-2" /> {t('save')}</>
            ) : step === 4 ? (
              <><Check className="h-4 w-4 mr-2" /> {t('confirmLend')}</>
            ) : (
              <>{t('confirm')} <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function ReturnWizard({ 
  location, 
  transactions,
  onComplete, 
  onCancel 
}: { 
  location: Location; 
  transactions: Transaction[];
  onComplete: () => void; 
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [step, setStep] = useState(1);
  const [searchPhone, setSearchPhone] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [isPartialRefund, setIsPartialRefund] = useState(false);
  const [cardAction, setCardAction] = useState<"charge" | "release" | null>(null);
  const [chargeNote, setChargeNote] = useState("");

  // Task #39: stale-card guardrail — same policy as PayLaterTransactions panel.
  const { data: rwStripeSettings } = useQuery<{ maxCardAgeDays: number }>({
    queryKey: ["/api/operator/stripe-settings"],
    queryFn: async () => {
      const res = await fetch("/api/operator/stripe-settings", { credentials: "include" });
      if (!res.ok) return { maxCardAgeDays: 90 };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const rwMaxCardAgeDays = rwStripeSettings?.maxCardAgeDays ?? 90;

  const rwCardAgeDays = (tx: Transaction): number | null => {
    if (!tx.cardSavedAt) return null;
    return Math.floor((Date.now() - new Date(tx.cardSavedAt).getTime()) / (1000 * 60 * 60 * 24));
  };
  const rwIsStale = (tx: Transaction): boolean => {
    const a = rwCardAgeDays(tx);
    return a !== null && a > rwMaxCardAgeDays;
  };

  const rwRequestNewCardMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("POST", `/api/operator/transactions/${transactionId}/request-new-card`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('success'), description: "New card setup link sent to borrower." });
    },
    onError: (err: Error) => {
      toast({ title: t('error'), description: err.message, variant: "destructive" });
    },
  });

  const activeTransactions = transactions.filter(tx => !tx.isReturned);
  
  const filteredTransactions = searchPhone
    ? activeTransactions.filter(tx => 
        tx.borrowerPhone?.includes(searchPhone) || 
        tx.borrowerName.toLowerCase().includes(searchPhone.toLowerCase())
      )
    : activeTransactions;
  
  const isOverdue = (tx: Transaction) => {
    if (!tx.expectedReturnDate) return false;
    return isAfter(new Date(), new Date(tx.expectedReturnDate));
  };
  
  const chargeCardMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("POST", `/api/operator/transactions/${transactionId}/charge`, {
        operatorNote: chargeNote.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: t('success'),
          description: t('success'),
        });
      } else if (data.requiresAction) {
        toast({
          title: t('pending'),
          description: t('pending'),
          variant: "default",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/transactions/pending"] });
    },
    onError: (error: Error) => {
      toast({
        title: t('error'),
        description: error.message || t('error'),
        variant: "destructive",
      });
    },
  });

  const releaseCardMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("POST", `/api/operator/transactions/${transactionId}/decline`, {
        reason: "Released by operator",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('success'),
        description: t('success'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/transactions/pending"] });
    },
    onError: (error: Error) => {
      toast({
        title: t('error'),
        description: error.message || t('error'),
        variant: "destructive",
      });
    },
  });
  
  const refundPayLaterMutation = useMutation({
    mutationFn: async ({
      transactionId,
      refundAmount,
      reason,
      itemPhysicallyReturned,
    }: {
      transactionId: number;
      refundAmount?: number;
      reason?: string;
      itemPhysicallyReturned?: boolean;
    }) => {
      const res = await apiRequest("POST", `/api/operator/transactions/${transactionId}/refund-pay-later`, {
        refundAmount,
        reason,
        // The return wizard implies the item is being physically returned, so
        // restock by default. Future UI can expose a toggle for money-only refunds.
        itemPhysicallyReturned: itemPhysicallyReturned ?? true,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('success'), description: "Card charge refunded successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] });
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: error.message || "Refund failed.", variant: "destructive" });
    },
  });

  const returnMutation = useMutation({
    mutationFn: async (overrideRefund?: { refundAmount: number }) => {
      if (!selectedTransaction) throw new Error("No transaction selected");
      
      // Use override if provided, otherwise calculate from state
      const refund = overrideRefund !== undefined 
        ? overrideRefund.refundAmount 
        : (isPartialRefund ? parseFloat(refundAmount) : selectedTransaction.depositAmount);
      
      const res = await apiRequest("PATCH", `/api/transactions/${selectedTransaction.id}/return`, {
        refundAmount: refund,
      });
      
      if (selectedTransaction.headbandColor) {
        await apiRequest("POST", `/api/locations/${location.id}/inventory`, {
          color: selectedTransaction.headbandColor,
          quantity: 1,
        });
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] });
      
      const refundAmt = data?.refundAmount ?? selectedTransaction?.depositAmount ?? 0;
      const refundMsg = data?.refundProcessed 
        ? t('stripeRefundProcessed').replace('${amount}', refundAmt.toFixed(2))
        : t('returnProcessedSuccessfully');
      toast({ title: t('success'), description: refundMsg });
      onComplete();
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: error.message, variant: "destructive" });
    },
  });
  
  useEffect(() => {
    if (selectedTransaction) {
      if (!isPartialRefund) {
        setRefundAmount(selectedTransaction.depositAmount.toString());
      } else {
        // Clear the amount when switching to partial refund so user can enter fresh value
        setRefundAmount("");
      }
    }
  }, [selectedTransaction, isPartialRefund]);
  
  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Check if this is a card deposit transaction
      if (selectedTransaction?.payLaterStatus && selectedTransaction.payLaterStatus !== "CHARGED" && selectedTransaction.payLaterStatus !== "PARTIALLY_REFUNDED") {
        if (cardAction === "charge") {
          // First charge the card, then process return
          chargeCardMutation.mutate(selectedTransaction.id, {
            onSuccess: () => {
              // After charging, process the return
              returnMutation.mutate(undefined);
            },
            onError: (error) => {
              toast({
                title: t('chargeFailed'),
                description: error.message || t('chargeFailedMessage'),
                variant: "destructive",
              });
            }
          });
        } else if (cardAction === "release") {
          // Release the card, then process return
          releaseCardMutation.mutate(selectedTransaction.id, {
            onSuccess: () => {
              // After releasing, process the return with no refund
              returnMutation.mutate(undefined);
            },
            onError: (error) => {
              toast({
                title: t('releaseFailed'),
                description: error.message || t('releaseFailedMessage'),
                variant: "destructive",
              });
            }
          });
        }
      } else if (
        selectedTransaction?.payLaterStatus === "CHARGED" ||
        selectedTransaction?.payLaterStatus === "PARTIALLY_REFUNDED"
      ) {
        // Already-charged card (possibly with prior partial refunds): refund via Stripe.
        const refund = isPartialRefund ? parseFloat(refundAmount) : undefined;
        refundPayLaterMutation.mutate(
          { transactionId: selectedTransaction.id, refundAmount: refund },
          { onSuccess: onComplete }
        );
      } else {
        returnMutation.mutate(undefined);
      }
    }
  };
  
  const canProceed = () => {
    switch (step) {
      case 1: return selectedTransaction !== null;
      case 2: 
        if (selectedTransaction?.payLaterStatus && selectedTransaction.payLaterStatus !== "CHARGED" && selectedTransaction.payLaterStatus !== "PARTIALLY_REFUNDED") {
          return cardAction !== null;
        }
        return parseFloat(refundAmount) >= 0;
      case 3: return true;
      default: return false;
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${s === step ? "bg-primary text-primary-foreground" : s < step ? "bg-green-500 text-white" : "bg-white/10 text-slate-400"}`}
            >
              {s < step ? <Check className="h-4 w-4" /> : s}
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="hover:bg-white/10 text-slate-300">{t('cancel')}</Button>
      </div>
      
      {step === 1 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">{t('borrowerDetails')}</h3>
            {location.locationCode && (
              <Badge variant="outline" className="text-sm border-white/20 text-slate-300">
                {t('gemach')} {location.locationCode}
              </Badge>
            )}
          </div>
          
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              placeholder={t('searchByPhoneOrName')}
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
            />
          </div>
          
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {activeTransactions.length === 0 
                ? t('noActiveBorrowers') 
                : t('noBorrowersMatchSearch')}
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`w-full border-2 rounded-xl transition-all
                    ${selectedTransaction?.id === tx.id ? "border-primary bg-primary/10" : "border-white/10 hover:border-primary/50 hover:bg-white/5"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTransaction(tx)}
                    className="w-full p-4 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      {tx.headbandColor && <ColorSwatch color={tx.headbandColor} />}
                      <div>
                        <div className="font-medium text-white">{tx.borrowerName}</div>
                        <div className="text-sm text-slate-400">{tx.borrowerPhone}</div>
                        <div className="text-xs text-slate-400">
                          {t('borrowed')} {formatLocalizedDate(new Date(tx.borrowDate), language, false)}
                        </div>
                        {tx.lastReturnReminderAt && (
                          <div className="text-xs text-amber-300 mt-1" data-testid={`text-reminder-sent-list-${tx.id}`}>
                            <BellRing className="inline h-3 w-3 mr-1 -mt-0.5" />
                            {t('reminderSentInline').replace('{{date}}', formatLocalizedDate(new Date(tx.lastReturnReminderAt), language, false))}
                            {(tx.returnReminderCount ?? 0) > 1 && ` · ×${tx.returnReminderCount}`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">${tx.depositAmount.toFixed(2)}</div>
                      {tx.payLaterStatus && tx.payLaterStatus !== "CHARGED" && tx.payLaterStatus !== "PARTIALLY_REFUNDED" && (
                        <Badge variant="secondary" className="mt-1">
                          <CreditCard className="h-3 w-3 mr-1" /> {t('card')}
                        </Badge>
                      )}
                      {isOverdue(tx) && (
                        <Badge variant="destructive" className="mt-1">{t('overdue')}</Badge>
                      )}
                    </div>
                  </button>
                  <div className="px-4 pb-3 -mt-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <ReturnReminderButton tx={tx} locationId={location.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {step === 2 && selectedTransaction && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">
            {(selectedTransaction.payLaterStatus === "CHARGED" || selectedTransaction.payLaterStatus === "PARTIALLY_REFUNDED") ? "Refund Card Charge"
              : selectedTransaction.payLaterStatus
              ? t('processCardDeposit')
              : t('refundDeposit')}
          </h3>
          
          <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-slate-300">{t('originalDeposit')}</span>
              <span className="font-bold text-lg text-white">${selectedTransaction.depositAmount.toFixed(2)}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {t('paidVia')} {selectedTransaction.depositPaymentMethod || t('cashPayment').toLowerCase()}
              {selectedTransaction.payLaterStatus && selectedTransaction.payLaterStatus !== "CHARGED" && selectedTransaction.payLaterStatus !== "PARTIALLY_REFUNDED" && (
                <Badge variant="secondary" className="ml-2">
                  <CreditCard className="h-3 w-3 mr-1" /> {t('cardDeposit')}
                </Badge>
              )}
            </div>
          </div>

          {(selectedTransaction.returnReminderCount ?? 0) > 0 && (
            <div className="mb-6">
              <ReminderHistoryTimeline tx={selectedTransaction} locationId={location.id} />
            </div>
          )}

          {/* Card deposit specific options */}
          {selectedTransaction.payLaterStatus && selectedTransaction.payLaterStatus !== "CHARGED" && selectedTransaction.payLaterStatus !== "PARTIALLY_REFUNDED" ? (
            <div className="space-y-4">
              {selectedTransaction.payLaterStatus === "CARD_SETUP_PENDING" ? (
                <div className="p-4 bg-amber-500/20 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-2 text-amber-300 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong className="text-amber-200">{t('cardSetupIncomplete')}</strong> {t('cardSetupIncompleteMessage')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                  <div className="flex items-start gap-2 text-blue-300 text-sm mb-3">
                    <CreditCard className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{t('borrowerSavedCardMessage')}</span>
                  </div>
                </div>
              )}

              {/* Task #39: stale-card guardrail — show explanation + request-new-card CTA */}
              {["CARD_SETUP_COMPLETE", "APPROVED"].includes(selectedTransaction.payLaterStatus || "") &&
                rwIsStale(selectedTransaction) && (
                <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-2 text-amber-300 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-200">Card saved {rwCardAgeDays(selectedTransaction)} days ago — exceeds the {rwMaxCardAgeDays}-day limit.</p>
                      <p className="mt-1">Charging a stale card raises the risk of a dispute. Ask the borrower to add a fresh card, then return to charge.</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 border-amber-400/50 text-amber-200 hover:bg-amber-500/20"
                        onClick={() => rwRequestNewCardMutation.mutate(selectedTransaction.id)}
                        disabled={rwRequestNewCardMutation.isPending}
                      >
                        {rwRequestNewCardMutation.isPending ? "Sending…" : "Request new card from borrower"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-4">
                <Button
                  variant={cardAction === "charge" ? "default" : "outline"}
                  size="lg"
                  onClick={() => setCardAction("charge")}
                  className={`flex-1 ${cardAction !== "charge" ? "border-white/20 hover:bg-white/10" : ""}`}
                  disabled={
                    !["CARD_SETUP_COMPLETE", "APPROVED"].includes(selectedTransaction.payLaterStatus || "") ||
                    rwIsStale(selectedTransaction)
                  }
                >
                  <CreditCard className="h-5 w-5 mr-2" />
                  {t('chargeCard')}
                </Button>
                <Button
                  variant={cardAction === "release" ? "default" : "outline"}
                  size="lg"
                  onClick={() => setCardAction("release")}
                  className={`flex-1 ${cardAction !== "release" ? "border-white/20 hover:bg-white/10" : ""}`}
                >
                  <XCircle className="h-5 w-5 mr-2" />
                  {t('releaseCard')}
                </Button>
              </div>
              
              {cardAction === "charge" && (
                <div className="space-y-2">
                  <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-green-300 text-sm">
                      <CheckCircle className="h-4 w-4" />
                      <span>{t('cardWillBeCharged').replace('${amount}', selectedTransaction.depositAmount.toFixed(2))}</span>
                    </div>
                  </div>
                  <div
                    className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-lg"
                    data-testid="text-pre-charge-notice"
                  >
                    <div className="flex items-start gap-2 text-blue-200 text-xs">
                      <BellRing className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>
                        Borrower will get a heads-up via{" "}
                        <strong>
                          {selectedTransaction.borrowerPhone
                            ? "SMS (email fallback)"
                            : "email"}
                        </strong>{" "}
                        before the charge.
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Note to borrower (optional — included in the heads-up notification)
                    </label>
                    <textarea
                      className="w-full bg-white/10 border border-white/20 rounded-md px-3 py-2 text-sm text-white placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      maxLength={200}
                      placeholder="e.g. Your earmuffs were borrowed 45 days ago on Jan 3rd"
                      value={chargeNote}
                      onChange={e => setChargeNote(e.target.value)}
                    />
                  </div>
                </div>
              )}
              
              {cardAction === "release" && (
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-300 text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{t('cardWillBeReleased')}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {(selectedTransaction.payLaterStatus === "CHARGED" || selectedTransaction.payLaterStatus === "PARTIALLY_REFUNDED") ? (
                <div className="mb-4 p-3 bg-purple-500/20 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-200 text-sm">
                    <CreditCard className="h-4 w-4 flex-shrink-0" />
                    <span>This borrower's card was already charged. A full or partial refund will be sent back to their card via Stripe.</span>
                  </div>
                </div>
              ) : selectedTransaction.depositPaymentMethod === "stripe" && (
                <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500/30 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-300 text-sm">
                    <CreditCard className="h-4 w-4" />
                    <span>{t('cardPaymentRefundMessage')}</span>
                  </div>
                </div>
              )}
              
              <div className="mb-6">
                <div className="flex gap-4 mb-4">
                  <Button
                    variant={!isPartialRefund ? "default" : "outline"}
                    onClick={() => {
                      setIsPartialRefund(false);
                      setRefundAmount(selectedTransaction.depositAmount.toString());
                    }}
                    className={`flex-1 ${isPartialRefund ? "border-white/20 hover:bg-white/10" : ""}`}
                  >
                    {t('fullRefund')}
                  </Button>
                  <Button
                    variant={isPartialRefund ? "default" : "outline"}
                    onClick={() => setIsPartialRefund(true)}
                    className={`flex-1 ${!isPartialRefund ? "border-white/20 hover:bg-white/10" : ""}`}
                  >
                    {t('partialRefund')}
                  </Button>
                </div>
                
                {isPartialRefund && (
                  <>
                    <div className="text-center mb-4">
                      <div className="text-4xl font-bold text-white">${refundAmount || "0"}</div>
                      <div className="text-sm text-slate-400">{t('refundAmountLabel')}</div>
                    </div>
                    <NumericKeypad 
                      value={refundAmount} 
                      onChange={setRefundAmount}
                      maxValue={selectedTransaction.depositAmount}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
      
      {step === 3 && selectedTransaction && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-white">{t('confirmReturn')}</h3>
          <div className="max-w-md space-y-4 p-4 bg-white/5 border border-white/10 rounded-xl">
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-slate-400">{t('borrower')}</span>
              <span className="font-medium text-white">{selectedTransaction.borrowerName}</span>
            </div>
            {selectedTransaction.headbandColor && (
              <div className="flex justify-between items-center py-2 border-b border-white/10">
                <span className="text-slate-400">{t('headbandColor')}</span>
                <div className="flex items-center gap-2">
                  <ColorSwatch color={selectedTransaction.headbandColor} size="sm" />
                  <span className="capitalize font-medium text-white">{selectedTransaction.headbandColor}</span>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center py-2 border-b border-white/10">
              <span className="text-slate-400">{t('originalDeposit')}</span>
              <span className="font-medium text-white">${selectedTransaction.depositAmount.toFixed(2)}</span>
            </div>
            
            {/* Show card deposit action if applicable */}
            {selectedTransaction.payLaterStatus && selectedTransaction.payLaterStatus !== "CHARGED" && selectedTransaction.payLaterStatus !== "PARTIALLY_REFUNDED" ? (
              <>
                <div className="flex justify-between items-center py-2 border-b border-white/10">
                  <span className="text-slate-400">{t('action')}</span>
                  <Badge variant={cardAction === "charge" ? "default" : "secondary"}>
                    {cardAction === "charge" ? t('chargeCard') : t('releaseCard')}
                  </Badge>
                </div>
                {cardAction === "charge" ? (
                  <div className="flex justify-between items-center py-2 border-b border-white/10">
                    <span className="text-slate-400">{t('chargeAmount')}</span>
                    <span className="font-bold text-lg text-green-400">
                      ${selectedTransaction.depositAmount.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <div className="py-2 px-3 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300">
                    {t('noChargeCardReleased')}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex justify-between items-center py-2 border-b border-white/10">
                  <span className="text-slate-400">{t('refundAmountLabel')}</span>
                  <span className="font-bold text-lg text-green-400">
                    ${(isPartialRefund ? parseFloat(refundAmount) : selectedTransaction.depositAmount).toFixed(2)}
                  </span>
                </div>
                {isPartialRefund && parseFloat(refundAmount) < selectedTransaction.depositAmount && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400">{t('deduction')}</span>
                    <span className="text-red-400">
                      -${(selectedTransaction.depositAmount - parseFloat(refundAmount)).toFixed(2)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={() => step > 1 ? setStep(step - 1) : onCancel()}
          disabled={returnMutation.isPending || chargeCardMutation.isPending || releaseCardMutation.isPending || refundPayLaterMutation.isPending}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {step === 1 ? t('cancel') : t('back')}
        </Button>
        <Button 
          onClick={handleNext} 
          disabled={!canProceed() || returnMutation.isPending || chargeCardMutation.isPending || releaseCardMutation.isPending || refundPayLaterMutation.isPending}
        >
          {(returnMutation.isPending || chargeCardMutation.isPending || releaseCardMutation.isPending || refundPayLaterMutation.isPending) ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('loading')}...</>
          ) : step === 3 ? (
            <><Check className="h-4 w-4 mr-2" /> {t('confirm')}</>
          ) : (
            <>{t('next')} <ArrowRight className="h-4 w-4 ml-2" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

function AddStockDialog({ 
  location, 
  open, 
  onOpenChange 
}: { 
  location: Location; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  
  const addStockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/locations/${location.id}/inventory`, {
        color: selectedColor,
        quantity: parseInt(quantity),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] });
      toast({ title: t('success'), description: t('success') });
      onOpenChange(false);
      setSelectedColor("");
      setQuantity("1");
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: error.message, variant: "destructive" });
    },
  });
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addStock')}</DialogTitle>
          <DialogDescription>{t('currentHeadbandInventory')}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-2 block">{t('selectColor')}</label>
            <div className="grid grid-cols-5 gap-2">
              {HEADBAND_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`p-2 border-2 rounded-lg flex flex-col items-center gap-1 transition-all
                    ${selectedColor === color ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50"}`}
                >
                  <ColorSwatch color={color} />
                  <span className="text-xs capitalize">{color}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">{t('quantity')}</label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(1, parseInt(quantity) - 1).toString())}
              >
                -
              </Button>
              <Input
                type="number"
                min="1"
                className="w-20 text-center"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity((parseInt(quantity) + 1).toString())}
              >
                +
              </Button>
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button 
            onClick={() => addStockMutation.mutate()}
            disabled={!selectedColor || !quantity || addStockMutation.isPending}
          >
            {addStockMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('loading')}...</>
            ) : (
              <>{t('add')} {quantity} {selectedColor}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStockDialog({ 
  location, 
  open, 
  onOpenChange,
  color,
  currentQty
}: { 
  location: Location; 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  color: string;
  currentQty: number;
}) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(currentQty.toString());
  
  useEffect(() => {
    setQuantity(currentQty.toString());
  }, [currentQty, open]);
  
  const updateStockMutation = useMutation({
    mutationFn: async () => {
      const newQty = parseInt(quantity);
      const diff = newQty - currentQty;
      if (diff > 0) {
        const res = await apiRequest("POST", `/api/locations/${location.id}/inventory`, {
          color,
          quantity: diff,
        });
        return res.json();
      } else if (diff < 0) {
        const res = await apiRequest("DELETE", `/api/locations/${location.id}/inventory`, {
          color,
          quantity: Math.abs(diff),
        });
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] });
      toast({ title: t('success'), description: t('success') });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: t('error'), description: error.message, variant: "destructive" });
    },
  });
  
  const newQty = parseInt(quantity) || 0;
  const diff = newQty - currentQty;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ColorSwatch color={color} />
            <span className="capitalize">{t('editColorStock').replace('{color}', color)}</span>
          </DialogTitle>
          <DialogDescription>{t('adjustQuantityForColor')}</DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <label className="text-sm font-medium mb-2 block">{t('quantity')}</label>
          <div className="flex items-center gap-2 justify-center">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity(Math.max(0, parseInt(quantity) - 1).toString())}
            >
              -
            </Button>
            <Input
              type="number"
              min="0"
              className="w-24 text-center text-lg font-bold"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setQuantity((parseInt(quantity) + 1).toString())}
            >
              +
            </Button>
          </div>
          {diff !== 0 && (
            <p className={`text-center mt-2 text-sm ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {diff > 0 ? `+${diff}` : diff} {t('fromCurrentStock')}
            </p>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button 
            onClick={() => updateStockMutation.mutate()}
            disabled={diff === 0 || updateStockMutation.isPending}
          >
            {updateStockMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('updating')}...</>
            ) : (
              <>{t('save')}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function PayLaterTransactions({ location }: { location: Location }) {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [declineDialogOpen, setDeclineDialogOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [selectedTransactionForDecline, setSelectedTransactionForDecline] = useState<Transaction | null>(null);

  // Task #39: stale-card guardrail policy (admin-configurable, default 90).
  const { data: stripeSettings } = useQuery<{ maxCardAgeDays: number }>({
    queryKey: ["/api/operator/stripe-settings"],
    queryFn: async () => {
      const res = await fetch("/api/operator/stripe-settings", { credentials: "include" });
      if (!res.ok) return { maxCardAgeDays: 90 };
      return res.json();
    },
  });
  const maxCardAgeDays = stripeSettings?.maxCardAgeDays ?? 90;

  const cardAgeDays = (tx: Transaction): number | null => {
    if (!tx.cardSavedAt) return null;
    return Math.floor((Date.now() - new Date(tx.cardSavedAt).getTime()) / (1000 * 60 * 60 * 24));
  };

  const isStale = (tx: Transaction): boolean => {
    const a = cardAgeDays(tx);
    return a !== null && a > maxCardAgeDays;
  };

  const preferredChannel = (tx: Transaction): string => {
    if (tx.borrowerPhone) return "SMS";
    if (tx.borrowerEmail) return "email";
    return "no contact on file";
  };

  const requestNewCardMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/operator/transactions/${transactionId}/request-new-card`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      const link = `${window.location.origin}${data.statusUrl}`;
      toast({
        title: "New card link created",
        description: `Send this link to the borrower: ${link}`,
      });
      navigator.clipboard?.writeText(link).catch(() => {});
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t('error'),
        description: error.message || t('error'),
        variant: "destructive",
      });
    },
  });

  const { 
    data: pendingTransactions = [], 
    isLoading,
    refetch
  } = useQuery<Transaction[]>({
    queryKey: ["/api/operator/transactions/pending"],
    queryFn: async () => {
      const res = await fetch("/api/operator/transactions/pending", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch pending transactions");
      return res.json();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("POST", `/api/operator/transactions/${transactionId}/accept`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: t('success'),
          description: t('earmuffsLentSuccessfully'),
        });
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/locations", location.id, "transactions"] });
    },
    onError: (error: Error) => {
      toast({
        title: t('error'),
        description: error.message || t('error'),
        variant: "destructive",
      });
    },
  });

  const chargeMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      const res = await apiRequest("POST", `/api/operator/transactions/${transactionId}/charge`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: t('success'),
          description: t('success'),
        });
      } else if (data.requiresAction) {
        toast({
          title: t('pending'),
          description: t('pending'),
          variant: "default",
        });
      }
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t('error'),
        description: error.message || t('error'),
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTransactionForDecline) throw new Error("No transaction selected");
      const res = await apiRequest("POST", `/api/operator/transactions/${selectedTransactionForDecline.id}/decline`, {
        reason: declineReason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('success'),
        description: t('success'),
      });
      setDeclineDialogOpen(false);
      setDeclineReason("");
      setSelectedTransactionForDecline(null);
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: t('error'),
        description: error.message || t('error'),
        variant: "destructive",
      });
    },
  });

  const handleDeclineClick = (transaction: Transaction) => {
    setSelectedTransactionForDecline(transaction);
    setDeclineDialogOpen(true);
  };

  const handleDeclineConfirm = () => {
    declineMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (pendingTransactions.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="text-center py-8 text-slate-400">
            <CreditCard className="h-12 w-12 mx-auto mb-4 text-slate-500" />
            <p>{t('noPendingCardDeposits')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-white">
                <CreditCard className="h-5 w-5" />
                {t('pendingSelfDeposits')} ({pendingTransactions.length})
              </CardTitle>
              <CardDescription className="text-slate-400">{t('acceptSelfDepositsDescription')}</CardDescription>
            </div>
            {location.locationCode && (
              <Badge variant="outline" className="text-sm border-white/20 text-slate-300">
                {t('gemach')} {location.locationCode}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="space-y-3">
              {pendingTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors gap-4"
                >
                  <div className="flex-1">
                    <div className="font-medium text-white">{tx.borrowerName}</div>
                    <div className="text-sm text-slate-400">
                      {tx.borrowerPhone && <span>{tx.borrowerPhone}</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {t('created')} {formatLocalizedDate(new Date(tx.borrowDate), language)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-bold">${tx.depositAmount.toFixed(2)}</div>
                      <Badge variant="secondary" className="mt-1">
                        {tx.payLaterStatus || "SETUP_COMPLETE"}
                      </Badge>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {/* Task #39: stale-card guardrail. If the saved card is
                          older than the configured threshold, refuse to accept
                          and offer to ask the borrower for a fresh card. */}
                      {tx.payLaterStatus === 'CARD_SETUP_COMPLETE' && isStale(tx) && (
                        <div className="text-xs bg-amber-100 text-amber-900 border border-amber-300 rounded px-2 py-1 max-w-xs text-right">
                          Card saved {cardAgeDays(tx)} days ago — older than {maxCardAgeDays}-day limit. Ask the borrower for a new card before charging.
                        </div>
                      )}
                      {tx.payLaterStatus === 'CARD_SETUP_COMPLETE' && !isStale(tx) && cardAgeDays(tx) !== null && (
                        <div className="text-[11px] text-slate-400">
                          Card on file • {cardAgeDays(tx)}d old • Heads-up will go via {preferredChannel(tx)} before any charge
                        </div>
                      )}
                      <div className="flex gap-2">
                        {tx.payLaterStatus === 'CARD_SETUP_COMPLETE' && !isStale(tx) ? (
                          <Button
                            size="sm"
                            onClick={() => acceptMutation.mutate(tx.id)}
                            disabled={acceptMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                            data-testid={`button-accept-${tx.id}`}
                          >
                            {acceptMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {t('acceptAndLend')}
                              </>
                            )}
                          </Button>
                        ) : tx.payLaterStatus === 'CARD_SETUP_COMPLETE' && isStale(tx) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => requestNewCardMutation.mutate(tx.id)}
                            disabled={requestNewCardMutation.isPending}
                            data-testid={`button-request-new-card-${tx.id}`}
                          >
                            {requestNewCardMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CreditCard className="h-4 w-4 mr-1" />
                                Request new card
                              </>
                            )}
                          </Button>
                        ) : tx.payLaterStatus === 'CARD_SETUP_PENDING' ? (
                          <Button
                            size="sm"
                            disabled
                            variant="secondary"
                          >
                            <Clock className="h-4 w-4 mr-1" />
                            {t('awaitingCardSetup')}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeclineClick(tx)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          {t('decline')}
                        </Button>
                      </div>
                      {tx.consentText && (
                        <details className="text-[10px] text-slate-500 max-w-xs">
                          <summary className="cursor-pointer">View borrower consent</summary>
                          <p className="mt-1 italic">"{tx.consentText}"</p>
                          {tx.consentAcceptedAt && (
                            <p className="mt-1">
                              Agreed {formatLocalizedDate(new Date(tx.consentAcceptedAt), language)}
                            </p>
                          )}
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={declineDialogOpen} onOpenChange={setDeclineDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {t('declineTransaction')}
            </DialogTitle>
            <DialogDescription>
              {selectedTransactionForDecline?.borrowerName && (
                <span>
                  {t('declineConfirmMessage').replace('{name}', selectedTransactionForDecline.borrowerName)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedTransactionForDecline && (
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-slate-400">{t('amountLabel')}</span>
                  <span className="font-bold text-white">${selectedTransactionForDecline.depositAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">{t('borrowerLabel')}</span>
                  <span className="text-white">{selectedTransactionForDecline.borrowerName}</span>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">{t('declineReasonOptional')}</label>
              <Input
                placeholder={t('declineReasonPlaceholder')}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeclineDialogOpen(false);
                setDeclineReason("");
                setSelectedTransactionForDecline(null);
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeclineConfirm}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('declining')}</>
              ) : (
                <>{t('declineRequest')}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


export default function OperatorDashboard() {
  const { operatorLocation, isLoading: isOperatorLoading, logout } = useOperatorAuth();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [, setPath] = useLocation();
  const [activeTab, setActiveTab] = useState<"overview" | "lend" | "return" | "security">("overview");
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [suppressPinPrompt, setSuppressPinPrompt] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [editStockColor, setEditStockColor] = useState<string | null>(null);
  const [editStockQty, setEditStockQty] = useState(0);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const changePinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/operator/pin", { currentPin, newPin, confirmPin });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("pinUpdated"), description: t("pinUpdatedDescription") });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setShowPinPrompt(false);
      if (operatorLocation) {
        localStorage.removeItem(`pinPromptSuppressed:${operatorLocation.id}`);
      }
    },
    onError: (error: Error) => {
      toast({ title: t("error"), description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!isOperatorLoading && !operatorLocation) {
      setPath("/auth");
    }
  }, [isOperatorLoading, operatorLocation, setPath]);

  useEffect(() => {
    if (!operatorLocation) return;
    const isDefault = (operatorLocation as any).pinIsDefault === true;
    const suppressKey = `pinPromptSuppressed:${operatorLocation.id}`;
    const suppressed = typeof window !== "undefined" && localStorage.getItem(suppressKey) === "1";
    if (isDefault && !suppressed) {
      setShowPinPrompt(true);
    }
  }, [operatorLocation]);

  const { 
    data: transactions = [], 
    isLoading: isTransactionsLoading,
    isError,
    error
  } = useQuery<Transaction[]>({
    queryKey: ["/api/locations", operatorLocation?.id, "transactions"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${operatorLocation?.id}/transactions`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: !!operatorLocation?.id,
  });

  const { data: inventoryData, isLoading: isInventoryLoading } = useQuery<{ inventory: { color: string; quantity: number }[]; total: number }>({
    queryKey: ["/api/locations", operatorLocation?.id, "inventory"],
    queryFn: async () => {
      const res = await fetch(`/api/locations/${operatorLocation?.id}/inventory`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
    enabled: !!operatorLocation?.id,
  });

  if (isOperatorLoading || isTransactionsLoading || isInventoryLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !operatorLocation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-2xl font-bold text-destructive">{t('errorLoadingDashboard')}</h2>
          <p className="text-slate-400">{error?.message || t('failedToLoadOperatorData')}</p>
          <Button 
            variant="outline" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/operator/location"] })}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> {t('tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  const activeLoans = transactions.filter(tx => !tx.isReturned).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="glass-panel border-b border-white/10 sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button variant="ghost" size="sm" className="hover:bg-white/10 text-slate-300">
                  <Home className="h-4 w-4 mr-1" /> {t('home')}
                </Button>
              </Link>
              <span className="text-slate-500">/</span>
              <span className="font-semibold text-white">{language === "he" && operatorLocation.nameHe ? operatorLocation.nameHe : operatorLocation.name}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => logout()} className="hover:bg-white/10 text-slate-300">
              <LogOut className="h-4 w-4 mr-1" /> {t('logOut')}
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <div className="flex flex-col gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">{language === "he" && operatorLocation.nameHe ? operatorLocation.nameHe : operatorLocation.name}</h1>
              <p className="text-slate-400">{t('manageHeadbandLendingAndReturns')}</p>
            </div>
            <TabsList className="grid grid-cols-4 w-full glass-panel border-white/10">
              <TabsTrigger value="overview" className="gap-1.5 data-[state=active]:bg-white/15 data-[state=active]:text-white">
                <Package className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline truncate">{t('stockOverview')}</span>
                <span className="sm:hidden text-xs">{t('stockShort')}</span>
              </TabsTrigger>
              <TabsTrigger value="lend" className="gap-1.5 data-[state=active]:bg-white/15 data-[state=active]:text-white">
                <ArrowRight className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline truncate">{t('lendEarmuffs')}</span>
                <span className="sm:hidden text-xs">{t('lendShort')}</span>
              </TabsTrigger>
              <TabsTrigger value="return" className="gap-1.5 data-[state=active]:bg-white/15 data-[state=active]:text-white">
                <RotateCcw className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline truncate">{t('returnEarmuffs')}</span>
                <span className="sm:hidden text-xs">{t('returnShort')}</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 data-[state=active]:bg-white/15 data-[state=active]:text-white">
                <KeyRound className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">{t('security')}</span>
                <span className="sm:hidden text-xs">{t('pinShort')}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-white">{inventoryData?.total || 0}</div>
                <p className="text-sm text-slate-400">{t('totalHeadbandsInStock')}</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-white">{activeLoans}</div>
                <p className="text-sm text-slate-400">{t('activeBorrow')}</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-white">
                  ${transactions.filter(tx => !tx.isReturned).reduce((sum, tx) => sum + tx.depositAmount, 0).toFixed(0)}
                </div>
                <p className="text-sm text-slate-400">{t('depositsHeld')}</p>
              </CardContent>
            </Card>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <StockOverview 
              inventory={inventoryData?.inventory || []} 
              totalStock={inventoryData?.total || 0} 
              onAddStock={() => setShowAddStock(true)} 
              onEditStock={(color, qty) => { setEditStockColor(color); setEditStockQty(qty); }}
            />
            <RestockingInstructions />
            <RecentActivity transactions={transactions} locationId={operatorLocation.id} locationCode={operatorLocation.locationCode} />
          </TabsContent>

          <TabsContent value="lend">
            <Card className="glass-card">
              <CardContent className="pt-6">
                <LendWizard
                  location={operatorLocation}
                  inventory={inventoryData?.inventory || []}
                  transactions={transactions}
                  onComplete={() => setActiveTab("overview")}
                  onCancel={() => setActiveTab("overview")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="return">
            <Card className="glass-card">
              <CardContent className="pt-6">
                <ReturnWizard
                  location={operatorLocation}
                  transactions={transactions}
                  onComplete={() => setActiveTab("overview")}
                  onCancel={() => setActiveTab("overview")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-white">
                  <ShieldCheck className="h-5 w-5" />
                  {t('changePin')}
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {t('changePinDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="current-pin" className="text-slate-300">{t('currentPin')}</Label>
                    <Input
                      id="current-pin"
                      type="password"
                      inputMode="numeric"
                      placeholder={t('enterCurrentPin')}
                      maxLength={6}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-pin" className="text-slate-300">{t('newPin')}</Label>
                    <Input
                      id="new-pin"
                      type="password"
                      inputMode="numeric"
                      placeholder={t('pinPlaceholder')}
                      maxLength={6}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-pin" className="text-slate-300">{t('confirmNewPin')}</Label>
                    <Input
                      id="confirm-pin"
                      type="password"
                      inputMode="numeric"
                      placeholder={t('reEnterNewPin')}
                      maxLength={6}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                    {confirmPin && newPin !== confirmPin && (
                      <p className="text-sm text-red-400">{t('pinsDoNotMatch')}</p>
                    )}
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => changePinMutation.mutate()}
                    disabled={
                      changePinMutation.isPending ||
                      currentPin.length < 4 ||
                      newPin.length < 4 ||
                      confirmPin.length < 4 ||
                      newPin !== confirmPin
                    }
                  >
                    {changePinMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('saving')}</>
                    ) : (
                      <><ShieldCheck className="h-4 w-4 mr-2" /> {t('updatePin')}</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AddStockDialog 
        location={operatorLocation} 
        open={showAddStock} 
        onOpenChange={setShowAddStock} 
      />
      
      <EditStockDialog 
        location={operatorLocation} 
        open={!!editStockColor} 
        onOpenChange={(open) => !open && setEditStockColor(null)}
        color={editStockColor || ""}
        currentQty={editStockQty}
      />

      <Dialog
        open={showPinPrompt}
        onOpenChange={(open) => {
          if (!open) {
            if (suppressPinPrompt && operatorLocation) {
              localStorage.setItem(`pinPromptSuppressed:${operatorLocation.id}`, "1");
            }
            setShowPinPrompt(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[440px]" data-testid="dialog-pin-default-prompt">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" />
              {t("pinDefaultPromptTitle")}
            </DialogTitle>
            <DialogDescription>{t("pinDefaultPromptDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="suppress-pin-prompt"
              checked={suppressPinPrompt}
              onCheckedChange={(c) => setSuppressPinPrompt(c === true)}
              data-testid="checkbox-suppress-pin-prompt"
            />
            <Label htmlFor="suppress-pin-prompt" className="text-sm cursor-pointer">
              {t("pinDefaultDontRemind")}
            </Label>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (suppressPinPrompt && operatorLocation) {
                  localStorage.setItem(`pinPromptSuppressed:${operatorLocation.id}`, "1");
                }
                setShowPinPrompt(false);
              }}
              data-testid="button-pin-prompt-later"
            >
              {t("pinDefaultLater")}
            </Button>
            <Button
              onClick={() => {
                setShowPinPrompt(false);
                setActiveTab("security");
              }}
              data-testid="button-pin-prompt-change"
            >
              <KeyRound className="h-4 w-4 mr-1" />
              {t("pinDefaultChangeNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
