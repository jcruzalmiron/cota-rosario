import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDuration } from "../src/app/ui/api";

test("la duración del tablero se lee sin hacer cuentas", () => {
  assert.deepEqual([0, 45, 119, 120, 185, 2879, 2880, 8147].map(fmtDuration), ["0 min", "45 min", "119 min", "2 h 00 min", "3 h 05 min", "47 h 59 min", "2 d 0 h", "5 d 15 h"]);
  assert.equal(fmtDuration(-3), "0 min");
});
