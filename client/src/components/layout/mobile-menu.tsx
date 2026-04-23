import React, { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronUp, LogOut, LayoutDashboard, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";

interface MobileMenuProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export function MobileMenu({ isOpen, setIsOpen }: MobileMenuProps) {
  const { user, isOperator, isAdmin, logoutMutation } = useAuth();
  const { language, toggleLanguage, isHebrew, t } = useLanguage();

  const handleLogout = () => {
    logoutMutation.mutate();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="md:hidden mt-4 pb-4 border-t border-white/10">
      <nav className="flex flex-col space-y-2 pt-4">
        <Link
          href="/"
          onClick={() => setIsOpen(false)}
          className="font-medium text-slate-300 hover:text-white transition-colors py-3 px-3 rounded-xl hover:bg-white/5"
        >
          {t("home")}
        </Link>
        
        <Link
          href="/self-deposit"
          onClick={() => setIsOpen(false)}
          className="font-medium text-slate-300 hover:text-white transition-colors py-3 px-3 rounded-xl hover:bg-white/5"
        >
          {t("selfDeposit")}
        </Link>
        
        <Link
          href="/rules"
          onClick={() => setIsOpen(false)}
          className="font-medium text-slate-300 hover:text-white transition-colors py-3 px-3 rounded-xl hover:bg-white/5"
        >
          {t("ourRules")}
        </Link>
        
        <Link
          href="/apply"
          onClick={() => setIsOpen(false)}
          className="font-medium text-slate-300 hover:text-white transition-colors py-3 px-3 rounded-xl hover:bg-white/5"
        >
          {t("openLocation")}
        </Link>
        
        <Link
          href="/contact"
          onClick={() => setIsOpen(false)}
          className="font-medium text-slate-300 hover:text-white transition-colors py-3 px-3 rounded-xl hover:bg-white/5"
        >
          {t("contact")}
        </Link>
        
        <button
          onClick={toggleLanguage}
          className="font-medium text-slate-300 hover:text-white transition-colors py-3 px-3 rounded-xl hover:bg-white/5 flex items-center gap-2 text-left w-full"
        >
          <Languages className="h-4 w-4" />
          {isHebrew ? t("switchToEnglishMobile") : t("switchToHebrewMobile")}
        </button>
        
        {user ? (
          <div className="pt-4 space-y-2 border-t border-white/10 mt-2">
            {isOperator && !isAdmin && (
              <Link
                href="/operator/dashboard"
                onClick={() => setIsOpen(false)}
                className="btn-glass-outline w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t("operatorDashboard")}
              </Link>
            )}
            
            {isAdmin && (
              <Link
                href="/admin/dashboard"
                onClick={() => setIsOpen(false)}
                className="btn-glass-outline w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t("adminDashboard")}
              </Link>
            )}
            
            <button
              onClick={handleLogout}
              className="w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t("logOut")}
            </button>
          </div>
        ) : (
          <div className="pt-4 border-t border-white/10 mt-2">
            <Link 
              href="/auth" 
              onClick={() => setIsOpen(false)}
              className="btn-glass-primary w-full py-3 px-4 rounded-xl flex items-center justify-center"
            >
              {t("login")}
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
}
