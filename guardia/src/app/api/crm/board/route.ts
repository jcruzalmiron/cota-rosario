import { handle } from "@/server/http";

export const GET = handle(async (_req, actor, s) => s.crm.board(actor));
