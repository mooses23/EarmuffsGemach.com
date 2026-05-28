import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HierarchicalLocationSearch } from "@/components/locations/hierarchical-location-search";
import { useLanguage } from "@/hooks/use-language";
// Stable URLs from /public — match the <link rel="preload"> in index.html
// so the browser doesn't download a hashed duplicate.
const heroJpg384 = "/img/hero-384.jpg";
const heroJpg640 = "/img/hero-640.jpg";
const heroWebp384 = "/img/hero-384.webp";
const heroWebp640 = "/img/hero-640.webp";
import { MapPin, Phone, RotateCcw, ChevronUp } from "lucide-react";

export default function Home() {
  const { t } = useLanguage();
  const [showStory, setShowStory] = useState(false);

  const { data: heroData } = useQuery<{ url: string | null }>({
    queryKey: ["/api/site/hero-image"],
    staleTime: 60_000,
  });

  const customHeroUrl = heroData?.url ?? null;

  const handleBannerClick = () => {
    if (navigator.vibrate) {
      navigator.vibrate([10, 40, 10]);
    }
    setShowStory((v) => !v);
  };

  const handleCloseStory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.vibrate) {
      navigator.vibrate([10, 40, 10]);
    }
    setShowStory(false);
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden">
        {/* Ambient Glow Orbs */}
        <div className="glow-orb-blue top-20 -left-40 animate-float opacity-60"></div>
        <div className="glow-orb-teal top-1/3 -right-32 animate-float-delayed opacity-50"></div>
        <div className="glow-orb-accent bottom-1/4 left-1/4 animate-pulse-glow opacity-40"></div>

        {/* Dedication Banner — click to reveal the story */}
        <div
          className="relative overflow-hidden glass-dedication cursor-pointer select-none group"
          onClick={handleBannerClick}
          role="button"
          aria-expanded={showStory}
          aria-label={t('tributeAriaLabel')}
        >
          <div className="absolute inset-0 opacity-40">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.15),transparent_70%)]"></div>
          </div>
          {/* Hover shimmer */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.06) 50%, transparent 100%)',
              transition: 'opacity 0.4s ease',
            }}
          ></div>
          <div className="relative py-3 px-4 md:px-8 text-center">
            <p className="text-lg md:text-xl font-serif text-amber-200 tracking-wide drop-shadow-sm" dir="rtl">
              לעילוי נשמת מרת רבקה בת ר׳ מרדכי דוד ע"ה
            </p>
            <p
              className="text-xs text-amber-400/50 mt-0.5 font-sans tracking-widest uppercase"
              style={{ letterSpacing: '0.15em', transition: 'opacity 0.3s ease', opacity: showStory ? 0 : 1 }}
            >
              {t('tapToReadStory')}
            </p>
          </div>
        </div>

        {/* Portrait + story wrapper — portrait sits at z-0, story overlays at z-10 */}
        <div className="relative">
          {/* Portrait — absolute behind story, always rendered */}
          <div
            className="absolute inset-0 flex justify-center items-start pt-3 z-0 pointer-events-none"
            aria-hidden="true"
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                width: '160px',
                aspectRatio: '1/1',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.30)',
                opacity: showStory ? 0.25 : 1,
                transition: 'opacity 0.5s ease',
              }}
            >
              {customHeroUrl ? (
                <img
                  src={customHeroUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ objectPosition: '50% 12%' }}
                  decoding="async"
                />
              ) : (
                <picture>
                  <source
                    type="image/webp"
                    srcSet={`${heroWebp384} 384w, ${heroWebp640} 640w`}
                    sizes="160px"
                  />
                  <img
                    src={heroJpg640}
                    srcSet={`${heroJpg384} 384w, ${heroJpg640} 640w`}
                    sizes="160px"
                    width={640}
                    height={800}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ objectPosition: '50% 12%' }}
                    decoding="async"
                    fetchpriority="high"
                  />
                </picture>
              )}
            </div>
          </div>

          {/* Spacer — gives the container height when story is collapsed so portrait shows */}
          <div
            className="transition-all duration-500 ease-out"
            style={{ height: showStory ? 0 : '185px' }}
          />

          {/* Founder's Story — z-10, overlays portrait when open */}
          <div
            className={`relative z-10 overflow-hidden transition-all ease-out ${
              showStory
                ? 'max-h-[3000px] opacity-100 duration-700'
                : 'max-h-0 opacity-0 duration-500 pointer-events-none'
            }`}
            aria-hidden={!showStory}
          >
            <div className="container mx-auto px-4 pt-6 pb-2">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-amber-500/30"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400/50"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400/30"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400/50"></div>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-500/30 to-amber-500/30"></div>
                  </div>

                  <div
                    className="relative rounded-2xl overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(15,20,35,0.80) 0%, rgba(30,25,15,0.75) 100%)',
                      border: '1px solid rgba(251,191,36,0.12)',
                      boxShadow: '0 0 40px rgba(251,191,36,0.05), inset 0 1px 0 rgba(251,191,36,0.08)',
                    }}
                  >
                    <div className="absolute inset-0 pointer-events-none">
                      <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-28 rounded-full opacity-8"
                        style={{ background: 'radial-gradient(ellipse, rgba(251,191,36,0.3) 0%, transparent 70%)' }}
                      ></div>
                    </div>

                    <div className="relative px-6 py-6 md:px-10 md:py-8 space-y-3">
                      <p className="font-serif text-sm md:text-base text-amber-100/90 leading-relaxed tracking-wide" data-testid="text-tribute-para-1">
                        {t('tributePara1Lead')}{t('tributeFounderName')} <span className="text-amber-300/80 text-xs align-super font-sans">{t('tributeFounderHonor')}</span>{t('tributePara1Tail')}
                      </p>
                      <p className="font-serif text-sm md:text-base text-slate-300/75 leading-relaxed tracking-wide" data-testid="text-tribute-para-2">
                        {t('tributePara2')}
                      </p>
                      <p className="font-serif text-sm md:text-base text-slate-300/75 leading-relaxed tracking-wide" data-testid="text-tribute-para-3">
                        {t('tributePara3')}
                      </p>
                      <p className="font-serif text-sm md:text-base text-amber-200/80 leading-relaxed tracking-wide italic" data-testid="text-tribute-para-4">
                        {t('tributePara4')}
                      </p>

                      {/* Golden collapse affordance — subtle, native feel */}
                      <div className="pt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={handleCloseStory}
                          aria-label={t('close') || 'Collapse'}
                          tabIndex={showStory ? 0 : -1}
                          disabled={!showStory}
                          className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-amber-300/70 hover:text-amber-200 active:text-amber-100 active:scale-95 transition-all duration-300 ease-out disabled:opacity-0"
                          style={{
                            background: 'linear-gradient(180deg, rgba(251,191,36,0.06) 0%, rgba(251,191,36,0.02) 100%)',
                            border: '1px solid rgba(251,191,36,0.15)',
                            boxShadow: 'inset 0 1px 0 rgba(251,191,36,0.08)',
                          }}
                          data-testid="button-close-tribute"
                        >
                          <ChevronUp className="w-3.5 h-3.5 transition-transform duration-300 group-hover:-translate-y-0.5" />
                          <span className="text-[10px] font-sans tracking-[0.15em] uppercase">
                            {t('collapse') || 'Collapse'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-5">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-amber-500/30"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400/50"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400/30"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400/50"></div>
                    <div className="flex-1 h-px bg-gradient-to-l from-transparent via-amber-500/30 to-amber-500/30"></div>
                  </div>
                </div>
              </div>
          </div>
        </div>

        {/* Hero Section — headline + search card */}
        <div className="relative z-10">
          <div className="container mx-auto px-4 pt-8 md:pt-12 pb-10 md:pb-20">
            <div className="text-center max-w-4xl mx-auto mb-10 md:mb-14">
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
