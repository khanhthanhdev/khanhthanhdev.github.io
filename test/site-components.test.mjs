import assert from "node:assert/strict";
import test from "node:test";
import { stepLife, canAnimateLife } from "../assets/js/life-divider.mjs";
import { positionSidenotes } from "../assets/js/sidenotes.mjs";

test("Life wraps a blinker across the edge without changing its input", () => {
  const cells = new Uint8Array(25);
  [9, 5, 6].forEach((index) => (cells[index] = 1));
  const next = stepLife(cells, 5, 5);
  assert.deepEqual(
    [...next.entries()].filter(([, cell]) => cell).map(([index]) => index),
    [0, 5, 10]
  );
  assert.deepEqual(stepLife(next, 5, 5), cells);
  assert.equal(
    cells.reduce((a, b) => a + b),
    3
  );
});

test("Life keeps a still life stable and removes an isolated cell", () => {
  const block = new Uint8Array(36);
  [14, 15, 20, 21].forEach((index) => (block[index] = 1));
  assert.deepEqual(stepLife(block, 6, 6), block);
  const lonely = new Uint8Array(36);
  lonely[14] = 1;
  assert.equal(stepLife(lonely, 6, 6).some(Boolean), false);
});

test("Life runs only when visible, active, motion-enabled, and unpaused", () => {
  const state = { visible: true, hidden: false, reduced: false, paused: false };
  assert.equal(canAnimateLife(state), true);
  for (const [key, value] of Object.entries({ visible: false, hidden: true, reduced: true, paused: true })) {
    assert.equal(canAnimateLife({ ...state, [key]: value }), false);
  }
});

test("sidenotes separate close anchors and shift back inside the article", () => {
  const notes = [
    { anchor: 150, height: 40 },
    { anchor: 155, height: 50 },
  ];
  const tops = positionSidenotes(notes, 230);
  assert.deepEqual(tops, [128, 180]);
  assert.ok(tops[1] >= tops[0] + notes[0].height + 12);
  assert.ok(tops[1] + notes[1].height <= 230);
});

test("sidenotes fall back when the margin cannot hold all notes", () => {
  assert.equal(
    positionSidenotes(
      [
        { anchor: 0, height: 200 },
        { anchor: 0, height: 200 },
      ],
      300
    ),
    null
  );
  assert.equal(positionSidenotes([{ anchor: 10, height: 101 }], 100), null);
  assert.deepEqual(positionSidenotes([], 0), []);
});
