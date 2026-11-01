import { describe, expect, it } from "vitest";
import { assertQaFixtureEnvironment } from "./seed-guard";

const unsafeEnvironments: NodeJS.ProcessEnv[] = [
  { NODE_ENV: "production", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/Citizavrexo-qa.db" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "https://citizavrexo.com", DATABASE_URL: "file:./data/Citizavrexo-qa.db" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:/var/data/Citizavrexo-qa.db", RENDER: "true" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:../Citizavrexo-qa.db" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/Citizavrexo.db" },
  { NODE_ENV: "development", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/Citizavrexo-qa.db" },
];

describe("QA fixture production guard", () => {
  it("accepts only the explicit localhost QA database", () => {
    expect(assertQaFixtureEnvironment({ NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/Citizavrexo-qa.db" })).toMatch(/Citizavrexo-qa\.db$/);
  });

  it.each(unsafeEnvironments)("rejects unsafe environment %#", (environment) => {
    expect(() => assertQaFixtureEnvironment(environment)).toThrow();
  });
});
