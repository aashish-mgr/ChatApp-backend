-- Direct (1:1) rooms keep a deterministic name, so a partial unique index
-- preserves the old dedupe guarantee now that group rooms share the column.
CREATE UNIQUE INDEX IF NOT EXISTS "Room_direct_name_key"
  ON "Room"("name")
  WHERE "isGroup" = false;
