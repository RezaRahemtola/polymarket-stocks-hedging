import winston from "winston";
import { getConfig } from "./config";

function getLogLevel(): string {
  try {
    return getConfig().logging.level;
  } catch {
    // config/ is excluded from the Docker build context and mounted at
    // runtime; fall back to the default level while collecting page data.
    return "info";
  }
}

export const logger = winston.createLogger({
  level: getLogLevel(),
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});
