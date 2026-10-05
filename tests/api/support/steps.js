// @ts-check

// The step registry: every reusable step from every method folder, by name.
// This is what lets flows link tests across method folders: a flow lists step
// names ("POST create user", "GET user by id", "DELETE user", ...) and this file
// finds the code for each one.
//
// When you add a new steps file in a method folder, import it here and add it to GROUPS.

import { getSteps } from '../get/users.get.steps';
import { postSteps } from '../post/users.post.steps';
import { putSteps } from '../put/users.put.steps';
import { patchSteps } from '../patch/users.patch.steps';
import { deleteSteps } from '../delete/users.delete.steps';
import { headSteps } from '../head/users.head.steps';
import { optionsSteps } from '../options/users.options.steps';

/** @typedef {(api: import('@playwright/test').APIRequestContext, params?: any) => Promise<any>} Step */

const GROUPS = [getSteps, postSteps, putSteps, patchSteps, deleteSteps, headSteps, optionsSteps];

/** @type {Record<string, Step>} */
const STEPS = {};
for (const group of GROUPS) {
  for (const [name, step] of Object.entries(group)) {
    if (STEPS[name]) throw new Error(`Two steps are named "${name}". Step names must be unique across all method folders.`);
    STEPS[name] = step;
  }
}

/**
 * Runs a step by name.
 * @param {string} name
 * @param {import('@playwright/test').APIRequestContext} api
 * @param {any} [params]
 */
export async function runStep(name, api, params) {
  const step = STEPS[name];
  if (!step) {
    throw new Error(`Unknown step "${name}". Available steps:\n${Object.keys(STEPS).map((s) => `  - ${s}`).join('\n')}`);
  }
  return step(api, params);
}
