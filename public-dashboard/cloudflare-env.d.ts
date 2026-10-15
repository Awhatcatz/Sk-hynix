declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BAZE_API_KEY?: string;
    BAZE_MODEL?: string;
    DASHBOARD_ACCESS_KEY?: string;
    DASHBOARD_LINK_ONLY?: string;
    TOSS_CLIENT_ID?: string;
    TOSS_CLIENT_SECRET?: string;
    TOSS_TOKEN_ENCRYPTION_KEY?: string;
    TOSS_SHARING_APPROVED?: string;
    SITE_OWNER_EMAIL?: string;
    MEMORY_FEED_URL?: string;
    MEMORY_FEED_KEY?: string;
    MEMORY_REDISTRIBUTION_APPROVED?: string;
  }
}
