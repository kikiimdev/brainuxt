import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { join } from "path";

// Dynamically target the executable's directory
const projectRoot = process.env.MEMORY_LAYER_DIR || process.cwd();
const dbPath = join(projectRoot, "vault.db");

let dbInstance: Database;

export const useDb = (): Database => {
  // Return the active connection immediately if already instanced
  if (dbInstance) return dbInstance;

  const projectRoot = process.env.MEMORY_LAYER_DIR || process.cwd();
  const dbPath = join(projectRoot, process.env.SQLITE_DB_PATH || "vault.db");

  // 1. Target local macOS platform execution blocks exclusively
  // 'import.meta.dev' ensures this config strips or ignores during multi-stage production compilation
  if (process.platform === "darwin" && typeof Database.setCustomSQLite === "function") {
    try {
      Database.setCustomSQLite("/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib"); //
    } catch (e) {
      console.warn("⚠️ macOS custom SQLite path override failed:", e);
    }
  }

  // 2. Initialize Bun's native engine
  dbInstance = new Database(dbPath, { create: true }); //

  // 3. Bind Vector compilation layer
  try {
    sqliteVec.load(dbInstance); //

    // Quick integrity assertion to confirm the vtab extension works
    const result = dbInstance.query("SELECT vec_version() AS version;").get() as {
      version: string;
    };
    console.log(`🚀 [SQLite] Connection ready. Vector module version: ${result.version}`);
  } catch (error) {
    console.error("❌ Failed loading vector acceleration layer:", error);
    throw error;
  }

  return dbInstance;
};

dbInstance = useDb();

const initDb = async () => {
  console.log(`🗄️ SQLite Source of Truth location: ${dbPath}`);

  // Initialize relational ledger schema and structural vector lookup tables
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      level INTEGER DEFAULT 0, -- L0=raw ledger, L1=summaries, L2=concepts
      tags TEXT, -- Stores comma-separated values like 'devops,infrastructure'
      parent_id TEXT REFERENCES memories(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sealed_at TIMESTAMP,
      l2_sealed_at TIMESTAMP
    );
  `);

  // Create virtual 384-dimension vector table using cosine distance for embeddings
  dbInstance.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[384]
    );
  `);

  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      memory_id TEXT,          -- Link back to the parent memory log
      task_text TEXT,
      is_completed INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(memory_id) REFERENCES memories(id)
    );
  `);

  dbInstance.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      id UNINDEXED,
      content,
      tags,
      tokenize = "ascii separators '_'" -- 👈 Instructs FTS5 to NOT break words on underscores
    );
  `);

  dbInstance.run(`
    CREATE TRIGGER IF NOT EXISTS after_memories_insert AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(id, content, tags) VALUES (new.id, new.content, new.tags);
    END;
  `);

  dbInstance.run(`
    CREATE TRIGGER IF NOT EXISTS after_memories_delete AFTER DELETE ON memories BEGIN
      DELETE FROM memories_fts WHERE id = old.id;
    END;
  `);

  dbInstance.run(
    `CREATE INDEX IF NOT EXISTS idx_memories_level_sealed ON memories(level, sealed_at);`,
  );
  dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_todos_lookup ON todos(is_completed, task_text);`);
};

export { dbInstance as db, initDb };
