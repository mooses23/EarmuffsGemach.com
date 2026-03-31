import { Link } from "wouter";
import { HierarchicalLocationSearch } from "@/components/locations/hierarchical-location-search";
import { useLanguage } from "@/hooks/use-language";
import heroImage from "@assets/baby_1769929839890.jpg";
import { MapPin, Phone, RotateCcw } from "lucide-react";

export default function Home() {
  const { t } = useLanguage();
  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Ambient Glow Orbs */}
        <div className="glow-orb-blue top-20 -left-40 animate-float opacity-60"></div>
        <div className="glow-orb-teal top-1/3 -right-32 animate-float-delayed opacity-50"></div>
        <div className="glow-orb-accent bottom-1/4 left-1/4 animate-pulse-glow opacity-40"></div>
        
        {/* Dedication Banner */}
        <div className="relative overflow-hidden glass-dedication">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.15),transparent_70%)]"></div>
          </div>
          <div className="relative py-3 px-4 md:px-8 text-center">
            <p className="text-lg md:text-xl font-serif text-amber-200 tracking-wide drop-shadow-sm" dir="rtl">
              לעילוי נשמת מרת רבקה בת ר׳ מרדכי דוד ע"ה
            </p>
          </div>
        </div>

        {/* Hero Section */}
        <div className="relative z-10">
          <div className="container mx-auto px-4 py-10 md:py-20">
            <div className="text-center max-w-4xl mx-auto mb-10 md:mb-14">
              <div className="mb-8">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-slate-800 blur-2xl rounded-full scale-150"></div>
                  <div className="relative w-36 h-36 md:w-48 md:h-48 mx-auto rounded-2xl overflow-hidden" style={{ backgroundColor: '#1e293b' }}>
                    <img 
                      src={heroImage} 
                      alt="Baby with earmuffs" 
                      className="w-full h-full object-contain mix-blend-multiply"
                      style={{ filter: 'brightness(1.1) contrast(1.05)' }}
                    />
                  </div>
                </div>
              </div>
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-5 md:mb-7 leading-tight text-glow">
                {t("findBabyEarmuffsNearYou")}
              </h1>
              <p className="text-lg md:text-xl text-slate-300 mb-8 md:mb-10 max-w-2xl mx-auto leading-relaxed">
                {t("homeHeroDescription")}
              </p>
            </div>

            {/* Location Search Card */}
            <div id="location-search" className="glass-panel-elevated glass-highlight rounded-3xl p-5 md:p-10 max-w-6xl mx-auto">
              <HierarchicalLocationSearch />
            </div>
          </div>
        </div>
        
        {/* How It Works Section */}
        <div className="relative z-10 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12 md:mb-16">
              <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-4 md:mb-5 text-glow">
                {t("howItWorks")}
              </h2>
              <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
                {t("howItWorksDescription")}
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
              <div className="text-center p-7 rounded-2xl glass-card glass-card-hover glass-highlight">
                <div className="glass-icon-blue rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-6">
                  <MapPin className="h-7 w-7 text-blue-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{t("findALocation")}</h3>
                <p className="text-slate-400 leading-relaxed">
                  {t("findLocationDescription")}
                </p>
              </div>
              
              <div className="text-center p-7 rounded-2xl glass-card glass-card-hover glass-highlight">
                <div className="glass-icon-teal rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-6">
                  <Phone className="h-7 w-7 text-teal-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{t("contactAndReserve")}</h3>
                <p className="text-slate-400 leading-relaxed">
                  {t("contactReserveDescription")}
                </p>
              </div>
              
              <div className="text-center p-7 rounded-2xl glass-card glass-card-hover glass-highlight">
                <div className="glass-icon-violet rounded-2xl w-16 h-16 flex items-center justify-center mx-auto mb-6">
                  <RotateCcw className="h-7 w-7 text-violet-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{t("protectAndReturn")}</h3>
                <p className="text-slate-400 leading-relaxed">
                  {t("protectReturnDescription")}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Founder's Story Section */}
        <div className="relative z-10 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              {/* Decorative top line */}
              <div className="flex items-center gap-4 mb-10 md:mb-14">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-amber-500/40"></div>
                <div className="w-2 h-2 rounded-full bg-amber-400/60"></div>
                <div className="w-2 h-2 rounded-full bg-amber-400/40"></div>
                <div className="w-2 h-2 rounded-full bg-amber-400/60"></div>
                <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-500/40 to-amber-500/40"></div>
              </div>

              <div className="relative rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(15,20,35,0.85) 0%, rgba(30,25,15,0.80) 100%)', border: '1px solid rgba(251,191,36,0.15)', boxShadow: '0 0 60px rgba(251,191,36,0.06), inset 0 1px 0 rgba(251,191,36,0.10)' }}>
                {/* Subtle amber glow in background */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.5) 0%, transparent 70%)' }}></div>
                </div>

                <div className="relative px-8 py-12 md:px-14 md:py-16">
                  {/* Quote mark */}
                  <div className="text-amber-400/20 font-serif text-8xl leading-none select-none mb-2 -mt-4 -ml-2">"</div>

                  <div className="space-y-5 -mt-8">
                    <p className="font-serif text-lg md:text-xl text-amber-100/90 leading-relaxed tracking-wide">
                      Started by Rivka <span className="text-amber-300/80 text-sm align-super font-sans">A&quot;H</span>, this organization began with a simple conversation at a wedding about protecting babies' hearing.
                    </p>

                    <p className="font-serif text-lg md:text-xl text-slate-300/80 leading-relaxed tracking-wide">
                      Instead of leaving it as an idea, Rivka took action — starting with just one location.
                    </p>

                    <p className="font-serif text-lg md:text-xl text-slate-300/80 leading-relaxed tracking-wide">
                      Today, the initiative has grown to over <span className="text-amber-200 font-medium">100 locations worldwide</span>, helping families in a meaningful and practical way.
                    </p>

                    <p className="font-serif text-lg md:text-xl text-slate-300/80 leading-relaxed tracking-wide">
                      She accomplished all of this while caring for her special needs child, reflecting her deep commitment to helping Klal Yisroel.
                    </p>

                    <p className="font-serif text-xl md:text-2xl text-amber-200/90 leading-relaxed tracking-wide italic">
                      Her legacy continues to make a difference every day.
                    </p>
                  </div>

                  {/* Closing quote mark */}
                  <div className="text-amber-400/20 font-serif text-8xl leading-none select-none text-right -mb-8 -mr-2 mt-2">"</div>
                </div>
              </div>

              {/* Decorative bottom line */}
              <div className="flex items-center gap-4 mt-10 md:mt-14">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-amber-500/40"></div>
                <div className="w-2 h-2 rounded-full bg-amber-400/60"></div>
                <div className="w-2 h-2 rounded-full bg-amber-400/40"></div>
                <div className="w-2 h-2 rounded-full bg-amber-400/60"></div>
                <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-500/40 to-amber-500/40"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Call to Action */}
        <div className="relative z-10 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="glass-cta glass-highlight rounded-3xl p-10 md:p-16 text-center max-w-4xl mx-auto border border-blue-500/20">
              <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
                <div className="glow-orb-blue w-64 h-64 top-0 right-0 opacity-30"></div>
              </div>
              <h2 className="relative text-2xl md:text-4xl font-bold text-white mb-4 md:mb-6">
                {t("wantToOpenLocation")}
              </h2>
              <p className="relative text-lg md:text-xl text-slate-300 mb-8 md:mb-10 max-w-2xl mx-auto">
                {t("wantToOpenLocationDescription")}
              </p>
              <Link href="/apply">
                <button className="relative btn-glass-accent px-10 py-4 rounded-xl font-semibold text-lg">
                  {t("applyToOpenLocation")}
                </button>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none"></div>
      </div>
    </>
  );
}
