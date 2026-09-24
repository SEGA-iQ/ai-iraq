// Client-safe formatting helpers.

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (min < 1) return "هسه";
  if (min < 60) return rtf.format(-min, "minute");
  const hours = Math.round(min / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  return new Date(iso).toLocaleDateString("ar-IQ");
}

/**
 * Turn an Iraqi phone number into the international digits wa.me expects.
 * 07701234567 → 9647701234567. Returns null when it doesn't look like a phone.
 */
export function waNumber(raw: string): string | null {
  let d = raw.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("07")) d = `964${d.slice(1)}`;
  else if (d.length === 10 && d.startsWith("7")) d = `964${d}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
