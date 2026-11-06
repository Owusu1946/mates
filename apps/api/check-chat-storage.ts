import "./src/load-env.js";
import { sql } from "drizzle-orm";
import { getDb } from "./src/db/client.js";
import { createChatStore } from "./src/chats.js";

async function main() {
  if (process.argv.includes("--inspect")) {
    console.log(
      await getDb().execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      ),
    );
    return;
  }
  const store = createChatStore();
  const id = `storage_check_${crypto.randomUUID()}`;
  const owner = `check_${crypto.randomUUID()}`;
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  try {
    assert(await store.initialize(owner, id), "Chat initialization failed");
    assert(
      !(await store.initialize("other_user", id)),
      "Ownership collision was accepted",
    );
    const item = {
      parentId: null,
      message: {
        id: "message_1",
        role: "user" as const,
        createdAt: new Date().toISOString(),
        content: [{ type: "text", text: "Storage check" }],
      },
    };
    await store.save(owner, id, item);
    await store.save(owner, id, {
      ...item,
      message: {
        ...item.message,
        content: [{ type: "text", text: "Updated" }],
      },
    });
    const history = await store.history(owner, id);
    assert(history?.length === 1, "Repeated save duplicated messages");
    assert(
      JSON.stringify(history).includes("Updated"),
      "Update was not restored",
    );
    assert(
      (await store.history("other_user", id)) === null,
      "History leaked to another user",
    );
    assert(
      !(await store.save("other_user", id, item)),
      "Another user changed messages",
    );
    assert(
      !(await store.delete("other_user", id)),
      "Another user deleted the chat",
    );
    await store.update(owner, id, { title: "Verified", status: "archived" });
    assert(
      (await store.get(owner, id))?.status === "archived",
      "Archive failed",
    );
    await store.deleteMessages(owner, id, ["message_1"]);
    assert(
      (await store.history(owner, id))?.length === 0,
      "Message delete failed",
    );
    console.log(
      "Neon chat storage verified: create, restore, idempotent save, ownership, archive, delete.",
    );
  } finally {
    await store.delete(owner, id);
  }
}
main().catch(() => {
  console.error(
    "Chat storage check failed. Check API database connectivity and migrations.",
  );
  process.exitCode = 1;
});
