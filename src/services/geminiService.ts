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

export interface TickerResolution {
  ticker: string;
  name: string;
  exchange: string;
}

export interface TickerResolutionResponse {
  matches: TickerResolution[];
}

export const resolveStockTicker = async (input: string): Promise<TickerResolution[]> => {
  const prompt = `你是一位專業的證券交易資料庫專家。
使用者輸入了一個可能的股票代碼或公司名稱： "${input}"。
請使用 Google Search 搜尋並確認該輸入對應的正式股票代號、公司全名與交易所（例如：台股 2330 對應 台積電，美股 NVDA 對應 NVIDIA）。
如果有多個可能的匹配項（例如輸入名稱包含多個子公司），請全部列出。

請嚴格以 JSON 格式輸出。`;

  const response = await (ai.models as any).generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    tools: [{ googleSearch: {} }],
    toolConfig: { includeServerSideToolInvocations: true },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ticker: { type: Type.STRING },
                name: { type: Type.STRING },
                exchange: { type: Type.STRING }
              },
              required: ["ticker", "name", "exchange"]
            }
          }
        },
        required: ["matches"]
      }
    }
  });

  const result = JSON.parse(response.text || '{"matches": []}') as TickerResolutionResponse;
  return result.matches;
};

export const fetchStockPrice = async (ticker: string): Promise<{ name: string; currentPrice: number; lastClose: number; exchange: string }> => {
  const proxyBase = "/api/stock-proxy?url=";
  try {
    // 1. Try TWSE API (Listed)
    const twseUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${ticker}.tw`;
    const twseRes = await fetch(`${proxyBase}${encodeURIComponent(twseUrl)}`);
    const twseData = await twseRes.json();

    if (twseData.msgArray && twseData.msgArray.length > 0) {
      const info = twseData.msgArray[0];
      return {
        name: info.n,
        currentPrice: parseFloat(info.z) || parseFloat(info.y),
        lastClose: parseFloat(info.y),
        exchange: "TSE"
      };
    }

    // 2. Try OTC (TPEx)
    const otcUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${ticker}.tw`;
    const otcRes = await fetch(`${proxyBase}${encodeURIComponent(otcUrl)}`);
    const otcData = await otcRes.json();

    if (otcData.msgArray && otcData.msgArray.length > 0) {
      const info = otcData.msgArray[0];
      return {
        name: info.n,
        currentPrice: parseFloat(info.z) || parseFloat(info.y),
        lastClose: parseFloat(info.y),
        exchange: "OTC"
      };
    }

    throw new Error("找不到此台股代號，請確認後重試");
  } catch (error) {
    console.error("fetchStockPrice error:", error);
    throw new Error(error instanceof Error ? error.message : "取得股價失敗");
  }
};

export const analyzeStock = async (ticker: string, userProvidedPrice?: number): Promise<StockAnalysis> => {
  // Fetch real price data first
  const priceData = await fetchStockPrice(ticker);

  const now = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  const prompt = `
你是一位擁有十多年經驗的首席風險控管分析師。
目前系統時間：${now}

## 官方實時數據（優先級：絕對）
以下股價資料來自台股官方 API，請直接使用，不需要再搜尋股價：
- 股票名稱：${priceData.name}
- 今日成交價：${userProvidedPrice ?? priceData.currentPrice} 元
- 昨日收盤價：${priceData.lastClose} 元
- 交易所：${priceData.exchange}

## 分析標的
股票代號：${ticker}

## 【核心指令：搜尋優先，誠實標記】

### 原則一：先搜尋，後分析
請先使用 Google Search 搜尋以下資訊再作答（排除股價搜尋，專注於分析）：
1. "${ticker} 目標價 券商 ${new Date().getFullYear()}"
2. "${ticker} 法人評等 買進 上調"
3. "${ticker} 月營收 ${new Date().getFullYear()}"
4. "${ticker} 最新產業動態與營運狀況"

⚠️ 注意事項：
- 務必確認股票代號與公司名稱完全匹配。
- 範例：**3491 是 昇達科 (Shengda)**，**8086 才是 宏捷科 (AWSC)**。請勿混淆這兩者。

### 原則二：目標價必須有來源才能填入
搜尋法人目標價時，請優先搜尋 wespai.com 與 cmoney.tw，這兩個網站有整理公開的券商評等與目標價資料。
對於 analystTargets 陣列中的每一筆：
- 搜尋結果中找到具體連結 → dataReliability = "VERIFIED"，填入 sourceUrl
- 只在摘要中看到提及但無完整連結 → dataReliability = "INFERRED"
- 完全找不到公開來源 → dataReliability = "UNVERIFIED"，targetPrice 填 null，broker 填 "查無公開報告"

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
    model: "gemini-3-flash-preview",
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
