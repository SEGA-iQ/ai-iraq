// Minimal CSV parsing plus header matching for ad-manager exports.

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  // Excel in Arabic locales often saves with semicolons or tabs.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type MetricColumn = "campaign" | "date" | "spend" | "impressions" | "clicks" | "results" | "revenue";

// Names are matched after lowercasing and trimming. A header matches when it
// equals an alias or starts with one (e.g. "amount spent (iqd)").
const ALIASES: Record<MetricColumn, string[]> = {
  campaign: ["campaign name", "campaign", "اسم الحملة", "الحملة", "ad set name"],
  date: ["date", "day", "reporting starts", "التاريخ", "اليوم", "بدء إعداد التقارير", "بداية التقرير"],
  spend: ["amount spent", "spend", "cost", "المبلغ الذي تم إنفاقه", "المبلغ المنفق", "الصرف", "المصروف", "التكلفة"],
  impressions: ["impressions", "مرات الظهور", "الظهور"],
  clicks: ["link clicks", "clicks (all)", "clicks", "نقرات على الرابط", "النقرات"],
  results: ["results", "conversions", "purchases", "النتائج", "التحويلات"],
  revenue: ["purchase conversion value", "purchases conversion value", "revenue", "الإيرادات", "المبيعات"],
};

export function mapHeaders(headers: string[]): Partial<Record<MetricColumn, number>> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const map: Partial<Record<MetricColumn, number>> = {};
  for (const col of Object.keys(ALIASES) as MetricColumn[]) {
    for (const alias of ALIASES[col]) {
      const idx = norm.findIndex((h, i) => (h === alias || h.startsWith(alias)) && !Object.values(map).includes(i));
      if (idx !== -1) {
        map[col] = idx;
        break;
      }
    }
  }
  return map;
}

/** Accepts 1,234.5 / 1234,5 / ١٢٣٤ and currency symbols. */
export function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[^\d.,-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{3}(\D|$)/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Normalises common date shapes to YYYY-MM-DD, or returns null. */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    // Ambiguous day/month: assume day-first (Iraqi convention) unless impossible.
    let [day, month] = [Number(m[1]), Number(m[2])];
    if (month > 12 && day <= 12) [day, month] = [month, day];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}
