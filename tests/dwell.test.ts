import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDwellIntervals,
  aggregateDwell,
  type StatusTransition,
} from "@/lib/dwell";

const H = 3600 * 1000;
const day = (n: number) => n * 24 * H;

test("no transitions → single interval in current status", () => {
  const out = computeDwellIntervals({
    createdMs: 0,
    currentStatus: "To Do",
    endMs: day(3),
    transitions: [],
  });
  assert.deepEqual(out, [{ status: "To Do", hours: 72 }]);
});

test("walks created → transitions → end", () => {
  const transitions: StatusTransition[] = [
    { at: day(1), from: "To Do", to: "In Progress" },
    { at: day(4), from: "In Progress", to: "In Review" },
  ];
  const out = computeDwellIntervals({
    createdMs: 0,
    currentStatus: "In Review",
    endMs: day(5),
    transitions,
  });
  assert.deepEqual(out, [
    { status: "To Do", hours: 24 }, // created → t1
    { status: "In Progress", hours: 72 }, // t1 → t2
    { status: "In Review", hours: 24 }, // t2 → end
  ]);
});

test("resolved issue's terminal Done segment collapses to ~0", () => {
  const transitions: StatusTransition[] = [
    { at: day(1), from: "To Do", to: "In Progress" },
    { at: day(2), from: "In Progress", to: "Done" },
  ];
  const out = computeDwellIntervals({
    createdMs: 0,
    currentStatus: "Done",
    endMs: day(2), // resolved at the same time as the move to Done
    transitions,
  });
  assert.deepEqual(out, [
    { status: "To Do", hours: 24 },
    { status: "In Progress", hours: 24 },
    { status: "Done", hours: 0 },
  ]);
});

test("out-of-order transitions are sorted", () => {
  const transitions: StatusTransition[] = [
    { at: day(4), from: "In Progress", to: "In Review" },
    { at: day(1), from: "To Do", to: "In Progress" },
  ];
  const out = computeDwellIntervals({
    createdMs: 0,
    currentStatus: "In Review",
    endMs: day(5),
    transitions,
  });
  assert.equal(out[0].status, "To Do");
  assert.equal(out[1].status, "In Progress");
  assert.equal(out[2].status, "In Review");
});

test("aggregateDwell sums and averages per status", () => {
  const a = {
    createdMs: 0,
    currentStatus: "In Progress",
    endMs: day(2),
    transitions: [{ at: day(1), from: "To Do", to: "In Progress" }],
  };
  const b = {
    createdMs: 0,
    currentStatus: "In Progress",
    endMs: day(4),
    transitions: [{ at: day(3), from: "To Do", to: "In Progress" }],
  };
  const agg = aggregateDwell([a, b]);
  const todo = agg.find((e) => e.status === "To Do")!;
  const inprog = agg.find((e) => e.status === "In Progress")!;
  assert.equal(todo.count, 2);
  assert.equal(todo.totalHours, 24 + 72); // 1d + 3d
  assert.equal(todo.avgHours, 48);
  assert.equal(inprog.count, 2);
  assert.equal(inprog.totalHours, 24 + 24); // each 1d to end
  // sorted by totalHours desc
  assert.equal(agg[0].status, "To Do");
});
