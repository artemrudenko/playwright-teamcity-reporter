import { FullConfig, TestError } from '@playwright/test';
import { Suite, TestCase, TestResult } from '@playwright/test/reporter';

import TeamcityReporter from './teamcity.reporter';

describe(`TeamcityReporter`, () => {
  let reporter: TeamcityReporter;
  let projectSuite: Suite;
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
    titlePath: jest.fn(),
    allTests: jest.fn(),
    project: jest.fn(),
    ...suite
  });
  const initTestData = () => {
    projectSuite = getSuite({ title: 'projectSuite' });
    const fileSuiteA = getSuite({ title: 'fileSuiteA', parent: projectSuite });
    projectSuite.suites.push(fileSuiteA);
    const storySuiteA = getSuite({ title: 'storySuiteA', parent: fileSuiteA });
    fileSuiteA.suites.push(storySuiteA);
    testFromSuiteA = {
      title: 'testFromSuiteA',
      results: [{ status: 'passed', startTime: new Date(), duration: 1 }],
      parent: storySuiteA
    } as TestCase;
    storySuiteA.tests.push(testFromSuiteA);
    const fileSuiteB = getSuite({ title: 'fileSuiteB', parent: projectSuite });
    projectSuite.suites.push(fileSuiteB);
    const storySuiteB = getSuite({ title: 'storySuiteB', parent: fileSuiteB });
    fileSuiteB.suites.push(storySuiteB);
    testFromSuiteB = {
      title: 'testFromSuiteB',
      results: [{ status: 'passed', startTime: new Date(), duration: 2 }],
      parent: storySuiteB
    } as TestCase;
    storySuiteB.tests.push(testFromSuiteB);
  };

  beforeAll(() => {
    jest.spyOn(global.console, 'log');
    jest.spyOn(global.console, 'info');
    jest.spyOn(global.console, 'error');
  });

  beforeEach(() => {
    initTestData();

    reporter = new TeamcityReporter();

    jest.clearAllMocks();
  });

  test(`should log test error to console on error`, () => {
    const error: TestError = { message: 'SomeError message' };

    reporter.onError(error);

    expect(global.console.error)
      .toBeCalledWith(error);
  });

  test(`should store suite on run begin`, () => {
    reporter.onBegin(config, projectSuite);

    expect(reporter)
      .toMatchObject({
        flowId: expect.any(String),
        rootSuite: projectSuite,
      });
  });

  test('should log configuration to console on run begin', () => {
    reporter.onBegin(config, projectSuite);

    expect(console.log)
      .toHaveBeenCalledWith(expect.stringContaining(`message text='${JSON.stringify(config, undefined, 2)}'`));
  });

  describe(`when tests executed with single worker`, () => {
    test('should reports test results continuously with a single worker', () => {
      reporter.onBegin({ ...config, workers: 1 }, projectSuite);
      jest.clearAllMocks();

      reporter.onTestBegin(testFromSuiteA);
      testFromSuiteA.results.push({ status: 'passed', startTime: new Date(), duration: 1 } as TestResult);
      expect(console.log)
        .not.toHaveBeenCalled();

      reporter.onTestBegin(testFromSuiteB);
      testFromSuiteB.results.push({ status: 'passed', startTime: new Date(), duration: 2 } as TestResult);

      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testSuiteStarted name='${testFromSuiteA.parent.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(2, expect.stringContaining(`testStarted name='${testFromSuiteA.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(3, expect.stringContaining(`testFinished name='${testFromSuiteA.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(4, expect.stringContaining(`testSuiteFinished name='${testFromSuiteA.parent.title}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(4);

      reporter.onEnd({ status: 'passed' });
      expect(console.log)
        .toHaveBeenNthCalledWith(5, expect.stringContaining(`testSuiteStarted name='${testFromSuiteB.parent.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(6, expect.stringContaining(`testStarted name='${testFromSuiteB.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(7, expect.stringContaining(`testFinished name='${testFromSuiteB.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(8, expect.stringContaining(`testSuiteFinished name='${testFromSuiteB.parent.title}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(8);
    });
  });

  describe(`when tests executed with multiple workers`, () => {
    test('should reports test results only at the end with multiple workers', () => {
      reporter.onBegin(config, projectSuite);
      expect(console.info)
        .toHaveBeenCalledWith('Playwright is running suites in multiple workers. The results will be reported after all of them finish.');

      jest.clearAllMocks();

      reporter.onTestBegin(testFromSuiteA);
      testFromSuiteA.results.push({ status: 'passed', startTime: new Date(), duration: 1 } as TestResult);
      expect(console.log)
        .not.toHaveBeenCalled();

      reporter.onTestBegin(testFromSuiteB);
      testFromSuiteB.results.push({ status: 'passed', startTime: new Date(), duration: 2 } as TestResult);
      expect(console.log)
        .not.toHaveBeenCalled();

      reporter.onEnd({ status: 'passed' });

      expect(console.log)
        .toHaveBeenNthCalledWith(1, expect.stringContaining(`testSuiteStarted name='${testFromSuiteA.parent.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(2, expect.stringContaining(`testStarted name='${testFromSuiteA.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(3, expect.stringContaining(`testFinished name='${testFromSuiteA.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(4, expect.stringContaining(`testSuiteFinished name='${testFromSuiteA.parent.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(5, expect.stringContaining(`testSuiteStarted name='${testFromSuiteB.parent.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(6, expect.stringContaining(`testStarted name='${testFromSuiteB.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(7, expect.stringContaining(`testFinished name='${testFromSuiteB.title}'`));
      expect(console.log)
        .toHaveBeenNthCalledWith(8, expect.stringContaining(`testSuiteFinished name='${testFromSuiteB.parent.title}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(8);
    });
  });

});
