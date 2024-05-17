import { FullConfig, FullProject } from '@playwright/test';
import { Suite, TestCase, TestError, TestResult } from '@playwright/test/reporter';

import TeamcityReporter from './teamcity.reporter';
import { stringify, escape, getTestName } from './utils';

function getTitle(this: TestCase | Suite) {
  return this.parent
    ? [...this.parent.titlePath(), this.title]
    : [this.title];
}

describe(`TeamcityReporter`, () => {
  let reporter: TeamcityReporter;
  let projectSuite: Suite;
  let fileSuiteA: Suite;
  let fileSuiteB: Suite;
  let testFromSuiteA: TestCase;
  let testFromSuiteB: TestCase;

  const config: FullConfig = {
    forbidOnly: false,
    globalSetup: null,
    globalTeardown: null,
    globalTimeout: 0,
    grep: [],
    grepInvert: null,
    maxFailures: 0,
    preserveOutput: "never",
    projects: [],
    reporter: [],
    reportSlowTests: null,
    rootDir: "MOCK_PATH",
    quiet: false,
    shard: null,
    updateSnapshots: "none",
    version: "MOCK_VERSION",
    workers: 4,
    webServer: null,
    fullyParallel: false,
    metadata: {}
  };

  const getSuite = (suite: Partial<Suite> = {}): Suite => ({
    suites: [],
    entries: jest.fn(() => []),
    tests: [],
    title: '',
    type: 'project',
    titlePath: getTitle,
    allTests: jest.fn(),
    project: jest.fn(),
    ...suite
  });
  const initTestData = () => {
    // https://playwright.dev/docs/api/class-suite#suite-title
    const rootSuite = getSuite({});
    projectSuite = getSuite({ title: 'projectSuite', parent: rootSuite });
    fileSuiteA = getSuite({ title: 'fileSuiteA', parent: projectSuite });
    projectSuite.suites.push(fileSuiteA);
    const storySuiteA = getSuite({ title: 'storySuiteA', parent: fileSuiteA });
    fileSuiteA.suites.push(storySuiteA);
    testFromSuiteA = {
      title: 'testFromSuiteA',
      results: [{ status: 'passed', startTime: new Date(), duration: 1 }],
      parent: storySuiteA,
      titlePath: getTitle,
    } as TestCase;
    storySuiteA.tests.push(testFromSuiteA);
    fileSuiteB = getSuite({ title: 'fileSuiteB', parent: projectSuite });
    projectSuite.suites.push(fileSuiteB);
    const storySuiteB = getSuite({ title: 'storySuiteB', parent: fileSuiteB });
    fileSuiteB.suites.push(storySuiteB);
    testFromSuiteB = {
      title: 'testFromSuiteB',
      results: [{ status: 'passed', startTime: new Date(), duration: 2 }],
      parent: storySuiteB,
      titlePath: getTitle,
    } as TestCase;
    storySuiteB.tests.push(testFromSuiteB);
  };

  beforeAll(() => {
    jest.spyOn(global.console, 'log');
    jest.spyOn(global.console, 'info');
    jest.spyOn(global.console, 'error');
  });

  beforeEach(() => initTestData());

  describe(`Default Configuration::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter();
      jest.clearAllMocks();
    });

    test(`should log test error to console on error`, () => {
      const error: TestError = { message: 'SomeError message' };

      reporter.onError(error);

      expect(global.console.error)
        .toBeCalledWith(error);
    });

    test('should not log configuration to console on begin by default', () => {
      reporter.onBegin(config);

      expect(console.log)
        .not.toHaveBeenCalledWith(
          expect.stringContaining(`message text='${escape(stringify(config))}'`)
        );
    });

    test('should reports test results continuously', () => {
      reporter.onBegin({ ...config, workers: 2 });

      jest.clearAllMocks();
      reporter.onTestBegin(testFromSuiteA);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testStarted name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      testFromSuiteA.results = [{ status: 'passed', startTime: new Date(), duration: 1 } as TestResult];
      reporter.onTestEnd(testFromSuiteA, testFromSuiteA.results[0]);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testFinished name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      reporter.onTestBegin(testFromSuiteB);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testStarted name='${getTestName(testFromSuiteB)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      testFromSuiteB.results = [{ status: 'passed', startTime: new Date(), duration: 2 } as TestResult];
      reporter.onTestEnd(testFromSuiteB, testFromSuiteB.results[0]);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testFinished name='${getTestName(testFromSuiteB)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      reporter.onEnd({
        status: 'passed',
        startTime: new Date(),
        duration: 1000
      });
      expect(console.log)
        .not.toHaveBeenCalled();
    });

    test(`should allow user to enable test retry`, () => {
      const configWithRetries: FullConfig = {
        ...config,
        projects: [{ retries: 1 } as FullProject]
      };
      projectSuite.suites = [fileSuiteA];
      testFromSuiteA.results = [
        { status: 'failed', startTime: new Date(), duration: 1 } as TestResult,
        { status: 'passed', startTime: new Date(), duration: 1 } as TestResult
      ];

      reporter.onBegin(configWithRetries);
      expect(console.log)
        .toHaveBeenLastCalledWith(expect.stringContaining(`testRetrySupport enabled='true'`));

      jest.clearAllMocks();
      reporter.onTestBegin(testFromSuiteA);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testStarted name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      reporter.onTestEnd(testFromSuiteA, testFromSuiteA.results[0]);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testFailed name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(2, expect.stringContaining(`testFinished name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(2);

      jest.clearAllMocks();
      reporter.onTestEnd(testFromSuiteA, testFromSuiteA.results[1]);
      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testFinished name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      reporter.onEnd({
        status: 'passed',
        startTime: new Date(),
        duration: 1000
      });
      expect(console.log)
        .not.toHaveBeenCalled();
    });
  });

  describe(`Custom Configuration::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter({ logConfig: true });
      jest.clearAllMocks();
    });

    test('should log configuration to console on begin if requested', () => {
      reporter.onBegin(config);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`message text='${escape(stringify(config))}'`));
    });
  });
});
