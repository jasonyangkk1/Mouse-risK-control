import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalystTarget {
  broker: string;
  rating: string;
  targetPrice: number | null;
  reportDate: string;
  sourceUrl: string;
  dataReliability: "VERIFIED" | "INFERRED" | "UNVERIFIED";
}

export interface StockAnalysis {
  ticker: string;
  name: string;
  currentPrice: number;
  lastClose: number;
  verdict: "可以買進" | "建議觀望";
  score: number;
  fScore: {
    total: number;
    details: { name: string; met: boolean; reason: string }[];
  };
  marketBreadth: {
    momentumPercentage: number;
    trend: string;
    industryStatus: string;
    description: string;
  };
  riskReward: {
    ratio: number;
    support: string;
    target: string;
    description: string;
  };
  revenueSummary: {
    lastMonth: string;
    status: string;
    estimateSurprise?: string;
    nextAnnouncementDate: string;
    forecastWindow: string;
  };
  analystTargets: AnalystTarget[];
  consensusSummary: string;
  suggestion: string;
}

export const analyzeStock = async (ticker: string, userProvidedPrice?: number): Promise<StockAnalysis> => {
  const now = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  const prompt = `
你是一位擁有十多年經驗的首席風險控管分析師。
目前系統時間：${now}

## 分析標的
股票代號：${ticker}
${userProvidedPrice ? `⚠️ **絕對基準指令**：使用者已核實今日收盤價為 **${userProvidedPrice} 元**。在 JSON 輸出中的 currentPrice 必須填寫 ${userProvidedPrice}，且所有技術面分析（如盈虧比、支撐位、目標位）必須以此價格為計算基準，禁止使用搜尋到的舊數據覆蓋此值。` : ""}

## 【核心指令：搜尋優先，誠實標記】

### 原則一：先搜尋，後分析
請先使用 Google Search 搜尋以下資訊再作答：
1. "${ticker} (聯亞光) 台股最新目標價 凱基 元大 摩根大通 高盛 報告 ${new Date().getFullYear()}"
2. "${ticker} 評等 目標價 鉅亨網 MoneyDJ 工商時報"
3. "${ticker} 最新法人個股報告 摘要"
4. "${ticker} 3081 股價即時報價 奇摩股市"

⚠️ 數據審核專項指令：
- **3081 聯亞 (LandMark Optoelectronics)**：必須精確搜尋「聯亞光電」以區別聯亞藥。其目前業務為矽光子 (CPO) 與光通訊雷射晶片。
- **絕對真實報價原則**：禁止預設任何價格區間。AI 必須 100% 採信 Google Search 抓取到的「最新成交價」或「今日收盤價」。
- **千金股/高價股識別**：若搜尋結果顯示報價為數千元（如 3005 元），請務必精確填寫，不得自行刪除或修改位數。
- **目標價驗證**：若找不到 VERIFIED 來源，請搜尋該公司近期（近三個月）的法人評等、法說會摘要或券商研究報告。

### 原則二：目標價數據提取準則 (誠實為本)
對於 analystTargets 陣列中的每一筆：
- **等級 A (VERIFIED)**：找到正式 PDF 報告或券商官方發布之完整連結資料。
- **等級 B (INFERRED)**：在 MoneyDJ、鉅亨網、工商時報、經濟日報等台灣權威財經媒體中，看到明確引述「某券商(如：大摩)將目標價上調至 XXX 元」的即時報導。此類數據請填入該新聞連結為 sourceUrl，並標記為 INFERRED。
- **等級 C (UNVERIFIED)**：完全找不到具體數字，targetPrice 填 null。

⚠️ 絕對禁止：不可自行推算合理目標價後填入 analystTargets，不可捏造日期與券商名稱。

### 原則三：誠實 > 完整
如果搜尋不到任何法人目標價，analystTargets 填入一筆 dataReliability = "UNVERIFIED" 的記錄，
並在 consensusSummary 誠實寫「目前未找到公開的法人評等報告，建議透過付費資料庫查詢」。

## 其他分析指引
1. F-Score：依 Piotroski 九項準則評分
2. 市場廣度：評估所屬族群動能與趨勢
3. 盈虧比：停損位 = 近期技術支撐；目標位 = 若有 VERIFIED 資料則引用，否則用技術面
4. 營收分析：最新月營收、年增率、預期差

請嚴格以 JSON 格式輸出。
`;

  const response = await (ai.models as any).generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    tools: [{ googleSearch: {} }],
    toolConfig: { includeServerSideToolInvocations: true },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ticker: { type: Type.STRING },
          name: { type: Type.STRING },
          currentPrice: { type: Type.NUMBER },
          lastClose: { type: Type.NUMBER },
          verdict: { type: Type.STRING, enum: ["可以買進", "建議觀望"] },
          score: { type: Type.NUMBER },
          fScore: {
            type: Type.OBJECT,
            properties: {
              total: { type: Type.NUMBER },
              details: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, met: { type: Type.BOOLEAN }, reason: { type: Type.STRING } }, required: ["name", "met", "reason"] } }
            },
            required: ["total", "details"]
          },
          marketBreadth: {
            type: Type.OBJECT,
            properties: { momentumPercentage: { type: Type.NUMBER }, trend: { type: Type.STRING }, industryStatus: { type: Type.STRING }, description: { type: Type.STRING } },
            required: ["momentumPercentage", "trend", "industryStatus", "description"]
          },
          riskReward: {
            type: Type.OBJECT,
            properties: { ratio: { type: Type.NUMBER }, support: { type: Type.STRING }, target: { type: Type.STRING }, description: { type: Type.STRING } },
            required: ["ratio", "support", "target", "description"]
          },
          revenueSummary: {
            type: Type.OBJECT,
            properties: { lastMonth: { type: Type.STRING }, status: { type: Type.STRING }, estimateSurprise: { type: Type.STRING }, nextAnnouncementDate: { type: Type.STRING }, forecastWindow: { type: Type.STRING } },
            required: ["lastMonth", "status", "nextAnnouncementDate", "forecastWindow"]
          },
          analystTargets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                broker: { type: Type.STRING },
                rating: { type: Type.STRING },
                targetPrice: { type: Type.NUMBER, nullable: true }, // Ensure targetPrice can be null
                reportDate: { type: Type.STRING },
                sourceUrl: { type: Type.STRING },
                dataReliability: { type: Type.STRING, enum: ["VERIFIED", "INFERRED", "UNVERIFIED"] }
              },
              required: ["broker", "rating", "reportDate", "sourceUrl", "dataReliability"]
            }
          },
          consensusSummary: { type: Type.STRING },
          suggestion: { type: Type.STRING }
        },
        required: ["ticker", "name", "currentPrice", "lastClose", "verdict", "score", "fScore", "marketBreadth", "riskReward", "revenueSummary", "analystTargets", "consensusSummary", "suggestion"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as StockAnalysis;
};
