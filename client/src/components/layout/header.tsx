import React, { useState, createContext, useContext } from "react";
import { Link, useLocation } from "wouter";
import { ChevronDown, User, LogOut, LayoutDashboard, Languages, Menu, X } from "lucide-react";
const logoJpg80 = "/img/logo-80.jpg";
const logoJpg160 = "/img/logo-160.jpg";
const logoWebp80 = "/img/logo-80.webp";
const logoWebp160 = "/img/logo-160.webp";
import { MobileMenu } from "./mobile-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [location] = useLocation();
  const { user, isLoading, logoutMutation, isOperator, isAdmin } = useAuth();
  const { language, toggleLanguage, isHebrew, t } = useLanguage();

  const isActiveLink = (path: string) => {
    if (path === "/" && location === "/") return true;
    if (path !== "/" && location.startsWith(path)) return true;
    return false;
  };
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <header className="glass-panel sticky top-0 z-50 border-b border-white/10">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 md:space-x-3 ml-2 md:ml-8">
            <Link href="/" className="flex items-center space-x-2 md:space-x-3">
              <div className="glass-icon-blue rounded-full p-1.5 md:p-2">
                <picture>
                  <source
                    type="image/webp"
                    srcSet={`${logoWebp80} 1x, ${logoWebp160} 2x`}
                  />
                  <img
                    src={logoJpg80}
                    srcSet={`${logoJpg80} 1x, ${logoJpg160} 2x`}
                    width={40}
                    height={40}
                    alt={t("earmuffsGemach")}
                    className="h-8 w-8 md:h-10 md:w-10 rounded-full object-cover"
                    decoding="async"
                    fetchpriority="high"
                  />
                </picture>
              </div>
              <h1 className="text-lg md:text-2xl font-bold text-white hidden sm:block">
                {t("earmuffsGemach")}
              </h1>
              <h1 className="text-sm font-bold text-white sm:hidden">
                {t("earmuffsGemach")}
              </h1>
            </Link>
          </div>

          <div className="flex justify-end items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden text-slate-300 hover:text-white focus:outline-none p-2 rounded-lg glass-panel"
              aria-label="Toggle mobile menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>

            <nav className="hidden md:flex space-x-6 items-center">
              <Link
                href="/"
                className={`font-medium transition-colors ${
                  isActiveLink("/")
                    ? "text-blue-400"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("home")}
              </Link>
              
              <Link
                href="/self-deposit"
                className={`font-medium transition-colors ${
                  isActiveLink("/self-deposit")
                    ? "text-blue-400"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("selfDeposit")}
              </Link>
              
              <Link
                href="/rules"
                className={`font-medium transition-colors ${
                  isActiveLink("/rules")
                    ? "text-blue-400"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("ourRules")}
              </Link>
              
              <Link
                href="/apply"
                className={`font-medium transition-colors ${
                  isActiveLink("/apply")
                    ? "text-blue-400"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("openLocation")}
              </Link>
              
              <Link
                href="/contact"
                className={`font-medium transition-colors ${
                  isActiveLink("/contact")
                    ? "text-blue-400"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t("contact")}
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="btn-glass-outline px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm">
                    <Languages className="h-4 w-4" />
                    <span className="font-medium">
                      {isHebrew ? "עברית" : "EN"}
                    </span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="glass-panel border-white/20">
                  <DropdownMenuItem 
                    onClick={toggleLanguage}
                    className="flex items-center gap-2 text-slate-200 hover:text-white focus:text-white"
                  >
                    <Languages className="h-4 w-4" />
                    {isHebrew ? "English" : "עברית"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {isLoading ? (
                <div className="w-8 h-8" />
              ) : user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="btn-glass-outline px-4 py-2 rounded-lg flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {user.firstName}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="glass-panel border-white/20">
                      {isOperator && !isAdmin && (
                        <DropdownMenuItem asChild>
                          <Link href="/operator/dashboard" className="flex items-center gap-2 w-full text-slate-200 hover:text-white">
                            <LayoutDashboard className="h-4 w-4" />
                            {t("operatorDashboard")}
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {isAdmin && (
                        <DropdownMenuItem asChild>
                          <Link href="/admin/dashboard" className="flex items-center gap-2 w-full text-slate-200 hover:text-white">
                            <LayoutDashboard className="h-4 w-4" />
                            {t("adminDashboard")}
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem onClick={handleLogout} className="flex items-center gap-2 text-red-400 hover:text-red-300">
                        <LogOut className="h-4 w-4" />
                        {t("logOut")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Link href="/auth">
                    <button className="btn-glass-primary px-4 py-2 rounded-lg text-sm font-medium">
                      {t("operatorPin")} / {t("adminLogin")}
                    </button>
                  </Link>
                )}
            </nav>
          </div>
        </div>

        <MobileMenu isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />
      </div>
    </header>
  );
}
