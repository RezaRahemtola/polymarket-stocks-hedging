import winston from "winston";
import { getConfig } from "./config";

const config = getConfig();

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});
