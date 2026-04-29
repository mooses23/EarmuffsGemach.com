import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  CreditCard,
  Loader2,
  ArrowRight,
  BellRing,
} from "lucide-react";
interface StatusPageData {
  id: number;
  status: string;
  borrowerName: string;
  amountCents: number;
  currency: string;
  locationName?: string;
  locationAddress?: string;
  locationPhone?: string;
  locationEmail?: string;
  isReturned?: boolean;
  lastReturnReminderAt?: string | null;
  returnReminderCount?: number;
  requiresAction: boolean;
  paymentIntentClientSecret?: string;
  publishableKey?: string;
  // Task #39: setup-intent (save-card) flow
  setupIntentClientSecret?: string | null;
  setupIntentId?: string | null;
  depositAmount?: number;
  depositFeeCents?: number | null;
  consentMaxChargeCents?: number | null;
  consentText?: string | null;
}

type PayLaterStatus =
  | "REQUEST_CREATED"
  | "CARD_SETUP_PENDING"
  | "CARD_SETUP_COMPLETE"
  | "APPROVED"
  | "CHARGE_ATTEMPTED"
  | "CHARGED"
  | "CHARGE_REQUIRES_ACTION"
  | "CHARGE_FAILED"
  | "DECLINED"
  | "EXPIRED";

function useStatusInfo() {
  const { t } = useLanguage();
  return (status: PayLaterStatus): {
    badge: string;
    icon: React.ReactNode;
    color: "default" | "secondary" | "destructive" | "outline";
    message: string;
  } => {
    const iconProps = { className: "w-5 h-5" };

    switch (status) {
      case "REQUEST_CREATED":
        return { badge: t("statusRequestCreated"), icon: <Clock {...iconProps} />, color: "secondary", message: t("statusRequestCreatedMsg") };
      case "CARD_SETUP_PENDING":
        return { badge: t("statusSetupPending"), icon: <Clock {...iconProps} />, color: "secondary", message: t("statusSetupPendingMsg") };
      case "CARD_SETUP_COMPLETE":
        return { badge: t("statusSetupComplete"), icon: <CheckCircle {...iconProps} />, color: "default", message: t("statusSetupCompleteMsg") };
      case "APPROVED":
        return { badge: t("approved"), icon: <CheckCircle {...iconProps} />, color: "default", message: t("statusApprovedMsg") };
      case "CHARGE_ATTEMPTED":
        return { badge: t("statusChargePending"), icon: <Clock {...iconProps} />, color: "secondary", message: t("statusChargePendingMsg") };
      case "CHARGED":
        return { badge: t("statusCharged"), icon: <CheckCircle {...iconProps} />, color: "default", message: t("statusChargedMsg") };
      case "CHARGE_REQUIRES_ACTION":
        return { badge: t("statusActionRequired"), icon: <AlertCircle {...iconProps} />, color: "destructive", message: t("statusActionRequiredMsg") };
      case "CHARGE_FAILED":
        return { badge: t("statusChargeFailed"), icon: <XCircle {...iconProps} />, color: "destructive", message: t("statusChargeFailedMsg") };
      case "DECLINED":
        return { badge: t("statusDeclined"), icon: <XCircle {...iconProps} />, color: "destructive", message: t("statusDeclinedMsg") };
      case "EXPIRED":
        return { badge: t("statusExpired"), icon: <XCircle {...iconProps} />, color: "destructive", message: t("statusExpiredMsg") };
      default:
        return { badge: t("statusUnknown"), icon: <AlertCircle {...iconProps} />, color: "outline", message: t("statusUnknownMsg") };
    }
  };
}

