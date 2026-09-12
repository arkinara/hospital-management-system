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
    dedupCheck: Scenario;
    clinicalSummary: Scenario;
    prescriptions: Scenario;
  };
  appointments: {
    list: Scenario;
    create: Scenario;
    checkIn: Scenario;
    schedule: Scenario;
  };
  doctorAvailability: {
    get: Scenario;
    update: Scenario;
    block: Scenario;
    deleteBlock: Scenario;
  };
  records: {
    visits: Scenario;
    createVisit: Scenario;
    history: Scenario;
    visit: Scenario;
    reviewQueue: Scenario;
    carePlan: Scenario;
  };
  vitals: {
    list: Scenario;
    create: Scenario;
  };
  invoices: {
    list: Scenario;
    create: Scenario;
    payment: Scenario;
    detail: Scenario;
    claims: Scenario;
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
    definitions: Scenario;
    add: Scenario;
    patchAdmin: Scenario;
    toggleLock: Scenario;
  };
  auth: {
    login: Scenario;
    logout: Scenario;
    me: Scenario;
    users: Scenario;
    createUser: Scenario;
    forgotPassword: Scenario;
    resetPassword: Scenario;
  };
  audit: {
    list: Scenario;
  };
  admin: {
    departments: Scenario;
    user: Scenario;
    usersList: Scenario;
    userPatch: Scenario;
    deactivate: Scenario;
    departmentCreate: Scenario;
    departmentDetail: Scenario;
    departmentCapacity: Scenario;
    departmentStaff: Scenario;
    myPatients: Scenario;
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
      dedupCheck: scenario(),
      clinicalSummary: scenario(),
      prescriptions: scenario(),
    },
    appointments: {
      list: scenario(),
      create: scenario(),
      checkIn: scenario(),
      schedule: scenario(),
    },
    doctorAvailability: {
      get: scenario(),
      update: scenario(),
      block: scenario(),
      deleteBlock: scenario(),
    },
    records: {
      visits: scenario(),
      createVisit: scenario(),
      history: scenario(),
      visit: scenario(),
      reviewQueue: scenario(),
      carePlan: scenario(),
    },
    vitals: { list: scenario(), create: scenario() },
    invoices: {
      list: scenario(),
      create: scenario(),
      payment: scenario(),
      detail: scenario(),
      claims: scenario(),
    },
    permissions: { get: scenario(), put: scenario() },
    widgets: {
      me: scenario(),
      saveMe: scenario(),
      library: scenario(),
      update: scenario(),
      definitions: scenario(),
      add: scenario(),
      patchAdmin: scenario(),
      toggleLock: scenario(),
    },
    auth: {
      login: scenario(),
      logout: scenario(),
      me: scenario(),
      users: scenario(),
      createUser: scenario(),
      forgotPassword: scenario(),
      resetPassword: scenario(),
    },
    audit: { list: scenario() },
    admin: {
      departments: scenario(),
      user: scenario(),
      usersList: scenario(),
      userPatch: scenario(),
      deactivate: scenario(),
      departmentCreate: scenario(),
      departmentDetail: scenario(),
      departmentCapacity: scenario(),
      departmentStaff: scenario(),
      myPatients: scenario(),
    },
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
