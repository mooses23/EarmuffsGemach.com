import { SelfDeposit } from "@/components/home/self-deposit";
import { useLanguage } from "@/hooks/use-language";

export default function SelfDepositPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
      <div className="glow-orb-blue top-20 -left-40 animate-float opacity-40"></div>
      <div className="glow-orb-teal top-1/3 -right-32 animate-float-delayed opacity-30"></div>

      <div className="container mx-auto px-3 sm:px-4 md:px-6 py-6 sm:py-8 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4 text-glow">
              {t("selfDepositTitle")}
            </h1>
            <p className="text-base sm:text-lg text-slate-400">
              {t("selfDepositDescription")}
            </p>
          </div>

          <SelfDeposit />
        </div>
      </div>
    </div>
  );
}
