import { Phone, MessageSquare } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useLanguage } from "@/hooks/use-language";

interface ContactActionsProps {
  phone: string;
  locationName: string;
  compact?: boolean;
}

function cleanPhoneForLink(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}

export function ContactActions({ phone, locationName, compact = false }: ContactActionsProps) {
  const { t } = useLanguage();

  if (!phone) return null;

  const cleanPhone = cleanPhoneForLink(phone);
  const message = t("prefillBorrowMessage").replace("{location}", locationName);
  const encodedMessage = encodeURIComponent(message);

  const telHref = `tel:${cleanPhone}`;
  const smsHref = `sms:${cleanPhone}?body=${encodedMessage}`;
  const whatsappHref = `https://wa.me/${cleanPhone.replace(/^\+/, "")}?text=${encodedMessage}`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const buttonBase = compact
    ? "inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors"
    : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors";

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={handleClick}>
      <a
        href={telHref}
        onClick={handleClick}
        className={`${buttonBase} bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30`}
        title={t("callAction")}
      >
        <Phone className={compact ? "h-3.5 w-3.5" : "h-3.5 w-3.5"} />
        {!compact && <span>{t("callAction")}</span>}
      </a>

      <a
        href={smsHref}
        onClick={handleClick}
        className={`${buttonBase} bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30`}
        title={t("smsAction")}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {!compact && <span>{t("smsAction")}</span>}
      </a>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`${buttonBase} bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30`}
        title={t("whatsappAction")}
      >
        <SiWhatsapp className="h-3.5 w-3.5" />
        {!compact && <span>{t("whatsappAction")}</span>}
      </a>
    </div>
  );
}

export function ContactActionsLight({ phone, locationName }: ContactActionsProps) {
  const { t } = useLanguage();

  if (!phone) return null;

  const cleanPhone = cleanPhoneForLink(phone);
  const message = t("prefillBorrowMessage").replace("{location}", locationName);
  const encodedMessage = encodeURIComponent(message);

  const telHref = `tel:${cleanPhone}`;
  const smsHref = `sms:${cleanPhone}?body=${encodedMessage}`;
  const whatsappHref = `https://wa.me/${cleanPhone.replace(/^\+/, "")}?text=${encodedMessage}`;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const buttonBase = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors";

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={handleClick}>
      <a
        href={telHref}
        onClick={handleClick}
        className={`${buttonBase} bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200`}
        title={t("callAction")}
      >
        <Phone className="h-3.5 w-3.5" />
        <span>{t("callAction")}</span>
      </a>

      <a
        href={smsHref}
        onClick={handleClick}
        className={`${buttonBase} bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200`}
        title={t("smsAction")}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        <span>{t("smsAction")}</span>
      </a>

      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        className={`${buttonBase} bg-green-100 text-green-700 hover:bg-green-200 border border-green-200`}
        title={t("whatsappAction")}
      >
        <SiWhatsapp className="h-3.5 w-3.5" />
        <span>{t("whatsappAction")}</span>
      </a>
    </div>
  );
}
