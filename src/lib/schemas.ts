// Request body schemas shared by API routes.
import { z } from "zod";

const money = z.coerce.number().min(0).max(1e12);
const count = z.coerce.number().int().min(0).max(1e12);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ لازم يكون YYYY-MM-DD");

export const CampaignInput = z.object({
  name: z.string().trim().min(1).max(200),
  platform: z.enum(["facebook", "instagram", "tiktok", "snapchat", "google", "other"]),
  objective: z.enum(["orders", "installs", "messages", "leads", "awareness"]),
  status: z.enum(["active", "paused", "stopped"]).default("active"),
  dailyBudget: money.default(0),
  targetCpr: money.nullable().default(null),
  notes: z.string().max(2000).default(""),
});
export const CampaignPatch = CampaignInput.partial();

export const MetricInput = z.object({
  date: isoDate,
  spend: money,
  impressions: count.default(0),
  clicks: count.default(0),
  results: count.default(0),
  revenue: money.default(0),
});

export const ImportInput = z.object({
  csv: z.string().min(1).max(5_000_000),
  platform: z.enum(["facebook", "instagram", "tiktok", "snapchat", "google", "other"]).default("facebook"),
  objective: z.enum(["orders", "installs", "messages", "leads", "awareness"]).default("orders"),
  /** Used when the file has no campaign column. */
  campaignId: z.string().optional(),
});

export const MessageInput = z.object({
  channel: z.enum(["whatsapp", "facebook", "instagram", "other"]),
  customerName: z.string().max(200).default(""),
  customerHandle: z.string().max(200).default(""),
  text: z.string().trim().min(1).max(10000),
});
export const MessagePatch = z.object({
  status: z.enum(["new", "drafted", "replied", "follow_up"]).optional(),
  draft: z.string().max(10000).optional(),
  altDraft: z.string().max(10000).optional(),
  internalNote: z.string().max(2000).optional(),
  customerName: z.string().max(200).optional(),
  customerHandle: z.string().max(200).optional(),
});
export const DraftInput = z.object({ instruction: z.string().max(1000).optional() });

const postPlatform = z.enum(["facebook", "instagram", "tiktok", "whatsapp_status"]);
const postType = z.enum(["offer", "service", "hiring", "tips", "engagement", "occasion", "app"]);
const dialect = z.enum(["iraqi", "msa"]).default("iraqi");

export const PostGenerateInput = z.object({
  platform: postPlatform,
  type: postType,
  topic: z.string().max(3000).default(""),
  dialect,
});
export const PlanInput = z.object({
  days: z.coerce.number().int().min(1).max(14).default(7),
  platforms: z.array(postPlatform).min(1),
  goals: z.string().max(3000).default(""),
  dialect,
  startDate: isoDate,
});
export const PostInput = z.object({
  platform: postPlatform,
  type: postType,
  topic: z.string().max(3000).default(""),
  caption: z.string().min(1).max(10000),
  hashtags: z.array(z.string().max(100)).max(30).default([]),
  imageIdea: z.string().max(3000).default(""),
  bestTime: z.string().max(500).default(""),
  scheduledFor: isoDate.nullable().default(null),
  status: z.enum(["draft", "ready", "published"]).default("draft"),
});
export const PostPatch = PostInput.partial();

export const SettingsInput = z.object({
  company: z
    .object({
      name: z.string().max(200),
      cities: z.string().max(2000),
      services: z.string().max(5000),
      pricing: z.string().max(5000),
      hours: z.string().max(500),
      phone: z.string().max(100),
      appName: z.string().max(200),
      appLink: z.string().max(500),
      tone: z.string().max(500),
      extraInfo: z.string().max(10000),
    })
    .partial()
    .optional(),
  faq: z
    .array(z.object({ q: z.string().max(1000), a: z.string().max(5000) }))
    .max(200)
    .optional(),
  ai: z
    .object({
      provider: z.enum(["local", "claude"]),
      localBaseUrl: z.string().trim().url().max(500),
      localModel: z.string().trim().min(1).max(200),
      claudeModel: z.string().trim().min(1).max(200),
    })
    .partial()
    .optional(),
  rules: z
    .object({
      currency: z.enum(["IQD", "USD"]),
      windowDays: z.coerce.number().int().min(1).max(60),
      targetCpr: z
        .object({
          orders: money,
          installs: money,
          messages: money,
          leads: money,
          awareness: money,
        })
        .partial(),
      minSpendMultiplier: z.coerce.number().min(0.1).max(20),
      stopRatio: z.coerce.number().min(1).max(10),
      scaleRatio: z.coerce.number().min(0.1).max(1),
      minResultsToScale: z.coerce.number().int().min(1).max(10000),
      minCtr: z.coerce.number().min(0).max(100),
    })
    .partial()
    .optional(),
});
