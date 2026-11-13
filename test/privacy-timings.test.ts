// SPDX-License-Identifier: Apache-2.0
// The times PRIVACY.md promises are the times the code uses. A change to one of the constants
// below fails here until PRIVACY.md says the new time (and the other way round).
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { IDLE_UNLOAD_MS, SETTINGS_REFRESH_MS } from "../src/constants.js";
import { MAX_REST_MS, POINTER_GRACE_MS, READING_LINGER_MS } from "../vendor/cardvision-browser/page-capture.js";

const privacy = readFileSync(new URL("../PRIVACY.md", import.meta.url), "utf-8").replace(/\s+/g, " ");
const seconds = (ms: number) => ms / 1000;

describe("PRIVACY.md's times match the code", () => {
  it("reads the picture for 10 seconds after the pointer last moved (the pointer grace)", () => {
    expect(seconds(POINTER_GRACE_MS)).toBe(10);
    expect(privacy).toContain(`for ${seconds(POINTER_GRACE_MS)} seconds after the pointer last moved there`);
  });

  it("keeps reading until 5 seconds after a card stops showing (the reading linger)", () => {
    expect(seconds(READING_LINGER_MS)).toBe(5);
    expect(privacy).toContain(`until ${seconds(READING_LINGER_MS)} seconds after it stops showing`);
  });

  it("never reads more than 60 seconds after the pointer last moved (the rest limit)", () => {
    expect(seconds(MAX_REST_MS)).toBe(60);
    expect(privacy).toContain(`never more than ${seconds(MAX_REST_MS)} seconds after the pointer last moved`);
  });

  it("reads one picture when the model finishes loading after the pointer grace, within the rest limit (the slow start)", () => {
    expect(privacy).toContain(
      `If card recognition finishes loading after those ${seconds(POINTER_GRACE_MS)} seconds while the pointer still rests over the video, it reads one picture then, still within ${seconds(MAX_REST_MS)} seconds of the pointer's last move; if that picture shows no card, nothing more is read until the pointer moves.`,
    );
  });

  it("unloads card hovers after 10 idle minutes", () => {
    expect(IDLE_UNLOAD_MS / 60_000).toBe(10);
    expect(privacy).toContain(`After ${IDLE_UNLOAD_MS / 60_000} minutes in which the pointer has not moved over the video`);
  });

  it("checks the settings file at most once an hour", () => {
    expect(SETTINGS_REFRESH_MS).toBe(60 * 60 * 1000);
    expect(privacy).toContain("checked at most once an hour");
  });
});
