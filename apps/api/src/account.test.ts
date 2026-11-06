import { getTableColumns, getTableName, isTable } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ACCOUNT_TABLES } from "./account.js";
import * as schema from "./db/schema.js";

describe("account deletion", () => {
  it("covers every table that stores a user's rows", () => {
    const owned = Object.values(schema)
      .filter((value) => isTable(value) && "clerkUserId" in getTableColumns(value as never))
      .map((table) => getTableName(table as never))
      .sort();
    expect(ACCOUNT_TABLES.map((table) => getTableName(table)).sort()).toEqual(owned);
  });

  it("deletes routines before delegations and chats before mates", () => {
    const order = ACCOUNT_TABLES.map((table) => getTableName(table));
    expect(order.indexOf("routines")).toBeLessThan(order.indexOf("delegations"));
    expect(order.indexOf("chats")).toBeLessThan(order.indexOf("mates"));
  });
});
