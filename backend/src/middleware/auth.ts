import { auth } from "../config/auth";
import type { MiddlewareHandler } from "hono";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Set user and session in context for use in routes
    c.set("user", session.user);
    c.set("session", session.session);

    await next();
  } catch (error) {
    return c.json({ error: "Authentication error" }, 401);
  }
};

export const roleMiddleware = (allowedRoles: string[]): MiddlewareHandler => {
  return async (c, next) => {
    const user = c.get("user");

    if (!user || !allowedRoles.includes((user as any).role || "USER")) {
      return c.json({ error: "Forbidden: Insufficient permissions" }, 403);
    }

    await next();
  };
};

// Specific role middlewares for convenience
export const adminOnly = roleMiddleware(["ADMIN"]);
export const operatorOnly = roleMiddleware(["OPERATOR", "ADMIN"]);
export const affiliateOnly = roleMiddleware(["AFFILIATE", "OPERATOR", "ADMIN"]);
export const userOnly = roleMiddleware(["USER", "AFFILIATE", "OPERATOR", "ADMIN"]);