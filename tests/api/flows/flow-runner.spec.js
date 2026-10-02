// @ts-check

// Runs every *.flow.json file in this folder as one test.
//
// A flow links steps from different method folders into one end-to-end scenario,
// e.g. POST create user → GET check it → DELETE it → GET confirms it's gone.
// Each step appears as its own numbered step in the reports.
//
// Flow file format (see docs/13-api-flows.md for the full guide):
// {
//   "name": "User lifecycle",                       test title
//   "tags": ["@crud"],                              optional extra tags (@flow is added automatically)
//   "steps": [
//     { "step": "POST create user",                 a step name from any *.steps.js file
//       "with": { "name": "User {{unique}}", ... }, parameters; {{variables}} are filled in
//       "save": { "userId": "id" },                 save values from the result for later steps
//       "expect": { "status": "active" },           optional: the result must contain these values
//       "auth": false }                             optional: send without a token
//   ]
// }

import fs from 'fs';
import path from 'path';
import { test, expect, unique } from '../support/fixtures';
import { runStep } from '../support/steps';

const FLOW_DIR = __dirname;
const VARIABLE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Replaces {{variables}} in strings, objects and arrays.
 * A string that is exactly "{{name}}" keeps the variable's type (e.g. a number id).
 * @param {any} value
 * @param {Record<string, any>} vars
 */
function fill(value, vars) {
  if (typeof value === 'string') {
    const lookup = (name) => {
      if (!(name in vars)) throw new Error(`Unknown variable {{${name}}}. Known variables: ${Object.keys(vars).join(', ')}`);
      return vars[name];
    };
    const whole = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (whole) return lookup(whole[1]);
    return value.replace(VARIABLE, (_, name) => String(lookup(name)));
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  return value;
}

/** Reads a value from a result by path: "id", "data.0.email". "" means the whole result. */
function pick(result, from) {
  if (!from) return result;
  return from.split('.').reduce((obj, key) => (obj == null ? undefined : obj[key]), result);
}

const files = fs.readdirSync(FLOW_DIR).filter((f) => f.endsWith('.flow.json')).sort();

for (const file of files) {
  /** @type {any} */
  let flow;
  try {
    flow = JSON.parse(fs.readFileSync(path.join(FLOW_DIR, file), 'utf-8'));
  } catch (error) {
    // A broken flow file fails its own test instead of stopping the whole run.
    test(`flow file ${file} is valid`, { tag: '@flow' }, () => {
      throw new Error(`Could not read ${file}: ${/** @type {Error} */ (error).message}`);
    });
    continue;
  }

  const tags = ['@flow', ...(flow.tags ?? [])];
  test(flow.name ?? file, { tag: tags, annotation: { type: 'flow file', description: `tests/api/flows/${file}` } }, async ({ api, anonApi }) => {
    expect(Array.isArray(flow.steps) && flow.steps.length > 0, `${file} needs a non-empty "steps" list`).toBe(true);

    // {{unique}} is the same for the whole flow, so values built from it stay linked.
    /** @type {Record<string, any>} */
    const vars = { unique: unique() };

    for (const [index, step] of flow.steps.entries()) {
      await test.step(`${index + 1}. ${step.step}`, async () => {
        const params = fill(step.with ?? {}, vars);
        const result = await runStep(step.step, step.auth === false ? anonApi : api, params);

        if (step.expect) {
          expect(result, `result of step ${index + 1} (${step.step})`).toMatchObject(fill(step.expect, vars));
        }
        for (const [name, from] of Object.entries(step.save ?? {})) {
          const value = pick(result, from);
          if (value === undefined) throw new Error(`Step ${index + 1} (${step.step}): nothing at "${from}" to save as {{${name}}}`);
          vars[name] = value;
        }
      });
    }
  });
}
