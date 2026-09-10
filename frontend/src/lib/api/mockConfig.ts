/**
 * Per-endpoint mock scenario switches (ticket #38).
 *
 * Every handler reads its scenario before responding, so a screen can preview
 * its loading, empty and error states without touching component code:
 *
 *   mockConfig.patients.list.latency = 800;    // slow network
 *   mockConfig.patients.list.emptyResult = true; // empty state
 *   mockConfig.patients.list.errorRate = 1;    // deterministic error state
 *
 * Call `resetMockConfig()` between tests so one test's scenario never leaks
 * into the next.
 */

export interface Scenario {
  /** Artificial latency in milliseconds. */
  latency: number;
  /** Probability in [0, 1] that the handler returns a forced error. */
  errorRate: number;
  /** Return an empty payload (empty list / null object). */
  emptyResult: boolean;
}

export interface MockConfig {
  patients: {
    list: Scenario;
    detail: Scenario;
    create: Scenario;
    update: Scenario;
    timeline: Scenario;
  };
  appointments: {
    list: Scenario;
    create: Scenario;
    checkIn: Scenario;
  };
  records: {
    visits: Scenario;
    createVisit: Scenario;
  };
  vitals: {
    list: Scenario;
    create: Scenario;
  };
  invoices: {
    list: Scenario;
    create: Scenario;
    payment: Scenario;
  };
  permissions: {
    get: Scenario;
    put: Scenario;
  };
  widgets: {
    me: Scenario;
    saveMe: Scenario;
    library: Scenario;
    update: Scenario;
  };
  auth: {
    me: Scenario;
    users: Scenario;
    createUser: Scenario;
  };
  audit: {
    list: Scenario;
  };
}

function scenario(): Scenario {
  return { latency: 0, errorRate: 0, emptyResult: false };
}

export function createDefaultMockConfig(): MockConfig {
  return {
    patients: {
      list: scenario(),
      detail: scenario(),
      create: scenario(),
      update: scenario(),
      timeline: scenario(),
    },
    appointments: { list: scenario(), create: scenario(), checkIn: scenario() },
    records: { visits: scenario(), createVisit: scenario() },
    vitals: { list: scenario(), create: scenario() },
    invoices: { list: scenario(), create: scenario(), payment: scenario() },
    permissions: { get: scenario(), put: scenario() },
    widgets: { me: scenario(), saveMe: scenario(), library: scenario(), update: scenario() },
    auth: { me: scenario(), users: scenario(), createUser: scenario() },
    audit: { list: scenario() },
  };
}

export const mockConfig: MockConfig = createDefaultMockConfig();

/** Restore every scenario switch to its default (latency 0, no error, no empty). */
export function resetMockConfig(): void {
  const defaults = createDefaultMockConfig();
  for (const resource of Object.keys(defaults) as Array<keyof MockConfig>) {
    const target = mockConfig[resource] as Record<string, Scenario>;
    const source = defaults[resource] as Record<string, Scenario>;
    for (const operation of Object.keys(source)) {
      Object.assign(target[operation], source[operation]);
    }
  }
}
