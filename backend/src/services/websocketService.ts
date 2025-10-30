import { WebSocket, WSContext } from "hono/ws";
import { z } from "zod";

// Message schemas
export const UserMessageSchema = z.object({
  type: z.enum(["bet_outcome", "balance_update", "vip_progress"]),
  userId: z.string(),
  data: z.any(),
});

export const AdminMessageSchema = z.object({
  type: z.enum(["new_transaction", "metric_update"]),
  operatorId: z.string(),
  data: z.any(),
});

export type UserMessage = z.infer<typeof UserMessageSchema>;
export type AdminMessage = z.infer<typeof AdminMessageSchema>;

interface Connection {
  ws: WebSocket;
  userId?: string;
  operatorId?: string;
}

export class WebSocketService {
  private static connections: Map<string, Connection> = new Map();

  static addConnection(id: string, ws: WebSocket, userId?: string, operatorId?: string) {
    this.connections.set(id, { ws, userId, operatorId });
  }

  static removeConnection(id: string) {
    this.connections.delete(id);
  }

  static broadcastToUser(userId: string, message: UserMessage) {
    this.connections.forEach((conn) => {
      if (conn.userId === userId) {
        conn.ws.send(JSON.stringify(message));
      }
    });
  }

  static broadcastToAdmin(operatorId: string, message: AdminMessage) {
    this.connections.forEach((conn) => {
      if (conn.operatorId === operatorId) {
        conn.ws.send(JSON.stringify(message));
      }
    });
  }

  static broadcastToAllAdmins(message: AdminMessage) {
    this.connections.forEach((conn) => {
      if (conn.operatorId) {
        conn.ws.send(JSON.stringify(message));
      }
    });
  }

  static handleMessage(ws: WSContext, data: string) {
    try {
      const parsed = JSON.parse(data);
      // Validate based on context, but for now just echo or handle
      ws.send(JSON.stringify({ type: "echo", data: parsed }));
    } catch (error) {
      ws.send(JSON.stringify({ error: "Invalid message format" }));
    }
  }
}