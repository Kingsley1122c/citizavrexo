import { describe, expect, it } from "vitest";
import { assertQaFixtureEnvironment } from "./seed-guard";

const unsafeEnvironments: NodeJS.ProcessEnv[] = [
  { NODE_ENV: "production", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/nivora-qa.db" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "https://nivoracore.com", DATABASE_URL: "file:./data/nivora-qa.db" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:/var/data/nivora-qa.db", RENDER: "true" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:../nivora-qa.db" },
  { NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/nivora.db" },
  { NODE_ENV: "development", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/nivora-qa.db" },
];

describe("QA fixture production guard", () => {
  it("accepts only the explicit localhost QA database", () => {
    expect(assertQaFixtureEnvironment({ NODE_ENV: "development", QA_FIXTURE_MODE: "local-only", APP_URL: "http://localhost:3011", DATABASE_URL: "file:./data/nivora-qa.db" })).toMatch(/nivora-qa\.db$/);
  });

  it.each(unsafeEnvironments)("rejects unsafe environment %#", (environment) => {
    expect(() => assertQaFixtureEnvironment(environment)).toThrow();
  });
});