import { PORT } from "../config.js";

// Browsers attach Origin / Sec-Fetch-Site to requests triggered by web pages. Requests made by
// this extension carry chrome-extension:// as Origin. Anything else (a malicious page, DNS
// rebinding via a foreign Host header) is rejected before any route runs.
export function localOnly(req, res, next) {
  const hosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
  if (!hosts.has(req.headers.host)) return res.status(403).json({ error: "Forbidden host", code: "FORBIDDEN" });
  const origin = req.headers.origin;
  const site = req.headers["sec-fetch-site"];
  const fromExtension = !origin || origin.startsWith("chrome-extension://");
  if (!fromExtension || (!origin && site === "cross-site")) {
    return res.status(403).json({ error: "Forbidden origin", code: "FORBIDDEN" });
  }
  next();
}

export const corsOptions = {
  origin: (origin, cb) => cb(null, !origin || origin.startsWith("chrome-extension://")),
};
