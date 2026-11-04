import { handle } from "@/server/http";

export const GET = handle(async (_req, actor, s) => s.guard.board(actor));
