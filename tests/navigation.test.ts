import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { LEGACY_REDIRECTS, PANEL_SECTIONS, RESIDENTS_TABS, activeItem, isActive } from "../src/lib/navigation";

const APP_DIR = path.join(process.cwd(), "src", "app");
const ROUTE_GROUPS = ["", "(residents)"];

function pageExists(href: string): boolean {
  const segments = href === "/" ? [] : href.slice(1).split("/");
  return ROUTE_GROUPS.some((group) => existsSync(path.join(APP_DIR, group, ...segments, "page.tsx")));
}

test("every tab and section has a unique destination starting with /", () => {
  const hrefs = [...RESIDENTS_TABS, ...PANEL_SECTIONS].map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(hrefs.every((href) => href.startsWith("/")));
});

test("every navigation destination has a page", () => {
  const missing = [...RESIDENTS_TABS, ...PANEL_SECTIONS].map((item) => item.href).filter((href) => !pageExists(href));
  assert.deepEqual(missing, []);
});

test("the active section respects roots and sub-routes", () => {
  assert.equal(activeItem(PANEL_SECTIONS, "/operaciones/pronostico")?.label, "Pronóstico");
  assert.equal(activeItem(PANEL_SECTIONS, "/operaciones")?.label, "Resumen");
  assert.equal(activeItem(PANEL_SECTIONS, "/operaciones/")?.label, "Resumen");
  assert.equal(activeItem(RESIDENTS_TABS, "/")?.label, "Ahora");
  assert.equal(activeItem(RESIDENTS_TABS, "/operaciones"), undefined);
  assert.equal(isActive(PANEL_SECTIONS[0], "/operaciones/pronostico"), false);
});

test("the forecast lives inside the panel and its old route redirects there", () => {
  assert.ok(!PANEL_SECTIONS.some((item) => item.href === "/predicciones"));
  assert.ok(!RESIDENTS_TABS.some((item) => item.href === "/predicciones"));
  const redirect = LEGACY_REDIRECTS.find((item) => item.source === "/predicciones");
  assert.equal(redirect?.destination, "/operaciones/pronostico");
  assert.equal(redirect?.permanent, true);
  assert.ok(pageExists(redirect?.destination ?? ""));
});

test("every legacy Spanish API path redirects permanently to an existing English route", () => {
  const apiRedirects = LEGACY_REDIRECTS.filter((item) => item.source.startsWith("/api/"));
  assert.equal(apiRedirects.length, 5);
  for (const redirect of apiRedirects) {
    assert.equal(redirect.permanent, true);
    const segments = redirect.destination.slice(1).split("/").map((segment) => (segment === ":id" ? "[id]" : segment));
    assert.ok(existsSync(path.join(APP_DIR, ...segments, "route.ts")), redirect.destination);
  }
});
