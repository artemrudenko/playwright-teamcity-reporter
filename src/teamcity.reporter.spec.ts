import { FullConfig, TestError } from '@playwright/test';
import { Suite, TestResult, TestCase } from '@playwright/test/reporter';

import TeamcityReporter from './teamcity.reporter';

const consoleLogSpy = jest.spyOn(global.console, 'log');
const consoleInfoSpy = jest.spyOn(global.console, 'info');
const consoleErrorSpy = jest.spyOn(global.console, 'error');

afterEach(() => {
  consoleLogSpy.mockReset();
  consoleInfoSpy.mockReset();
  consoleErrorSpy.mockReset();
});

describe(`TeamcityReporter`, () => {
  test(`should log test error to console on error`, () => {
    const error: TestError = { message: 'SomeError message' };

    new TeamcityReporter().onError(error);
    expect(global.console.error)
      .toBeCalledWith(error);
  });

  test(`should store suite on run begin`, () => {
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
    const rootSuite: Suite = {
      location: undefined,
      parent: undefined,
      suites: [],
      tests: [],
      title: '',
      titlePath: jest.fn(),
      allTests: jest.fn(),
      project: jest.fn()
    };

    const reporter = new TeamcityReporter();
    reporter.onBegin(config, rootSuite);

    expect(reporter).toMatchObject({
      flowId: expect.any(String),
      rootSuite,
    });
  });

  test('log configuration to console on run begin', () => {
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
    const suite: Suite = {
      location: undefined,
      parent: undefined,
      suites: [],
      tests: [],
      title: '',
      titlePath: jest.fn(),
      allTests: jest.fn(),
      project: jest.fn()
    };

    const reporter = new TeamcityReporter();
    reporter.onBegin(config, suite);

    expect(console.info).toHaveBeenCalledWith(`'${JSON.stringify(config)}'`);
  });

  test('reports test results continuously with a single worker', () => {
    const test1 = {
      title: 'test1',
      results: [{
        status: 'passed',
        startTime: new Date(),
        duration: 1,
      } as TestResult],
    } as TestCase;
    const test2 = {
      title: 'test2',
      results: [{
        status: 'passed',
        startTime: new Date(),
        duration: 2,
      } as TestResult],
    } as TestCase;

    const suite1 = {
      title: 'suite1',
      tests: [test1],
      suites: [] as Suite[],
    } as Suite;
    const suite2 = {
      title: 'suite2',
      tests: [test2],
      suites: [] as Suite[],
    } as Suite;
    test1.parent = suite1;
    test2.parent = suite2;

    const rootSuite = {
      suites: [ { suites: [suite1, suite2] } as Suite ],
    } as Suite;
    suite1.parent = { parent: rootSuite } as Suite;
    suite2.parent = { parent: rootSuite } as Suite;

    const reporter = new TeamcityReporter();

    reporter.onBegin({ workers: 1 } as FullConfig, rootSuite);

    reporter.onTestBegin(test1);
    expect(console.log).not.toHaveBeenCalled();

    reporter.onTestBegin(test2);
    expect(console.log).toHaveBeenNthCalledWith(1, expect.stringContaining(`testSuiteStarted name='${test1.parent.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(2, expect.stringContaining(`testStarted name='${test1.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(3, expect.stringContaining(`testFinished name='${test1.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(4, expect.stringContaining(`testSuiteFinished name='${test1.parent.title}'`));
    expect(console.log).toHaveBeenCalledTimes(4);

    reporter.onEnd({ status: 'passed' });
    expect(console.log).toHaveBeenNthCalledWith(5, expect.stringContaining(`testSuiteStarted name='${test2.parent.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(6, expect.stringContaining(`testStarted name='${test2.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(7, expect.stringContaining(`testFinished name='${test2.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(8, expect.stringContaining(`testSuiteFinished name='${test2.parent.title}'`));
    expect(console.log).toHaveBeenCalledTimes(8);
  });

  test('reports test results only at the end with multiple workers', () => {
    const test1 = {
      title: 'test1',
      results: [{
        status: 'passed',
        startTime: new Date(),
        duration: 1,
      } as TestResult],
    } as TestCase;
    const test2 = {
      title: 'test2',
      results: [{
        status: 'passed',
        startTime: new Date(),
        duration: 2,
      } as TestResult],
    } as TestCase;

    const suite1 = {
      title: 'suite1',
      tests: [test1],
      suites: [] as Suite[],
    } as Suite;
    const suite2 = {
      title: 'suite2',
      tests: [test2],
      suites: [] as Suite[],
    } as Suite;
    test1.parent = suite1;
    test2.parent = suite2;

    const rootSuite = {
      suites: [ { suites: [suite1, suite2] } as Suite ],
    } as Suite;
    suite1.parent = { parent: rootSuite } as Suite;
    suite2.parent = { parent: rootSuite } as Suite;

    const reporter = new TeamcityReporter();

    reporter.onBegin({} as FullConfig, rootSuite);
    expect(console.info).toHaveBeenCalledWith('Playwright is running suites in multiple workers. The results will be reported after all of them finish.');

    reporter.onTestBegin(test1);
    expect(console.log).not.toHaveBeenCalled();

    reporter.onTestBegin(test2);
    expect(console.log).not.toHaveBeenCalled();

    reporter.onEnd({ status: 'passed' });
    expect(console.log).toHaveBeenNthCalledWith(1, expect.stringContaining(`testSuiteStarted name='${test1.parent.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(2, expect.stringContaining(`testStarted name='${test1.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(3, expect.stringContaining(`testFinished name='${test1.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(4, expect.stringContaining(`testSuiteFinished name='${test1.parent.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(5, expect.stringContaining(`testSuiteStarted name='${test2.parent.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(6, expect.stringContaining(`testStarted name='${test2.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(7, expect.stringContaining(`testFinished name='${test2.title}'`));
    expect(console.log).toHaveBeenNthCalledWith(8, expect.stringContaining(`testSuiteFinished name='${test2.parent.title}'`));
    expect(console.log).toHaveBeenCalledTimes(8);
  });
});
