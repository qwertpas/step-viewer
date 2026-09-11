import test from "node:test";
import assert from "node:assert/strict";
import { nameNodes } from "../src/names.js";

const body = (name = "COMPOUND", meshes = [0]) => ({ name, meshes, children: [] });
const group = (name, children) => ({ name, meshes: [], children });
const geometries = [{ name: "COMPOUND" }, { name: "Body1" }, { name: "Housing" }];

test("generic bodies use assembly paths and stable body indices", () => {
  const source = [group("robothand_2 v64", [group("indexMCP", [group("DS355CLHVxCustom v20", [body("COMPOUND", [0, 1]), body()])])])];
  const result = nameNodes(source, geometries);
  const servo = result[0].children[0].children[0];
  assert.equal(servo.name, "DS355CLHVxCustom v20");
  assert.equal(servo.children[0].name, "indexMCP_DS355CLHVxCustom_v20_1");
  assert.deepEqual(servo.children[0].bodyNames, ["indexMCP_DS355CLHVxCustom_v20_1_1", "indexMCP_DS355CLHVxCustom_v20_1_2"]);
  assert.deepEqual(servo.children[1].bodyNames, ["indexMCP_DS355CLHVxCustom_v20_2"]);
  assert.equal(source[0].children[0].children[0].children[0].name, "COMPOUND");
});

test("specific geometry names are used when assembly names are generic", () => {
  assert.equal(nameNodes([body("COMPOUND", [2])], geometries)[0].name, "Housing");
  assert.equal(nameNodes([body("Motor")], geometries)[0].name, "Motor");
});

test("repeated instances and entirely unnamed files get stable distinct paths", () => {
  const nodes = nameNodes([group("Hand", [group("Motor", [body()]), group("Motor", [body()])])], geometries);
  assert.deepEqual(nodes[0].children.map((n) => n.children[0].bodyNames[0]), ["Motor_1_1", "Motor_2_1"]);
  assert.equal(nameNodes([body("")], geometries, "test model.step")[0].name, "test_model_1");
});