// Task #39 / Task #53: Borrower-facing card-on-file setup form. Renders an
// explicit consent block ABOVE the submit button and disables submission until
// the borrower acknowledges. The consent text comes from the server (/api/status
// consentText field) so what the borrower sees is byte-identical to what is stored.
function StripeSetupIntentForm({
  clientSecret,
  setupIntentId,
  consentText,
  consentMaxChargeCents,
  borrowerName,
  onSuccess,
  onError,
}: {
  clientSecret: string;
  setupIntentId: string;
  consentText: string;
  consentMaxChargeCents: number;
  borrowerName: string;
  onSuccess: () => void;
  onError: (error: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useLanguage();
  const [isProcessing, setIsProcessing] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      onError("Stripe is not loaded");
      return;
    }
    if (!consentChecked) {
      onError("You must agree to the authorization above before saving your card");
      return;
    }
    setIsProcessing(true);
    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card element not found");

      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { name: borrowerName },
        },
      });

      if (result.error) {
        onError(result.error.message || "Card setup failed");
        setIsProcessing(false);
        return;
      }

      // Persist consent + flip status to CARD_SETUP_COMPLETE without waiting
      // for the webhook.
      try {
        await fetch("/api/deposits/confirm-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            setupIntentId,
            // consentText and consentMaxChargeCents are intentionally omitted —
            // the server ignores client-provided values and recomputes both from
            // stored transaction data (Task #53).
          }),
        });
      } catch (e) {
        console.warn("confirm-setup callback failed; webhook will catch up:", e);
      }

      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "An error occurred");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="form-setup-intent">
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Save your card
          </CardTitle>
          <CardDescription>
            Maximum authorization: ${(consentMaxChargeCents / 100).toFixed(2)} (only charged if item is not returned)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 bg-white">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "16px",
                    color: "#424242",
                    "::placeholder": { color: "#9e9e9e" },
                  },
                  invalid: { color: "#d32f2f" },
                },
              }}
            />
          </div>

          <div
            className="rounded-md border border-amber-300 bg-amber-50 p-3"
            data-testid="block-consent"
          >
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-amber-600 text-amber-700 focus:ring-amber-500"
                data-testid="checkbox-consent"
              />
              <span className="text-sm text-amber-900" data-testid="text-consent">
                {consentText}
              </span>
            </label>
          </div>

          <Button
            type="submit"
            disabled={!stripe || isProcessing || !consentChecked}
            className="w-full"
            data-testid="button-submit-card"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving card...
              </>
            ) : (
              <>
                Save card
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function StripePaymentForm({
  clientSecret,
  amountCents,
  currency,
  onSuccess,
  onError,
}: {
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  currency: string;
  transactionId: number;
  onSuccess: () => void;
  onError: (error: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useLanguage();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      onError("Stripe is not loaded");
      return;
    }

    setIsProcessing(true);

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const { paymentIntent, error } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (error) {
        onError(error.message || "Payment confirmation failed");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess();
      } else if (paymentIntent && paymentIntent.status === "requires_action") {
        onError("Please complete the 3D Secure verification");
        setIsProcessing(false);
      } else {
        onError("Payment status unknown");
        setIsProcessing(false);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "An error occurred");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t("completeCardAuth")}
          </CardTitle>
          <CardDescription>
            {t("amount")}: {(amountCents / 100).toFixed(2)} {currency.toUpperCase()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 bg-white">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "16px",
                    color: "#424242",
                    "::placeholder": { color: "#9e9e9e" },
                  },
                  invalid: { color: "#d32f2f" },
                },
              }}
            />
          </div>
          <Button type="submit" disabled={!stripe || isProcessing} className="w-full">
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("processing")}
              </>
            ) : (
              <>
                {t("completeAuth")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}

function formatReminderDate(date: Date, language: 'en' | 'he'): string {
  return date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function StatusPageContent({
  transactionId,
  token,
}: {
  transactionId: string;
  token: string;
}) {
  const { t, language } = useLanguage();
  const getStatusInfo = useStatusInfo();
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  const { data, isLoading, error, refetch } = useQuery<StatusPageData>({
    queryKey: [`/api/status/${transactionId}`, token, language],
    queryFn: async () => {
      const response = await fetch(
        `/api/status/${transactionId}?token=${encodeURIComponent(token)}&locale=${language}`,
        { credentials: "include" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch transaction status");
      }

      return response.json();
    },
    enabled: !!transactionId && !!token,
  });

  if (data?.publishableKey && !stripePromise) {
    setStripePromise(loadStripe(data.publishableKey));
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="py-8">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900 mb-1">{t("error")}</h3>
                <p className="text-sm text-red-700">
                  {error instanceof Error ? error.message : t("failedToLoadStatus")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <p className="text-gray-600">{t("noTransactionData")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = getStatusInfo(data.status as PayLaterStatus);
  const amount = data.amountCents / 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {t("transactionStatus")}
          </h1>
          <p className="text-gray-600">{t("transactionNumber")}{data.id}</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl mb-2">
                  {data.borrowerName}
                </CardTitle>
                <CardDescription>
                  {data.locationName}
                  {data.locationAddress && ` • ${data.locationAddress}`}
                </CardDescription>
              </div>
              <Badge variant={statusInfo.color} className="flex items-center gap-2">
                {statusInfo.icon}
                {statusInfo.badge}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">{t("amount")}</p>
              <p className="text-3xl font-bold text-gray-900">
                {amount.toFixed(2)} {data.currency.toUpperCase()}
              </p>
            </div>

            {paymentError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{paymentError}</AlertDescription>
              </Alert>
            )}

            {paymentSuccess && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {t("paymentAuthCompleted")}
                </AlertDescription>
              </Alert>
            )}

            {!paymentSuccess && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{statusInfo.message}</AlertDescription>
              </Alert>
            )}

            {!data.isReturned && data.lastReturnReminderAt && (
              <Alert
                className="border-amber-300 bg-amber-50"
                data-testid="alert-borrower-reminder-sent"
              >
                <BellRing className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <div className="font-medium">
                    {t("borrowerReminderNotice").replace(
                      "{{date}}",
                      formatReminderDate(new Date(data.lastReturnReminderAt), language),
                    )}
                  </div>
                  {(data.returnReminderCount ?? 0) > 1 && (
                    <div className="text-xs mt-1 opacity-80">
                      {t("reminderCountLabel")}: {data.returnReminderCount}
                    </div>
                  )}
                  {(data.locationPhone || data.locationEmail) && (
                    <div className="text-xs mt-2 opacity-90">
                      {t("borrowerReminderContactPrompt")}
                      {data.locationPhone && (
                        <>
                          {" "}
                          <a
                            href={`tel:${data.locationPhone.replace(/[^+\d]/g, "")}`}
                            className="underline hover:no-underline"
                            data-testid="link-borrower-reminder-phone"
                          >
                            {data.locationPhone}
                          </a>
                        </>
                      )}
                      {data.locationPhone && data.locationEmail && " · "}
                      {data.locationEmail && (
                        <a
                          href={`mailto:${data.locationEmail}`}
                          className="underline hover:no-underline"
                          data-testid="link-borrower-reminder-email"
                        >
                          {data.locationEmail}
                        </a>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {data.requiresAction &&
              !paymentSuccess &&
              stripePromise &&
              data.paymentIntentClientSecret &&
              data.publishableKey && (
                <Elements stripe={stripePromise}>
                  <StripePaymentForm
                    clientSecret={data.paymentIntentClientSecret}
                    publishableKey={data.publishableKey}
                    amountCents={data.amountCents}
                    currency={data.currency}
                    transactionId={data.id}
                    onSuccess={() => {
                      setPaymentSuccess(true);
                      setTimeout(() => refetch(), 1000);
                    }}
                    onError={(error) => {
                      setPaymentError(error);
                    }}
                  />
                </Elements>
              )}

            {/* Task #39: Card-on-file setup with explicit consent */}
            {data.status === "CARD_SETUP_PENDING" &&
              !paymentSuccess &&
              stripePromise &&
              data.setupIntentClientSecret &&
              data.setupIntentId &&
              data.publishableKey &&
              data.consentText && (
                <Elements stripe={stripePromise}>
                  <StripeSetupIntentForm
                    clientSecret={data.setupIntentClientSecret}
                    setupIntentId={data.setupIntentId}
                    consentText={data.consentText}
                    consentMaxChargeCents={data.consentMaxChargeCents ?? data.amountCents}
                    borrowerName={data.borrowerName}
                    onSuccess={() => {
                      setPaymentSuccess(true);
                      setTimeout(() => refetch(), 1000);
                    }}
                    onError={(error) => {
                      setPaymentError(error);
                    }}
                  />
                </Elements>
              )}

            {paymentSuccess && (
              <Button onClick={() => refetch()} variant="outline" className="w-full">
                {t("refreshStatus")}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle className="text-base">{t("transactionDetails")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">{t("status")}</span>
                <span className="font-semibold text-gray-900">
                  {statusInfo.badge}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t("amount")}</span>
                <span className="font-semibold text-gray-900">
                  {amount.toFixed(2)} {data.currency.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t("location")}</span>
                <span className="font-semibold text-gray-900">
                  {data.locationName || "N/A"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { t } = useLanguage();
  const [, params] = useRoute("/status/:transactionId");
  const transactionId = params?.transactionId || "";
  const token = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("token") || "";

  if (!transactionId || !token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="py-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900 mb-1">{t("invalidUrl")}</h3>
                <p className="text-sm text-red-700">
                  {t("invalidUrlDesc")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <StatusPageContent transactionId={transactionId} token={token} />;
}
