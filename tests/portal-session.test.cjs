const assert = require("node:assert/strict");
const { test } = require("node:test");
require("tsx/cjs");

const businessApi = require("../apps/business-portal/lib/api.ts");
const riderApi = require("../apps/rider-app/lib/api.ts");

const accountId = "550e8400-e29b-41d4-a716-446655440000";
const portals = [
  { name: "business", key: "happy-tirana-business-session-v1", load: businessApi.getBusinessDashboard, ErrorType: businessApi.BusinessApiError, missing: "BUSINESS_NOT_FOUND", expired: "BUSINESS_SESSION_EXPIRED" },
  { name: "rider", key: "happy-tirana-rider-session-v1", load: riderApi.getRiderDashboard, ErrorType: riderApi.RiderApiError, missing: "RIDER_NOT_FOUND", expired: "RIDER_SESSION_EXPIRED" },
];

function storage(t, key, id = accountId) {
  const values = new Map([[key, JSON.stringify({ id })]]);
  const original = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
    removeItem: (name) => values.delete(name),
  } };
  t.after(() => { if (original === undefined) delete globalThis.window; else globalThis.window = original; });
  return values;
}

for (const portal of portals) {
  test(portal.name + ": missing account invalidates the stored login", async t => {
    const values = storage(t, portal.key);
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: portal.missing }), { status: 404 }));
    await assert.rejects(portal.load(), error => error instanceof portal.ErrorType && error.status === 401 && error.code === portal.expired);
    assert.equal(values.has(portal.key), false);
  });

  test(portal.name + ": malformed stored id is rejected before a request", async t => {
    const values = storage(t, portal.key, "old-demo-id");
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
    await assert.rejects(portal.load(), error => error.code === portal.expired);
    assert.equal(values.has(portal.key), false);
    assert.equal(fetch.mock.callCount(), 0);
  });

  test(portal.name + ": a server outage preserves the login for retry", async t => {
    const values = storage(t, portal.key);
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: "TEMPORARY_OUTAGE" }), { status: 503 }));
    await assert.rejects(portal.load(), error => error.status === 503);
    assert.equal(values.has(portal.key), true);
  });

  test(portal.name + ": a network error preserves the login", async t => {
    const values = storage(t, portal.key);
    t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
    await assert.rejects(portal.load(), /Failed to fetch/);
    assert.equal(values.has(portal.key), true);
  });

  test(portal.name + ": an unrelated 404 does not invalidate the login", async t => {
    const values = storage(t, portal.key);
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: "ENDPOINT_NOT_FOUND" }), { status: 404 }));
    await assert.rejects(portal.load(), error => error.status === 404);
    assert.equal(values.has(portal.key), true);
  });

  test(portal.name + ": an existing account loads normally", async t => {
    const values = storage(t, portal.key);
    const payload = { account: { id: accountId } };
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(payload)));
    assert.deepEqual(await portal.load(), payload);
    assert.equal(values.has(portal.key), true);
  });
}
