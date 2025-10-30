import type { Session } from "better-auth";
import type { User } from "../db/schema";

export interface AppBindings {
  user: User;
  session: Session;
}
