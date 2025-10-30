import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/db";
import { userTable, sessionTable } from "../../database/schema/user";
import { operators, wallets } from "../db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: null,
      verification: null,
    },
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    modelName: "user",
    fields: {
      email: "authEmail",
      password: "passwordHash",
    },
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "USER",
        validate: (value) => {
          const allowedRoles = ["USER", "AFFILIATE", "OPERATOR", "ADMIN"];
          return allowedRoles.includes(value as string);
        },
      },
    },
  },
  hooks: {
    after: {
      signUp: async (user) => {
        // Create default wallet for first operator if no operator specified
        // This is a fallback - the register endpoint should handle specific operator association
        const firstOperator = await db.select().from(operators).limit(1);
        if (firstOperator.length > 0) {
          await db.insert(wallets).values({
            userId: user.id,
            operatorId: firstOperator[0].id,
            realBalance: "0",
            bonusBalance: "0",
          });
        }
      },
    },
  },
});
