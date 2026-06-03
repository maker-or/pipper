// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  componentRegistryEntries,
  findNearestRegisteredComponent,
  getRegisteredComponent,
} from "./componentSelection";

describe("component selection registry", () => {
  it("stays in sync with component-registry.json", () => {
    const registryPath = resolve(process.cwd(), "component-registry.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Array<{ id: string }>;

    expect(componentRegistryEntries.map((entry) => entry.id)).toEqual(
      registry.map((entry) => entry.id),
    );
  });

  it("resolves the nearest registered data-pipper-id ancestor", () => {
    document.body.innerHTML = `
      <section data-pipper-id="chat-composer">
        <button id="target">Send</button>
      </section>
    `;

    const target = document.getElementById("target");
    const component = findNearestRegisteredComponent(target);

    expect(component?.entry.id).toBe("chat-composer");
    expect(component?.element.dataset.pipperId).toBe("chat-composer");
  });

  it("ignores data-pipper-id values that are not present in the registry", () => {
    document.body.innerHTML = `
      <section data-pipper-id="unknown-component">
        <button id="target">Send</button>
      </section>
    `;

    expect(findNearestRegisteredComponent(document.getElementById("target"))).toBeNull();
    expect(getRegisteredComponent("unknown-component")).toBeNull();
  });
});
