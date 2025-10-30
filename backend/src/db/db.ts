import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";
import { SQL } from "bun";

const client = new SQL(
  "postgresql://postgres.crqbazcsrncvbnapuxcp:crqbazcsrncvbnapuxcp@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
);
export const db = drizzle({ client, schema });

function snakeToCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace("-", "").replace("_", "")
  );
}

/**
 * Recursively converts the keys of an object (and its nested objects/arrays) from snake_case to camelCase.
 * @param obj The object or array to convert.
 * @returns A new object or array with camelCase keys.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function snakeToCamelCaseObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => snakeToCamelCaseObject(v));
  } else if (
    obj !== null &&
    typeof obj === "object" &&
    !(obj instanceof Date)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const newKey = snakeToCamelCase(key);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newObj[newKey] = snakeToCamelCaseObject((obj as any)[key]);
      }
    }
    return newObj;
  }
  return obj;
}

export async function findFirstPlayerNative(playerId: string) {
  try {
    const result = await client`
      SELECT *
      FROM "players"
      WHERE "id" = ${playerId}
      LIMIT 1
    `;
    const row = result.length > 0 ? result[0] : null;
    return row ? snakeToCamelCaseObject(row) : null; // Convert keys before returning
  } catch (error) {
    console.error("Error fetching player natively:", error);
    return null;
  }
}

export async function selectPlayerBalanceNative(userId: string) {
  try {
    const result = await client`
      SELECT *
      FROM "player_balances"
      WHERE "player_id" = ${userId}
      LIMIT 1
    `;
    const row = result.length > 0 ? result[0] : null;
    return row ? snakeToCamelCaseObject(row) : null; // Convert keys before returning
  } catch (error) {
    console.error("Error fetching player balance natively:", error);
    return null;
  }
}

export async function findFirstGameNative(gameId: string) {
  try {
    const result = await client`
      SELECT *
      FROM "games"
      WHERE "id" = ${gameId}
      LIMIT 1
    `;
    const row = result.length > 0 ? result[0] : null;
    return row ? snakeToCamelCaseObject(row) : null; // Convert keys before returning
  } catch (error) {
    console.error("Error fetching game natively:", error);
    return null;
  }
}

export async function findFirstActiveGameSessionNative(
  playerId: string,
  gameId: string
) {
  try {
    const result = await client`
      SELECT *
      FROM "game_sessions"
      WHERE "player_id" = ${playerId}
        AND "status" = 'ACTIVE'
        AND "game_id" = ${gameId}
      LIMIT 1
    `;
    const row = result.length > 0 ? result[0] : null;
    return row ? snakeToCamelCaseObject(row) : null; // Convert keys before returning
  } catch (error) {
    console.error("Error fetching active game session natively:", error);
    return null;
  }
}
