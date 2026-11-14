// F8: data straight into charts — a CSV from the project's files or cells
// pasted from a spreadsheet become a chart's categories and series, with
// every cell that cannot be read named rather than zero-filled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDelimited, readNumber, chartFromText } from "../packages/editor/chart-table.js";

test("CSV, spreadsheet paste and European CSV all split into the same cells", () => {
  const want = [["Region", "Q1", "Q2"], ["North, East", "1,200", "1,350"], ['Say "hi"', "3", "4"]];
  assert.deepEqual(parseDelimited('Region,Q1,Q2\r\n"North, East","1,200","1,350"\n"Say ""hi""",3,4\n\n'), want);
  assert.deepEqual(parseDelimited("Region\tQ1\tQ2\nNorth, East\t1,200\t1,350\nSay \"hi\"\t3\t4"), [want[0], want[1], ["Say \"hi\"", "3", "4"]]);
  assert.deepEqual(parseDelimited("﻿a;b\nx;1,5"), [["a", "b"], ["x", "1,5"]]);
});

test("numbers read the way people write them", () => {
  for (const [raw, n] of [["1,234.5", 1234.5], ["$12", 12], ["45%", 45], ["(3.2)", -3.2], ["−4", -4], [" 7 ", 7], ["1e3", 1000], [".5", 0.5]]) {
    assert.equal(readNumber(raw), n, raw);
  }
  for (const raw of ["", "n/a", "12abc", "1,23", "--"]) assert.equal(readNumber(raw), null, raw);
});

test("the first column names categories and each numeric column becomes a series", () => {
  const out = chartFromText("Year,Revenue,Notes,Cost\n2022,10,launch,4\n2023,14,,6\n2024,$19,peak,7");
  assert.deepEqual(out.categories, ["2022", "2023", "2024"]);
  assert.deepEqual(out.series, [{ name: "Revenue", values: [10, 14, 19] }, { name: "Cost", values: [4, 6, 7] }]);
  assert.deepEqual(out.notes, ["left out (no numbers): Notes"]);
});

test("years across the top are a header, and headerless data is still charted", () => {
  const years = chartFromText("Region,2023,2024\nNorth,5,6\nSouth,7,8");
  assert.deepEqual(years.series.map((s) => s.name), ["2023", "2024"]);
  assert.deepEqual(years.categories, ["North", "South"]);
  const bare = chartFromText("North\t5\nSouth\t7");
  assert.deepEqual(bare.categories, ["North", "South"]);
  assert.deepEqual(bare.series, [{ name: "Series 1", values: [5, 7] }]);
});

test("unreadable data is refused with the cell named", () => {
  assert.match(chartFromText("Year,Revenue\n2022,10\n2023,").error, /"Revenue", 2023: the cell is empty/);
  assert.match(chartFromText("Year,Revenue\n2022,10\n2023,lots").error, /"Revenue", 2023: "lots" is not a number/);
  assert.match(chartFromText("Name,Team\nAna,Red").error, /no column holds numbers/);
  assert.match(chartFromText("just one column\nx").error, /label column/);
  assert.match(chartFromText("").error, /no data/);
  const tall = ["k,v", ...Array.from({ length: 41 }, (_, i) => `r${i},${i}`)].join("\n");
  assert.match(chartFromText(tall).error, /41 rows/);
});
