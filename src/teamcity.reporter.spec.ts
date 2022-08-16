import { FullConfig, FullProject, TestError } from '@playwright/test';
import { Suite, TestCase, TestResult } from '@playwright/test/reporter';

import TeamcityReporter, { escape, testName } from './teamcity.reporter';
import { stringify } from './utils';

function titlePath(this: TestCase | Suite) {
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
    webServer: null
  };

  const getSuite = (suite: Partial<Suite> = {}): Suite => ({
    suites: [],
    tests: [],
    title: '',
    titlePath: titlePath,
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
      titlePath,
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
      titlePath,
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

    test(`should store suite on begin`, () => {
      reporter.onBegin(config, projectSuite);

      expect(reporter)
        .toMatchObject({
          flowId: expect.any(String),
          rootSuite: projectSuite,
        });
    });

    test('should not log configuration to console on begin by default', () => {
      reporter.onBegin(config, projectSuite);

      expect(console.log)
        .not.toHaveBeenCalledWith(expect.stringContaining(`message text='${escape(stringify(config))}'`));
    });

    describe('Modes::', () => {
      test('should reports test results continuously when tests executed with single worker', () => {
        reporter.onBegin({ ...config, workers: 1 }, projectSuite);
        jest.clearAllMocks();

        reporter.onTestBegin(testFromSuiteA);
        testFromSuiteA.results = [{ status: 'passed', startTime: new Date(), duration: 1 } as TestResult];
        expect(console.log)
          .not.toHaveBeenCalled();

        reporter.onTestBegin(testFromSuiteB);
        testFromSuiteB.results = [{ status: 'passed', startTime: new Date(), duration: 2 } as TestResult];

        expect(console.log)
          .toHaveBeenNthCalledWith(1, expect.stringContaining(`testStarted name='${testName(testFromSuiteA)}'`));
        expect(console.log)
          .toHaveBeenNthCalledWith(2, expect.stringContaining(`testFinished name='${testName(testFromSuiteA)}'`));
        expect(console.log)
          .toHaveBeenCalledTimes(2);

        reporter.onEnd({ status: 'passed' });
        expect(console.log)
          .toHaveBeenNthCalledWith(3, expect.stringContaining(`testStarted name='${testName(testFromSuiteB)}'`));
        expect(console.log)
          .toHaveBeenNthCalledWith(4, expect.stringContaining(`testFinished name='${testName(testFromSuiteB)}'`));
        expect(console.log)
          .toHaveBeenCalledTimes(4);
      });

      test('should reports test results only at the end with multiple workers', () => {
        reporter.onBegin(config, projectSuite);
        expect(console.info)
          .toHaveBeenCalledWith('Playwright is running suites in multiple workers. The results will be reported after all of them finish.');

        jest.clearAllMocks();

        reporter.onTestBegin(testFromSuiteA);
        testFromSuiteA.results = [{ status: 'passed', startTime: new Date(), duration: 1 } as TestResult];
        expect(console.log)
          .not.toHaveBeenCalled();

        reporter.onTestBegin(testFromSuiteB);
        testFromSuiteB.results = [{ status: 'passed', startTime: new Date(), duration: 2 } as TestResult];
        expect(console.log)
          .not.toHaveBeenCalled();

        reporter.onEnd({ status: 'passed' });

        expect(console.log)
          .toHaveBeenNthCalledWith(1, expect.stringContaining(`testStarted name='${testName(testFromSuiteA)}'`));
        expect(console.log)
          .toHaveBeenNthCalledWith(2, expect.stringContaining(`testFinished name='${testName(testFromSuiteA)}'`));
        expect(console.log)
          .toHaveBeenNthCalledWith(3, expect.stringContaining(`testStarted name='${testName(testFromSuiteB)}'`));
        expect(console.log)
          .toHaveBeenNthCalledWith(4, expect.stringContaining(`testFinished name='${testName(testFromSuiteB)}'`));
        expect(console.log)
          .toHaveBeenCalledTimes(4);
      });
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

      reporter.onBegin(configWithRetries, projectSuite);
      expect(console.log)
        .toHaveBeenLastCalledWith(expect.stringContaining(`testRetrySupport enabled='true'`));

      jest.clearAllMocks();

      reporter.onTestBegin(testFromSuiteA);
      reporter.onEnd({ status: 'passed' });

      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testStarted name='${testName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(2, expect.stringContaining(`testFailed name='${testName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(3, expect.stringContaining(`testFinished name='${testName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(4, expect.stringContaining(`testStarted name='${testName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(5, expect.stringContaining(`testFinished name='${testName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(5);
    });
  });

  describe(`Custom Configuration::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter({ logConfig: true });
      jest.clearAllMocks();
    });

    test('should log configuration to console on begin if requested', () => {
      reporter.onBegin(config, projectSuite);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`message text='${escape(stringify(config))}'`));
    });
  });
});
