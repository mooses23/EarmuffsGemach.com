import { useEffect } from "react";
import { ContactForm } from "@/components/contact/contact-form";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Clock, Info } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";

export default function Contact() {
  const { t } = useLanguage();

  useEffect(() => {
    document.title = "Contact Baby Banz Earmuffs Gemach | Get In Touch";
  }, []);

  return (
    <>
      <section className="py-12 sm:py-16 bg-primary/10">
        <div className="container mx-auto px-3 sm:px-4 md:px-6">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-3xl font-bold text-neutral-800 mb-3 sm:mb-4">{t("contactUs")}</h1>
            <p className="text-sm sm:text-base md:text-lg text-neutral-600 max-w-3xl mx-auto">
              {t("contactDescription")}
            </p>
          </div>
          
          <div className="max-w-3xl mx-auto px-3 sm:px-0">
            <div className="mb-6 sm:mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 sm:p-5 flex gap-3" data-testid="contact-admin-notice">
              <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm sm:text-base text-amber-900">
                <p className="font-semibold mb-1">{t("contactGoesToAdminTitle")}</p>
                <p className="mb-2">{t("contactGoesToAdminBody")}</p>
                <Link href="/locations" className="font-medium underline hover:no-underline">
                  {t("findYourLocation")} →
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {/* Email */}
              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="mb-3 sm:mb-4 text-primary text-2xl sm:text-3xl">
                    <Mail className="h-8 w-8 mx-auto" />
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-2">{t("emailUs")}</h3>
                  <p className="text-xs sm:text-sm md:text-base text-neutral-600">
                    <a href="mailto:earmuffsgemach@gmail.com" className="hover:text-primary transition-colors">earmuffsgemach@gmail.com</a>
                  </p>
                </CardContent>
              </Card>
              
              {/* Hours */}
              <Card className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-4 sm:pt-6">
                  <div className="mb-3 sm:mb-4 text-primary text-2xl sm:text-3xl">
                    <Clock className="h-8 w-8 mx-auto" />
                  </div>
                  <h3 className="text-base sm:text-lg md:text-xl font-semibold mb-2">{t("responseHours")}</h3>
                  <p className="text-xs sm:text-sm md:text-base text-neutral-600">
                    {t("responseHoursDescription")}
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
                <h3 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6">{t("sendUsMessage")}</h3>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
