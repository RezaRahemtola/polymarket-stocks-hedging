import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Config {
  stocks: string[];
  opportunities: {
    opportunityAPY: number;
    minDisplayAPY: number;
    minDeltaPercent: number;
    slugPatterns: string[];
  };
  scanner: {
    intervalMinutes: number;
  };
  rejections: {
    softRejectHours: number;
  };
  logging: {
    level: string;
  };
  api: {
    gammaApiUrl: string;
    clobApiUrl: string;
    polygonRpcUrl: string;
    privateKey: string;
    funderAddress: string;
  };
}

export function getConfig(): Config {
  // Only cache in production

  const configPath = join(process.cwd(), "config", "config.json");
  const fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));

  const config: Config = {
    ...fileConfig,
    opportunities: {
      opportunityAPY: fileConfig.opportunities?.opportunityAPY || 25,
      minDisplayAPY: fileConfig.opportunities?.minDisplayAPY || 5,
      minDeltaPercent: fileConfig.opportunities?.minDeltaPercent || 7,
      slugPatterns: fileConfig.opportunities?.slugPatterns || [],
    },
    scanner: fileConfig.scanner || { intervalMinutes: 5 },
    rejections: fileConfig.rejections || { softRejectHours: 24 },
    logging: fileConfig.logging || { level: "info" },
    api: {
      gammaApiUrl:
        fileConfig.api?.gammaApiUrl || "https://gamma-api.polymarket.com",
      clobApiUrl: fileConfig.api?.clobApiUrl || "https://clob.polymarket.com",
      polygonRpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      privateKey: process.env.POLYGON_PRIVATE_KEY || "",
      funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS || "",
    },
  };

  return config;
}
