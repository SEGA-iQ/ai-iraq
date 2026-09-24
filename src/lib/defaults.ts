import type { Settings } from "./types";

export function defaultSettings(): Settings {
  return {
    company: {
      name: "",
      cities: "بغداد",
      services: "توصيل طلبات للمتاجر والمطاعم والأفراد داخل المدينة وبين المحافظات، مع الدفع عند الاستلام.",
      pricing: "",
      hours: "من 9 الصبح إلى 11 بالليل",
      phone: "",
      appName: "",
      appLink: "",
      tone: "ودود ومحترم، لهجة عراقية بسيطة، مختصر وواضح",
      extraInfo: "",
    },
    faq: [],
    ai: {
      provider: process.env.AI_PROVIDER === "claude" ? "claude" : "local",
      localBaseUrl: process.env.LOCAL_AI_BASE_URL || "http://localhost:11434/v1",
      localModel: process.env.LOCAL_AI_MODEL || "qwen2.5:7b",
      claudeModel: process.env.ANTHROPIC_MODEL || "claude-opus-5",
    },
    rules: {
      currency: "IQD",
      windowDays: 7,
      targetCpr: {
        orders: 3000,
        installs: 1500,
        messages: 1000,
        leads: 2500,
        awareness: 5,
      },
      minSpendMultiplier: 2,
      stopRatio: 1.5,
      scaleRatio: 0.8,
      minResultsToScale: 5,
      minCtr: 0.8,
    },
  };
}
