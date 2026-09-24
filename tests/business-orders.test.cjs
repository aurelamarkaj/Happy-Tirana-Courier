const { test } = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  businessOrderSchema,
  getOrderWindow,
  assertOrderingOpen,
  calculateTransportPrice,
  calculateBusinessTransportQuote,
} = require("../apps/api/src/business-orders.ts");
const { getGoogleRoadRoute } = require("../apps/api/src/google-routes.ts");

const minimal = {
  customerPhone: "+355691234567", orderValue: 100,
  googleMapsUrl: "https://www.google.com/maps?q=41.33,19.82", readyMinutes: 10
};
test("minimal order contract: required value, maps, phone, minutes; optional name/note", () => {
  assert.equal(businessOrderSchema.parse(minimal).customerName, undefined);
  for (const field of ["orderValue", "googleMapsUrl", "customerPhone", "readyMinutes"]) {
    for (const value of [undefined, null, ""]) assert.equal(businessOrderSchema.safeParse({...minimal,[field]:value}).success,false,field);
  }
  for (const value of [NaN,Infinity,"100"]) assert.equal(businessOrderSchema.safeParse({...minimal,orderValue:value}).success,false);
  for (const value of [0,-1]) assert.equal(businessOrderSchema.safeParse({...minimal,orderValue:value}).success,true);
  assert.equal(businessOrderSchema.safeParse({...minimal,googleMapsUrl:"https://evil.example/maps?q=41,19"}).success,false);
  assert.equal(businessOrderSchema.parse({...minimal,transportFeeOverride:0}).transportFeeOverride,undefined);
});
test("Sunday is open", () => {
  assert.equal(getOrderWindow(new Date("2026-09-20T12:00:00+02:00")).isOpen,true);
});
test("Tirana opening boundaries in summer and winter", () => {
  for (const [day, offset] of [
    ["2026-07-15", "+02:00"],
    ["2026-01-15", "+01:00"],
  ]) {
    for (const [time, open] of [
      ["06:59:59", false],
      ["07:00:00", true],
      ["22:59:59", true],
      ["23:00:00", false],
      ["00:00:00", false],
    ]) {
      const date = new Date(`${day}T${time}${offset}`);
      assert.equal(getOrderWindow(date).isOpen, open);
      if (open) assert.doesNotThrow(() => assertOrderingOpen(date));
      else assert.throws(() => assertOrderingOpen(date), /ORDERING_CLOSED/);
    }
  }
});

test("automatic meter pricing and one surcharge", () => {
  for (const [meters, fee] of [
    [0, 300],
    [2999, 300],
    [3000, 300],
    [3001, 300.1],
    [3010, 301],
    [4000, 400],
    [5000, 500],
  ]) {
    assert.equal(calculateTransportPrice(meters, false).finalTransportFee, fee);
    assert.equal(
      calculateTransportPrice(meters, true).finalTransportFee,
      fee + 100,
    );
  }
  const quote = calculateTransportPrice(4000, true);
  assert.equal(quote.calculatedTransportFee, 500);
  assert.equal(quote.finalTransportFee, 500);
  assert.equal(quote.transportFeeOverridden, false);
  assert.throws(() => calculateTransportPrice(-1, false));
});

const routeInput = {
  originLat: 41.3,
  originLng: 19.8,
  destinationLat: 41.33,
  destinationLng: 19.82,
};
test("billing requires Google; explicitly requested estimates are separate", async () => {
  await assert.rejects(
    getGoogleRoadRoute("", routeInput, { allowEstimate: false }),
    /API_KEY_REQUIRED/,
  );
  assert.match((await getGoogleRoadRoute("", routeInput, {allowEstimate:true})).source, /FALLBACK/);
});

test("Google uses shortest alternative and ignores traffic; errors never become billable estimates", async (t) => {
  t.mock.method(global, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.routingPreference, "TRAFFIC_UNAWARE");
    assert.equal(body.computeAlternativeRoutes, true);
    return {
      ok: true,
      json: async () => ({
        routes: [{ distanceMeters: 4500 }, { distanceMeters: 3001 }],
      }),
    };
  });
  assert.equal(
    (await getGoogleRoadRoute("test", routeInput, { allowEstimate: false }))
      .distanceMeters,
    3001,
  );
  for (const status of [403, 429, 500]) {
    global.fetch.mock.mockImplementation(async () => ({
      ok: false,
      status,
      json: async () => ({}),
    }));
    await assert.rejects(
      getGoogleRoadRoute("test", routeInput, { allowEstimate: false }),
      /GOOGLE_DIRECTIONS_/,
    );
  }
  global.fetch.mock.mockImplementation(async () => {
    throw new Error("network");
  });
  await assert.rejects(
    getGoogleRoadRoute("test", routeInput, { allowEstimate: false }),
    /REQUEST_FAILED/,
  );
});

test("coverage gates both endpoints before Google, even with override; tariff checks destination only", async (t) => {
  t.mock.method(global, "fetch", async () => ({
    ok: true,
    json: async () => ({ routes: [{ distanceMeters: 3001 }] }),
  }));
  const input = {
    businessId: "business",
    lat: 41.33,
    lng: 19.82,
    transportFeeOverride: 250,
  };
  for (const scenario of [
    "destination-out",
    "pickup-out",
    "missing-tariff",
    "inside",
    "outside",
  ]) {
    let index = 0;
    const client = {
      query: async (sql, params) => {
        index++;
        if (index === 1)
          return { rows: [{ id: "business", lat: 41.3, lng: 19.8 }] };
        assert.match(sql, /ST_Covers/);
        if (index === 2)
          return {
            rows:
              scenario === "destination-out"
                ? []
                : [{ id: "coverage", name: "Zone 2" }],
          };
        if (index === 3)
          return {
            rows: scenario === "pickup-out" ? [] : [{ id: "coverage" }],
          };
        assert.deepEqual(params, [input.lng, input.lat]);
        return {
          rows: [
            {
              count: scenario === "missing-tariff" ? 0 : 2,
              inside: scenario === "inside",
            },
          ],
        };
      },
    };
    if (scenario.endsWith("out") || scenario === "missing-tariff") {
      await assert.rejects(
        calculateBusinessTransportQuote(client, "test", input),
        /DELIVERY_ZONE_NOT_FOUND|BUSINESS_OUTSIDE_COVERAGE|TARIFF_ZONE_REQUIRED/,
      );
    } else {
      const quote = await calculateBusinessTransportQuote(
        client,
        "test",
        input,
      );
      assert.equal(quote.ringSurchargeFee, scenario === "inside" ? 0 : 100);
      assert.equal(quote.finalTransportFee, scenario === "inside" ? 300.1 : 400.1);
    }
  }
});
