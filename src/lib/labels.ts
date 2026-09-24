// Arabic labels for enums. Client-safe.
import type {
  AdPlatform,
  CampaignObjective,
  CampaignStatus,
  Channel,
  Intent,
  MessageStatus,
  PostPlatform,
  PostStatus,
  PostType,
  Signal,
  Urgency,
} from "./types";

export const PLATFORM_LABELS: Record<AdPlatform, string> = {
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  snapchat: "سناب شات",
  google: "Google",
  other: "أخرى",
};

export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  orders: "طلبات توصيل",
  installs: "تحميل التطبيق",
  messages: "رسائل",
  leads: "تسجيل (تجار/مناديب)",
  awareness: "انتشار ووعي",
};

export const OBJECTIVE_RESULT_LABELS: Record<CampaignObjective, string> = {
  orders: "طلب",
  installs: "تحميل",
  messages: "رسالة",
  leads: "تسجيل",
  awareness: "وصول",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "شغّالة",
  paused: "متوقفة مؤقتاً",
  stopped: "منتهية",
};

export const SIGNAL_LABELS: Record<Signal, string> = {
  stop: "أوقفها",
  watch: "راقبها",
  keep: "استمر",
  scale: "كبّرها",
  learning: "بيانات قليلة",
  no_data: "ماكو بيانات",
  inactive: "غير فعّالة",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "واتساب",
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  other: "أخرى",
};

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  new: "جديدة",
  drafted: "الرد جاهز",
  replied: "تم الرد",
  follow_up: "تحتاج متابعة",
};

export const INTENT_LABELS: Record<Intent, string> = {
  order: "طلب توصيل",
  price: "سؤال عن السعر",
  tracking: "وين طلبي",
  complaint: "شكوى",
  merchant: "تاجر يريد يتعامل",
  driver_job: "يريد يشتغل مندوب",
  app_support: "مشكلة بالتطبيق",
  other: "أخرى",
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  high: "عاجل",
  normal: "عادي",
  low: "غير مستعجل",
};

export const POST_PLATFORM_LABELS: Record<PostPlatform, string> = {
  facebook: "فيسبوك",
  instagram: "إنستغرام",
  tiktok: "تيك توك",
  whatsapp_status: "حالة واتساب",
};

export const POST_TYPE_LABELS: Record<PostType, string> = {
  offer: "عرض أو خصم",
  service: "تعريف بالخدمة",
  hiring: "توظيف مناديب",
  tips: "نصيحة أو معلومة",
  engagement: "تفاعل وسؤال للجمهور",
  occasion: "مناسبة",
  app: "الترويج للتطبيق",
};

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  draft: "مسودة",
  ready: "جاهز للنشر",
  published: "منشور",
};
