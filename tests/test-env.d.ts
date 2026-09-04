declare namespace Cloudflare {
  interface Env {
    UPGRADE_DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
