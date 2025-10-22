import { FullConfig, FullProject } from "@playwright/test";
import { Suite, TestCase, TestError, TestResult } from "@playwright/test/reporter";

import TeamcityReporter from "./teamcity.reporter";
import { stringify, escape, getTestName } from "./utils";

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
    title: "",
    type: "project",
    titlePath: getTitle,
    allTests: jest.fn(),
    project: jest.fn(),
    ...suite
  });
  const initTestData = () => {
    // https://playwright.dev/docs/api/class-suite#suite-title
    const rootSuite = getSuite({});
    projectSuite = getSuite({ title: "projectSuite", parent: rootSuite });

    fileSuiteA = getSuite({ title: "fileSuiteA", parent: projectSuite });
    projectSuite.suites.push(fileSuiteA);

    const storySuiteA = getSuite({ title: "storySuiteA", parent: fileSuiteA });
    fileSuiteA.suites.push(storySuiteA);

    testFromSuiteA = {
      title: "testFromSuiteA",
      results: [{ status: "passed", startTime: new Date(), duration: 1 }],
      parent: storySuiteA,
      titlePath: getTitle,
    } as TestCase;
    storySuiteA.tests.push(testFromSuiteA);

    fileSuiteB = getSuite({ title: "fileSuiteB", parent: projectSuite });
    projectSuite.suites.push(fileSuiteB);

    const storySuiteB = getSuite({ title: "storySuiteB", parent: fileSuiteB });
    fileSuiteB.suites.push(storySuiteB);

    testFromSuiteB = {
      title: "testFromSuiteB",
      results: [{ status: "passed", startTime: new Date(), duration: 2 }],
      parent: storySuiteB,
      titlePath: getTitle,
    } as TestCase;
    storySuiteB.tests.push(testFromSuiteB);
  };

  beforeAll(() => {
    jest.spyOn(global.console, "log");
    jest.spyOn(global.console, "info");
    jest.spyOn(global.console, "error");
  });

  beforeEach(() => initTestData());

  describe(`Default Configuration::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter();
      jest.clearAllMocks();
    });

    test(`should log test error to console on error`, () => {
      const error: TestError = { message: "SomeError message" };

      reporter.onError(error);

      expect(global.console.error)
        .toBeCalledWith(error);
    });

    test("should not log configuration to console on begin by default", () => {
      reporter.onBegin(config);

      expect(console.log)
        .not.toHaveBeenCalledWith(
          expect.stringContaining(`message text='${escape(stringify(config))}'`)
        );
    });

    test("should reports test results continuously", () => {
      reporter.onBegin({ ...config, workers: 2 });
      jest.clearAllMocks();

      reporter.onTestBegin(testFromSuiteA);
      expect(console.log)
        .toHaveBeenNthCalledWith(1,
          expect.stringContaining(`testStarted name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      testFromSuiteA.results = [
        { status: "passed", startTime: new Date(), duration: 1 } as TestResult
      ];

      reporter.onTestEnd(testFromSuiteA, testFromSuiteA.results[0]);
      expect(console.log)
        .toHaveBeenNthCalledWith(1,
          expect.stringContaining(`testFinished name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      reporter.onTestBegin(testFromSuiteB);
      expect(console.log)
        .toHaveBeenNthCalledWith(1,
          expect.stringContaining(`testStarted name='${getTestName(testFromSuiteB)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      testFromSuiteB.results = [{ status: "passed", startTime: new Date(), duration: 2 } as TestResult];
      reporter.onTestEnd(testFromSuiteB, testFromSuiteB.results[0]);
      expect(console.log)
        .toHaveBeenNthCalledWith(1,
          expect.stringContaining(`testFinished name='${getTestName(testFromSuiteB)}'`));
      expect(console.log)
        .toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      reporter.onEnd({
        status: "passed",
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
        { status: "failed", startTime: new Date(), duration: 1 } as TestResult,
        { status: "passed", startTime: new Date(), duration: 1 } as TestResult
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
        status: "passed",
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

    test("should log configuration to console on begin if requested", () => {
      reporter.onBegin(config);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`message text='${escape(stringify(config))}'`));
    });
  });

  describe(`Test Status Handling::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter();
      reporter.onBegin(config);
      jest.clearAllMocks();
    });

    test("should handle skipped test status", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "skipped",
        startTime: new Date(),
        duration: 0,
        errors: [],
        attachments: []
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testIgnored name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`message='skipped'`));
    });

    test("should handle timedOut test status", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "timedOut",
        startTime: new Date(),
        duration: 30000,
        errors: [
          { message: "Test timeout of 30000ms exceeded" } as TestError
        ],
        error: { message: "Test timeout of 30000ms exceeded" } as TestError,
        attachments: []
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testFailed name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`message='Test timeout of 30000ms exceeded'`));
    });

    test("should handle interrupted test status", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "interrupted",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: []
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testFailed name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`message='Test interrupted'`));
    });
  });

  describe(`Standard Output Handling::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter();
      reporter.onBegin(config);
      jest.clearAllMocks();
    });

    test("should handle stdout with test case", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      reporter.onStdOut("Some console output", testFromSuiteA);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testStdOut name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`out='Some console output'`));
    });

    test("should handle stdout without test case", () => {
      reporter.onStdOut("Global output");

      expect(console.log)
        .toHaveBeenCalledWith("Global output");
    });

    test("should handle stderr with test case", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      reporter.onStdErr("Some error output", testFromSuiteA);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testStdErr name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`out='Some error output'`));
    });

    test("should handle stderr without test case", () => {
      reporter.onStdErr("Global error");

      expect(console.error)
        .toHaveBeenCalledWith("Global error");
    });
  });

  describe(`Attachment Handling::`, () => {
    beforeEach(() => {
      reporter = new TeamcityReporter();
      reporter.onBegin(config);
      jest.clearAllMocks();
    });

    test("should handle image attachment with path", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "passed",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: [
          {
            name: "screenshot",
            contentType: "image/png",
            path: "/path/to/test-results/screenshots/image.png"
          }
        ]
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testMetadata type='image'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`name='screenshot'`));
    });

    test("should handle video attachment", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "passed",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: [
          {
            name: "video",
            contentType: "video/webm",
            path: "/path/to/test-results/videos/test.webm"
          }
        ]
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testMetadata type='video'`));
    });

    test("should handle zip attachment", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "passed",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: [
          {
            name: "trace",
            contentType: "application/zip",
            path: "/path/to/test-results/trace.zip"
          }
        ]
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testMetadata type='artifact'`));
    });

    test("should handle JSON attachment", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "passed",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: [
          {
            name: "data",
            contentType: "application/json",
            path: "/path/to/test-results/data.json"
          }
        ]
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testMetadata type='text'`));
    });

    test("should handle attachment with body", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "passed",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: [
          {
            name: "data",
            contentType: "image/png",
            body: Buffer.from("test-data")
          }
        ]
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testMetadata type='image'`));
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`value='${Buffer.from("test-data").toString("base64")}'`));
    });

    test("should ignore attachment without test-results in path", () => {
      reporter.onTestBegin(testFromSuiteA);
      jest.clearAllMocks();

      const result = {
        status: "passed",
        startTime: new Date(),
        duration: 100,
        errors: [],
        attachments: [
          {
            name: "external-file",
            contentType: "image/png",
            path: "/some/other/path/image.png"
          }
        ]
      } as unknown as TestResult;

      reporter.onTestEnd(testFromSuiteA, result);

      // Should only log testFinished, not testMetadata
      expect(console.log)
        .toHaveBeenCalledWith(expect.stringContaining(`testFinished name='${getTestName(testFromSuiteA)}'`));
      expect(console.log)
        .not.toHaveBeenCalledWith(expect.stringContaining(`testMetadata`));
    });
  });
});
