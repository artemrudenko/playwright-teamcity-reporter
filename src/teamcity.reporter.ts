import * as path from 'path';
import { FullResult, Reporter, Suite, FullConfig, TestCase, TestError } from '@playwright/test/reporter';

type SuiteStates = 'testSuiteStarted' | 'testSuiteFinished';
type TestStates = 'testStarted' | 'testMetadata' | 'testFinished' | 'testIgnored' | 'testFailed';
type StdTypes = 'testStdOut' | 'testStdErr';

type ActionType = SuiteStates | TestStates | StdTypes;

// https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html
class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotImplementedError);
    }

    this.name = 'NotImplementedError';
  }
}

class TeamcityReporter implements Reporter {
  private readonly testMetadataArtifacts: string;

  private flowId!: string;
  private report!: 'onTestBegin' | 'onEnd';
  private rootSuite!: Suite;

  private lastRunningSuite: Suite | undefined;

  constructor(configuration: Partial<{
    testMetadataArtifacts: string;
  }> = {}) {
    this.testMetadataArtifacts = configuration.testMetadataArtifacts ?? process.env.TEAMCITY_ARTIFACTS_PW_RESULT ?? 'test-results';
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.flowId = process.pid.toString();
    this.rootSuite = suite;

    if (config.workers === 1) {
      this.report = 'onTestBegin';
    } else {
      console.info('Playwright is running suites in multiple workers. The results will be reported after all of them finish.');
      this.report = 'onEnd';
    }

    console.info(`'${JSON.stringify(config)}'`);
  }

  onError(error: TestError) {
    console.error(error);
  }

  onTestBegin(test: TestCase): void {
    if (this.report === 'onTestBegin') {
      let parentSuite = test.parent;
      while (parentSuite?.parent?.parent !== this.rootSuite && parentSuite.parent) {
        parentSuite = parentSuite.parent;
      }
      if (parentSuite !== this.lastRunningSuite) {
        if (typeof this.lastRunningSuite !== 'undefined') {
          this.logSuiteResults(this.lastRunningSuite);
        }
        this.lastRunningSuite = parentSuite;
      }
    }
  }

  onEnd(result: FullResult) {
    // @TODO try this
    // https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html#Importing+XML+Reports
    // console.log(`##teamcity[importData type='junit' path='test-results.xml']`)

    switch (this.report) {
      case 'onTestBegin':
        if (typeof this.lastRunningSuite !== 'undefined') {
          this.logSuiteResults(this.lastRunningSuite);
        }
        break;
      case 'onEnd':
        this.rootSuite.suites
          .flatMap((projectSuite) => projectSuite.suites)
          .forEach((suite) => this.logSuiteResults(suite));
        break;
    }

    console.info(`Finished the run: ${result.status}`);
  }

  private logSuiteResults(suite: Suite): void {
    this.logToTC(`testSuiteStarted`, [
      `name='${TeamcityReporter.escape(suite.title)}'`
    ]);
    suite.tests.forEach(t => this.logTestResults(t));
    suite.suites.forEach(s => this.logSuiteResults(s));
    this.logToTC(`testSuiteFinished`, [
      `name='${TeamcityReporter.escape(suite.title)}'`
    ]);
  }

  private logTestResults(test: TestCase) {
    const name = TeamcityReporter.escape(test.title);
    const tzoffset = (new Date()).getTimezoneOffset() * 60000; //offset in milliseconds
    const result = test.results.pop();
    if (result === undefined) {
      throw new Error(`Result should not be empty`);
    }
    const localISOTime = new Date(result?.startTime.getTime() - tzoffset)
      .toISOString()
      .slice(0, -1);
    this.logToTC(`testStarted`, [
      `name='${name}'`,
      `timestamp='${localISOTime}'`,
      `captureStandardOutput='true'`
    ]);

    switch (result?.status) {
      case 'skipped':
        this.logToTC(`testIgnored`, [
          `name='${name}'`,
          `message='skipped'`
        ]);
        break;
      case 'timedOut':
        this.logToTC(`testFailed`, [
          `name='${name}'`,
          `message='Timeout of ${test.timeout}ms exceeded.'`,
          `details='${TeamcityReporter.escape(result?.error?.stack || '')}'`
        ]);
        break;
      case 'failed':
        this.logToTC(`testFailed`, [
          `name='${name}'`,
          `message='${TeamcityReporter.escape(result?.error?.message || '')}'`,
          `details='${TeamcityReporter.escape(result?.error?.stack || '')}'`
        ]);
        break;
      case 'passed':
        break;
      default:
        throw new NotImplementedError(`${result?.status} isn't supported`);
    }

    // https://www.jetbrains.com/help/teamcity/2021.2/reporting-test-metadata.html#Reporting+additional+test+data
    // 'test-results' should be a part of the artifacts directory
    const artifact = this.testMetadataArtifacts;
    for (const attachment of (result?.attachments || [])) {
      let value = '';
      if (attachment.path !== undefined) {
        value = attachment.path;
        value = value.split(path.sep).join(path.posix.sep);
        value = value.slice(value.indexOf('test-results') + 13);
        value = `${artifact}${artifact.endsWith('.zip') ? '!' : ''}/${value}`;
      } else if (attachment?.body !== undefined) {
        value = attachment?.body?.toString('base64');
      }
      let type!: string;
      switch (attachment.contentType) {
        case 'image/png': // type = `type='image'`;
        case `application/zip`:
          type = `type='artifact'`;
          break;
        case `application/json`:
        default:
          type = `type='text'`;
      }
      this.logToTC(`testMetadata`, [
        type,
        `testName='${name}'`,
        `name='${attachment.name}'`,
        `value='${value}'`
      ]);
    }

    this.logToTC(`testFinished`, [
      `name='${name}'`,
      `duration='${result?.duration}'`
    ]);

  }

  logToTC(action: ActionType, parts: string[]) {
    const textParts = [
      `##teamcity[${action}`,
      ...parts.filter(part => !!part),
      `flowId='${this.flowId}']`
    ];
    console.log(textParts.join(' '));
  }

  // Escape text message to be compatible with Teamcity
  static escape(text: string) {
    if (!text) {
      return '';
    }
    /* eslint-disable no-control-regex */
    return text
      .toString()
      .replace(/\x1B.*?m/g, "")
      .replace(/\|/g, "||")
      .replace(/\n/g, "|n")
      .replace(/\r/g, "|r")
      .replace(/\[/g, "|[")
      .replace(/\]/g, "|]")
      .replace(/\u0085/g, "|x")
      .replace(/\u2028/g, "|l")
      .replace(/\u2029/g, "|p")
      .replace(/'/g, "|'");
    /* eslint-enable no-control-regex */
  }
}

export default TeamcityReporter;
