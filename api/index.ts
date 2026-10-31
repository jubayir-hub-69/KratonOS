import type http from "node:http";
import { handleKratonHttpRequest } from "../src/server/server.js";

/**
 * Vercel / Serverless Node HTTP Handler Adapter for KratonOS.
 * Routes all `/api/*` and static UI requests through `handleKratonHttpRequest`.
 */
export default async function handler(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  await handleKratonHttpRequest(req, res);
}

