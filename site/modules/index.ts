// The modules this site runs (modules/<name>/, see docs/architecture.md). A module has a line in each list
// it has an entry for: here for its addresses (module.ts), in server.ts for its backend, in web.ts for its
// pages' parts. news-patrol has no pages or routes of its own (worker schedules only), so it is absent here.
import type { ModuleDeclaration } from "@aihot/contracts/modules";

export const MODULES: readonly ModuleDeclaration[] = [];
