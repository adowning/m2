import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./config/auth";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/games";
import { betsRoutes } from "./routes/bets";
import { adminRoutes } from "./routes/admin";
// import { WebSocketService } from "./services/websocketService";
// import { createMiddleware } from "hono/factory";
// import { upgradeWebSocket } from "hono/cloudflare-workers";

const app = new Hono();

// CORS middleware
app.use(
  "/api/*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    allowHeaders: ["Content-Type", "Authorization", "X-Operator-ID"],
    allowMethods: ["POST", "GET", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// Better-Auth routes
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// WebSocket middleware for authentication
// const wsAuthMiddleware = createMiddleware(async (c, next) => {
//   // Implement authentication logic for WebSocket connections
//   // This could check JWT tokens or session IDs
//   await next();
// });

// WebSocket endpoints
// app.get("/ws/user", upgradeWebSocket((c) => {
//   const userId = c.req.query("userId");
//   if (!userId) {
//     return { onOpen: () => {}, onMessage: () => {}, onClose: () => {} };
//   }

//   return {
//     onOpen: (event, ws) => {
//       WebSocketService.addConnection(ws.raw!, userId);
//     },
//     onMessage: (event, ws) => {
//       WebSocketService.handleMessage(event, event.data);
//     },
//     onClose: (event, ws) => {
//       WebSocketService.removeConnection(ws.raw!);
//     },
//   };
// }));

// app.get("/ws/admin", upgradeWebSocket((c) => {
//   const operatorId = c.req.query("operatorId");
//   if (!operatorId) {
//     return { onOpen: () => {}, onMessage: () => {}, onClose: () => {} };
//   }

//   return {
//     onOpen: (event, ws) => {
//       WebSocketService.addConnection(ws.raw!, undefined, operatorId);
//     },
//     onMessage: (event, ws) => {
//       WebSocketService.handleMessage(event, event.data);
//     },
//     onClose: (event, ws) => {
//       WebSocketService.removeConnection(ws.raw!);
//     },
//   };
// }));

// Application routes
app.route("/api/auth", authRoutes);
app.route("/api/games", gameRoutes);
app.route("/api", betsRoutes);
app.route("/api", adminRoutes);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((error, c) => {
  console.error("Server error:", error);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;
