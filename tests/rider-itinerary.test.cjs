const { test } = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  orderStops,
  optimizeStops,
} = require("../apps/api/src/rider-itinerary.ts");
const order = (id, status = "ACCEPTED") => ({
  id,
  code: id,
  status,
  businessName: id,
  pickupAddress: "B",
  pickupLat: 41,
  pickupLng: 19,
  dropoffAddress: "K",
  dropoffLat: 42,
  dropoffLng: 20,
});

test("picked up orders need only delivery; inactive offers never become route stops", () => {
  const stops = orderStops([
    order("a", "PICKED_UP"),
    order("b", "OFFERED"),
    order("c", "DELIVERED"),
  ]);
  assert.deepEqual(
    stops.map((s) => s.orderId + ":" + s.kind),
    ["a:dropoff"],
  );
});
test("two orders: respects pickup before delivery and beats greedy nearest stop", () => {
  const stops = orderStops(["a", "b"].map((x) => order(x)));
  const matrix = Array.from({ length: 5 }, () => Array(5).fill(100));
  // Shortest feasible path collects b before a even though a is initially nearer.
  const expected = [3, 1, 4, 2];
  matrix[0][1] = 1;
  let previous = 0;
  for (const next of expected) {
    matrix[previous][next] = 2;
    previous = next;
  }
  const result = optimizeStops(stops, matrix);
  assert.deepEqual(
    result,
    expected.map((i) => stops[i - 1]),
  );
  for (const id of ["a", "b"])
    assert.ok(
      result.findIndex((s) => s.orderId === id && s.kind === "pickup") <
        result.findIndex((s) => s.orderId === id && s.kind === "dropoff"),
    );
});
test("unreachable destination fails rather than inventing a route", () => {
  assert.throws(
    () =>
      optimizeStops(orderStops([order("a")]), [
        [0, 1, Infinity],
        [Infinity, 0, Infinity],
        [Infinity, Infinity, 0],
      ]),
    /ROUTE_NOT_FOUND/,
  );
});
test("already collected order may be delivered before another pickup", () => {
  const stops = orderStops([order("a"), order("b", "PICKED_UP")]);
  const matrix = [
    [0, 9, 9, 1],
    [9, 0, 1, 9],
    [9, 9, 0, 9],
    [9, 1, 9, 0],
  ];
  assert.deepEqual(
    optimizeStops(stops, matrix).map((s) => s.orderId + ":" + s.kind),
    ["b:dropoff", "a:pickup", "a:dropoff"],
  );
});
