(function (scope) {
  var STATIC_PREFIXES = ["/_next/static/", "/icons/", "/logos/"];
  var REVALIDATE_PREFIXES = ["/data/"];
  var NETWORK_FIRST_PREFIXES = ["/api/"];
  var NEVER_CACHE_PREFIXES = ["/api/reports/", "/api/ops/", "/_next/data/"];

  function startsWithAny(pathname, prefixes) {
    return prefixes.some(function (prefix) {
      return pathname.indexOf(prefix) === 0;
    });
  }

  function strategyFor(request) {
    if (request.method !== "GET" || !request.sameOrigin) {
      return "network-only";
    }
    if (startsWithAny(request.pathname, NEVER_CACHE_PREFIXES)) {
      return "network-only";
    }
    if (request.mode === "navigate") {
      return "network-first";
    }
    if (startsWithAny(request.pathname, STATIC_PREFIXES)) {
      return "cache-first";
    }
    if (startsWithAny(request.pathname, REVALIDATE_PREFIXES)) {
      return "stale-while-revalidate";
    }
    if (startsWithAny(request.pathname, NETWORK_FIRST_PREFIXES)) {
      return "network-first";
    }
    return "network-only";
  }

  scope.cotaStrategyFor = strategyFor;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { strategyFor: strategyFor };
  }
})(typeof self !== "undefined" ? self : globalThis);
