import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  CreditCard,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

// Form validation schema
const setupIntentFormSchema = z.object({
  borrowerName: z
    .string()
    .min(1, "Name is required")
    .min(2, "Name must be at least 2 characters"),
  borrowerEmail: z
    .string()
    .email("Please enter a valid email address")
    .optional()
    .or(z.literal("")),
  borrowerPhone: z
    .string()
    .regex(/^\d{10,}$/, "Please enter a valid phone number (at least 10 digits)")
    .optional()
    .or(z.literal("")),
  // Task #39: Borrower MUST tick the consent box before we send the card to
  // Stripe. We capture both the boolean and the exact text shown to them.
  consentAgreed: z
    .boolean()
    .refine((v) => v === true, {
      message: "You must agree to the authorization above before saving your card",
    }),
});

interface PublicLocationInfo {
  id: number;
  name: string;
  depositAmount: number;
}

interface FeeQuote {
  depositCents: number;
  feeCents: number;
  totalCents: number;
  locationName?: string;
  consentText?: string;
}

type SetupIntentFormValues = z.infer<typeof setupIntentFormSchema>;

interface SetupIntentFormProps {
  locationId: number;
  onSuccess?: (statusUrl: string) => void;
  onError?: (error: string) => void;
}

function SetupIntentFormInner({
  locationId,
  onSuccess,
  onError,
}: SetupIntentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const { language } = useLanguage();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successUrl, setSuccessUrl] = useState("");

  const [locationInfo, setLocationInfo] = useState<PublicLocationInfo | null>(null);
  const [feeQuote, setFeeQuote] = useState<FeeQuote | null>(null);

  // Fetch location info and server-authoritative fee quote together.
  // Re-fetch when language changes so the consent text is in the right language.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/locations/${locationId}`);
        if (!r.ok) return;
        const loc = await r.json();
        if (cancelled) return;
        const locInfo: PublicLocationInfo = {
          id: loc.id,
          name: loc.name,
          depositAmount: loc.depositAmount ?? 20,
        };
        setLocationInfo(locInfo);
        const depositCentsLocal = (locInfo.depositAmount) * 100;
        const qr = await fetch(
          `/api/deposits/fee-quote?locationId=${locationId}&depositCents=${depositCentsLocal}&locale=${language}`
        );
        if (!qr.ok || cancelled) return;
        const quote: FeeQuote = await qr.json();
        if (!cancelled) setFeeQuote(quote);
      } catch (e) {
        console.warn("Failed to load location/fee info:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [locationId, language]);

  const depositCents = (locationInfo?.depositAmount ?? 20) * 100;
  const maxChargeCents = feeQuote?.totalCents ?? (depositCents + 90); // fallback: 3% + $0.30 on $20
  // The server always returns consentText in the fee-quote response (Task #53).
  // If it is unexpectedly absent while the quote is still loading, show a
  // generic placeholder so the submit button stays disabled until the real text arrives.
  const consentText = feeQuote?.consentText ?? "Loading authorization text…";

  const form = useForm<SetupIntentFormValues>({
    resolver: zodResolver(setupIntentFormSchema),
    defaultValues: {
      borrowerName: "",
      borrowerEmail: "",
      borrowerPhone: "",
      consentAgreed: false,
    },
  });

  // Handle successful setup intent and redirect
  useEffect(() => {
    if (showSuccess && successUrl) {
      const timer = setTimeout(() => {
        window.location.href = successUrl;
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess, successUrl]);

  const onSubmit = async (values: SetupIntentFormValues) => {
    if (!stripe || !elements) {
      toast({
        title: "Error",
        description: "Stripe is not loaded. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Call API to create SetupIntent
      const response = await apiRequest(
        "POST",
        "/api/deposits/setup-intent",
        {
          locationId,
          borrowerName: values.borrowerName,
          borrowerEmail: values.borrowerEmail || undefined,
          borrowerPhone: values.borrowerPhone || undefined,
          // Task #39: send the EXACT consent text the borrower saw + agreed to.
          consentText,
          consentMaxChargeCents: maxChargeCents,
        }
      );

      const data = await response.json();
      const { clientSecret, publicStatusUrl } = data;

      if (!clientSecret) {
        throw new Error("Failed to create setup intent");
      }

      // Step 2: Confirm the SetupIntent with Stripe
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card element not found");
      }

      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: values.borrowerName,
            email: values.borrowerEmail || undefined,
            phone: values.borrowerPhone || undefined,
          },
        },
      });

      if (result.error) {
        const errorMessage = result.error.message || "Card setup failed";
        toast({
          title: "Card Setup Failed",
          description: errorMessage,
          variant: "destructive",
        });
        onError?.(errorMessage);
        setIsProcessing(false);
        return;
      }

      // Step 3: Confirm the setup with backend (updates status immediately without waiting for webhook)
      if (result.setupIntent?.id) {
        try {
          await apiRequest("POST", "/api/deposits/confirm-setup", {
            setupIntentId: result.setupIntent.id,
          });
        } catch (confirmError) {
          console.warn("Backend confirmation failed, webhook will handle status update:", confirmError);
        }
      }

      // Step 4: Success - show success state and prepare redirect
      setSuccessUrl(publicStatusUrl);
      setShowSuccess(true);
      toast({
        title: "Card Setup Successful!",
        description: "Your card has been verified. Redirecting to status page...",
      });
      onSuccess?.(publicStatusUrl);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      onError?.(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  // While the fee-quote (and therefore consent text) is still loading,
  // show a skeleton placeholder so the borrower sees a proper loading state
  // instead of an abrupt form with placeholder text.
  if (!feeQuote) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Card Setup for Pay Later
          </CardTitle>
          <CardDescription>
            Enter your details and card information to set up your card for
            payment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Name field skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          </div>
          {/* Email field skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-36 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-3 w-56 rounded bg-muted animate-pulse" />
          </div>
          {/* Phone field skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
            <div className="h-3 w-64 rounded bg-muted animate-pulse" />
          </div>
          {/* Card element skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-muted animate-pulse" />
            <div className="h-12 w-full rounded-md bg-muted animate-pulse" />
          </div>
          {/* Alert skeleton */}
          <div className="h-16 w-full rounded-md bg-muted animate-pulse" />
          {/* Consent block skeleton */}
          <div className="h-28 w-full rounded-md bg-muted animate-pulse" />
          {/* Submit button skeleton */}
          <div className="h-11 w-full rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (showSuccess) {
    return (
      <Card className="w-full max-w-md border-green-200 bg-green-50">
        <CardContent className="py-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-green-800 mb-2">
            Card Setup Successful!
          </h3>
          <p className="text-green-700 mb-4">
            Your card has been verified and saved. We're redirecting you to your
            status page...
          </p>
          <Button variant="outline" asChild className="mt-4">
            <a href={successUrl}>
              Go to Status Page
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Card Setup for Pay Later
        </CardTitle>
        <CardDescription>
          Enter your details and card information to set up your card for
          payment
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Borrower Name */}
            <FormField
              control={form.control}
              name="borrowerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      {...field}
                      disabled={isProcessing}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Borrower Email */}
            <FormField
              control={form.control}
              name="borrowerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                      disabled={isProcessing}
                    />
                  </FormControl>
                  <FormDescription>
                    We'll send payment confirmation to this email
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Borrower Phone */}
            <FormField
              control={form.control}
              name="borrowerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="1234567890"
                      {...field}
                      disabled={isProcessing}
                    />
                  </FormControl>
                  <FormDescription>
                    At least 10 digits with no special characters
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Card Element */}
            <div>
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block">
                Card Details *
              </label>
              <div
                className={`p-3 border border-input rounded-md bg-background ${
                  isProcessing ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <CardElement
                  options={{
                    disabled: isProcessing,
                    style: {
                      base: {
                        fontSize: "16px",
                        color: "#424770",
                        "::placeholder": {
                          color: "#aab7c4",
                        },
                      },
                      invalid: {
                        color: "#fa755a",
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Security Notice */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your card information is securely processed by Stripe. Your card
                will only be charged if you do not return the borrowed item.
              </AlertDescription>
            </Alert>

            {/* Task #39: Explicit borrower consent block. The exact text below
                is what we persist on the transaction and replay back to Stripe
                in any dispute response. */}
            <FormField
              control={form.control}
              name="consentAgreed"
              render={({ field }) => (
                <FormItem className="rounded-md border-2 border-amber-300 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 cursor-pointer accent-amber-600"
                        checked={!!field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        disabled={isProcessing}
                        data-testid="checkbox-consent"
                      />
                    </FormControl>
                    <div className="flex-1 space-y-2">
                      <FormLabel className="text-sm font-semibold leading-tight cursor-pointer">
                        I agree to the following authorization:
                      </FormLabel>
                      <p className="text-sm text-amber-900 leading-relaxed">
                        {consentText}
                      </p>
                      <p className="text-xs text-amber-800">
                        You will receive a heads-up notification before any
                        charge is run.
                      </p>
                      <FormMessage />
                    </div>
                  </div>
                </FormItem>
              )}
            />

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!stripe || isProcessing || !form.watch("consentAgreed") || !feeQuote?.consentText}
              className="w-full"
              size="lg"
              data-testid="button-submit-card"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying Card...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Save Card
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

interface SetupIntentFormWrapperProps {
  locationId: number;
  onSuccess?: (statusUrl: string) => void;
  onError?: (error: string) => void;
}

export function SetupIntentForm({
  locationId,
  onSuccess,
  onError,
}: SetupIntentFormWrapperProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(
    null
  );
  const { toast } = useToast();

  useEffect(() => {
    // Load publishable key from environment or API
    const loadStripeKey = async () => {
      try {
        let publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

        // If not in env, fetch from API
        if (!publishableKey) {
          const response = await fetch("/api/stripe/publishable-key");
          if (response.ok) {
            const data = await response.json();
            publishableKey = data.publishableKey;
          }
        }

        if (!publishableKey) {
          throw new Error("Stripe publishable key not found");
        }

        setStripePromise(loadStripe(publishableKey));
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load payment processor. Please refresh the page.",
          variant: "destructive",
        });
        console.error("Failed to load Stripe:", error);
      }
    };

    loadStripeKey();
  }, [toast]);

  if (!stripePromise) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading payment form...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <SetupIntentFormInner
        locationId={locationId}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
