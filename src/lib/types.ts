// Shared domain types. Kept free of Node imports so client components can use them.

export type AdPlatform = "facebook" | "instagram" | "tiktok" | "snapchat" | "google" | "other";
export type CampaignObjective = "orders" | "installs" | "messages" | "leads" | "awareness";
export type CampaignStatus = "active" | "paused" | "stopped";
export type Currency = "IQD" | "USD";

export interface Campaign {
  id: string;
  name: string;
  platform: AdPlatform;
  objective: CampaignObjective;
  status: CampaignStatus;
  dailyBudget: number;
  /** Overrides the objective-level target cost per result from settings. */
  targetCpr: number | null;
  notes: string;
  createdAt: string;
}

export interface DailyMetric {
  campaignId: string;
  /** YYYY-MM-DD */
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  revenue: number;
}

export type Channel = "whatsapp" | "facebook" | "instagram" | "other";
export type MessageStatus = "new" | "drafted" | "replied" | "follow_up";
export type Intent =
  | "order"
  | "price"
  | "tracking"
  | "complaint"
  | "merchant"
  | "driver_job"
  | "app_support"
  | "other";
export type Urgency = "high" | "normal" | "low";

export interface InboxMessage {
  id: string;
  channel: Channel;
  customerName: string;
  /** Phone number (WhatsApp) or platform user id. */
  customerHandle: string;
  text: string;
  receivedAt: string;
  status: MessageStatus;
  intent: Intent | null;
  urgency: Urgency | null;
  draft: string;
  altDraft: string;
  internalNote: string;
  source: "manual" | "webhook";
  externalId: string | null;
}

export type PostPlatform = "facebook" | "instagram" | "tiktok" | "whatsapp_status";
export type PostType = "offer" | "service" | "hiring" | "tips" | "engagement" | "occasion" | "app";
export type PostStatus = "draft" | "ready" | "published";

export interface Post {
  id: string;
  platform: PostPlatform;
  type: PostType;
  topic: string;
  caption: string;
  hashtags: string[];
  imageIdea: string;
  bestTime: string;
  scheduledFor: string | null;
  status: PostStatus;
  createdAt: string;
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface CompanyProfile {
  name: string;
  cities: string;
  services: string;
  pricing: string;
  hours: string;
  phone: string;
  appName: string;
  appLink: string;
  tone: string;
  extraInfo: string;
}

export type AiProvider = "local" | "claude";

export interface AiSettings {
  provider: AiProvider;
  localBaseUrl: string;
  localModel: string;
  claudeModel: string;
}

export interface CampaignRules {
  currency: Currency;
  /** Days in the evaluation window (compared against the window before it). */
  windowDays: number;
  targetCpr: Record<CampaignObjective, number>;
  /** Minimum spend before judging = target CPR × this multiplier. */
  minSpendMultiplier: number;
  /** CPR above target × stopRatio ⇒ stop. */
  stopRatio: number;
  /** CPR at or below target × scaleRatio (with enough results) ⇒ scale. */
  scaleRatio: number;
  minResultsToScale: number;
  /** CTR below this percentage ⇒ weak creative warning. */
  minCtr: number;
}

export interface Settings {
  company: CompanyProfile;
  faq: FaqItem[];
  ai: AiSettings;
  rules: CampaignRules;
}

export type Decision = "stop" | "watch" | "keep" | "scale";

export interface CampaignAnalysisResult {
  summary: string;
  campaigns: { id: string; decision: Decision; reason: string; nextSteps: string[] }[];
  budgetAdvice: string;
}

export interface SavedAnalysis {
  createdAt: string;
  provider: AiProvider;
  result: CampaignAnalysisResult;
}

export interface Database {
  version: 1;
  settings: Settings;
  campaigns: Campaign[];
  metrics: DailyMetric[];
  messages: InboxMessage[];
  posts: Post[];
  /** Most recent AI review of the campaigns, shown until the next run. */
  analysis: SavedAnalysis | null;
}

// ---------- Campaign evaluation ----------

export type Signal = "stop" | "watch" | "keep" | "scale" | "learning" | "no_data" | "inactive";

export interface Totals {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  revenue: number;
  /** Percentage, e.g. 1.25 means 1.25% */
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpr: number | null;
  roas: number | null;
  days: number;
}

export interface CampaignEvaluation {
  campaignId: string;
  signal: Signal;
  reasons: string[];
  action: string;
  target: number;
  windowStart: string | null;
  windowEnd: string | null;
  recent: Totals;
  previous: Totals;
  /** Percent change in CPR vs previous window (positive = worse). */
  cprChange: number | null;
}
