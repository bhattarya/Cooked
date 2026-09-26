import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Share the root .env with Python. Next only bundles explicitly NEXT_PUBLIC_ values.
const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.COOKED_ENV_FILE || path.join(root, "../.env") });

export default { poweredByHeader: false };
