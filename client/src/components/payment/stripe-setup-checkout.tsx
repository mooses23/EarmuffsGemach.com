import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CreditCard, CheckCircle, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const OPERATOR_DASHBOARD_URL = "/operator/dashboard";

interface FeeBreakdown {
  depositCents: number;
  feeCents: number;
  totalCents: number;
}

function buildConsentText(gemachName: string, totalCents: number, currency: string) {
  const symbol = currency.toUpperCase() === "USD" ? "$" : `${currency.toUpperCase()} `;
  const total = (totalCents / 100).toFixed(2);
  return `By saving this card, I authorize ${gemachName} to charge up to ${symbol}${total} (deposit + processing fee) if I do not return the borrowed item.`;
}

interface StripeSetupCheckoutFormProps {
  clientSecret: string;
  gemachName: string;
  maxChargeAmount: number;
  currency: string;
  feeBreakdown?: FeeBreakdown;
  onSuccess: () => void;
  onError: (error: string) => void;
}

function StripeSetupCheckoutForm({
  clientSecret,
  gemachName,
  maxChargeAmount,
  currency,
  feeBreakdown,
  onSuccess,
  onError,
}: StripeSetupCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [consentChecked, setConsentChecked] = useState(false);
  const { toast } = useToast();

  const totalCents = feeBreakdown?.totalCents ?? Math.round(maxChargeAmount * 100);
  const consentText = buildConsentText(gemachName, totalCents, currency);
  const consentMaxChargeCents = totalCents;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (!consentChecked) return;

    setIsProcessing(true);
    setSetupStatus('processing');

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.origin + OPERATOR_DASHBOARD_URL,
      },
      redirect: 'if_required',
    });

    if (error) {
      setSetupStatus('error');
      toast({
        title: "Card Setup Failed",
        description: error.message || "An error occurred during card setup",
        variant: "destructive",
      });
      onError(error.message || "Card setup failed");
      setIsProcessing(false);
    } else if (setupIntent && setupIntent.status === 'succeeded') {
      if (setupIntent.id) {
        try {
          await apiRequest("POST", "/api/deposits/confirm-setup", {
            setupIntentId: setupIntent.id,
            // Task #39: persist consent alongside setup-intent confirmation so
            // PayLaterService.chargeTransaction's consent guard doesn't block
            // future off-session charges initiated from this on-site flow.
            consentText,
            consentMaxChargeCents,
          });
        } catch (confirmError) {
          console.warn("Backend confirmation failed, webhook will handle status update:", confirmError);
        }
      }

      setSetupStatus('success');
      toast({
        title: "Card Setup Successful",
        description: "Your card has been saved securely.",
      });
      onSuccess();
    } else {
      setSetupStatus('error');
      toast({
        title: "Card Setup Status Unknown",
        description: "Please contact support if the issue persists.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  if (setupStatus === 'success') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-green-800 mb-2">Card Saved Successfully!</h3>
          <p className="text-green-700">
            The card has been saved securely and the headband has been lent.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <PaymentElement />

          <div
            data-testid="block-consent"
            className="rounded-lg border border-amber-300 bg-amber-50 p-4"
          >
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-3 flex-1">
                {feeBreakdown && (
                  <div className="text-xs text-amber-800 bg-amber-100 rounded p-2 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Deposit</span>
                      <span>${(feeBreakdown.depositCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Processing fee</span>
                      <span>${(feeBreakdown.feeCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t border-amber-300 pt-0.5 mt-0.5">
                      <span>Max charge</span>
                      <span>${(feeBreakdown.totalCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <p className="text-sm text-amber-900 font-medium leading-relaxed">
                  {consentText}
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    data-testid="checkbox-consent"
                    checked={consentChecked}
                    onCheckedChange={(v) => setConsentChecked(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-amber-900">
                    I understand and agree.
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              data-testid="button-submit-card"
              type="submit"
              disabled={!stripe || isProcessing || !consentChecked}
              className="w-full"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving Card...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Save Card &amp; Lend Headband
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Your card will be saved securely. You won&apos;t be charged until the operator approves the charge when you return the headband.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

interface StripeSetupCheckoutProps {
  clientSecret: string;
  publishableKey: string;
  gemachName: string;
  maxChargeAmount: number;
  currency?: string;
  feeBreakdown?: FeeBreakdown;
  onSuccess: () => void;
  onError: (error: string) => void;
}

export default function StripeSetupCheckout({
  clientSecret,
  publishableKey,
  gemachName,
  maxChargeAmount,
  currency = "usd",
  feeBreakdown,
  onSuccess,
  onError,
}: StripeSetupCheckoutProps) {
  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <StripeSetupCheckoutForm
        clientSecret={clientSecret}
        gemachName={gemachName}
        maxChargeAmount={maxChargeAmount}
        currency={currency}
        feeBreakdown={feeBreakdown}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  );
}
