import {
  uuid,
  pgTable,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  firstName: varchar("first_name", { length: 25 }),
  lastName: varchar("last_name", { length: 25 }),

  profileImageURL: text("profile_image_url"),

  email: varchar("email", { length: 322 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),

  password: varchar("password", { length: 66 }),
  salt: text("salt"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

// make a tagble that stores client id, client secret , code , email of the user who is trying to authenticate and the expiry time of the code

export const authCodesTable = pgTable("auth_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: varchar("client_id", { length: 255 }).notNull(),
  code: varchar("code", { length: 255 }).notNull(),
  email: varchar("email", { length: 322 }).notNull(),
  clientSecret: varchar("client_secret", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

// a particvular client id app wil server manty users of that app with diff email ids but the client id will be same for that app so we can use client id to identify the app and then use email to identify the user of that app and then code will be used to authenticate the user of that app and then expiry time will be used to check if the code is expired or not