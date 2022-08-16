import { Reporter, Suite, FullConfig, TestCase, TestError, TestResult, FullResult } from '@playwright/test/reporter';
import * as path from 'path';

import { NotImplementedError } from './errors';
import { ActionType, ITeamcityReporterConfiguration, ReporterMode } from './teamcity.model';
import { stringify } from './utils';

// Escape text message to be compatible with Teamcity
// https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html#Escaped+values
export function escape(text: string): string {
  if (!text) {
    return '';
  }
  /* eslint-disable no-control-regex */
  return text
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

function writeServiceMessage(messageName: ActionType, parts: Record<string, string>): void {
  const textParts = Object.entries(parts)
    .map(([key, value]) => ` ${key}='${escape(value)}'`)
    .join('');

  console.log(`##teamcity[${messageName}${textParts}]`);
}

// https://www.jetbrains.com/help/teamcity/service-messages.html
class TeamcityReporter implements Reporter {
  static readonly #TZ_OFFSET = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
  readonly #testMetadataArtifacts: string;

  flowId!: string;
  rootSuite!: Suite;

  #mode!: ReporterMode;
  #lastRunningSuite: Suite | undefined;

  constructor(private configuration?: ITeamcityReporterConfiguration) {
    this.#testMetadataArtifacts = configuration?.testMetadataArtifacts
      ?? process.env.TEAMCITY_ARTIFACTS_PW_RESULT
      ?? 'test-results';
  }

  onBegin(config: FullConfig, suite: Suite) {
    this.flowId = process.pid.toString();
    this.rootSuite = suite;

    if (config.workers === 1) {
      this.#mode = ReporterMode.Test;
    } else {
      console.info('Playwright is running suites in multiple workers. The results will be reported after all of them finish.');
      this.#mode = ReporterMode.Suite;
    }

    if (this.configuration?.logConfig) {
      writeServiceMessage(`message`, { text: stringify(config) });
    }

    // https://www.jetbrains.com/help/teamcity/service-messages.html#Enabling+Test+Retry
    if (config.projects.some(project => project.retries > 0)) {
      writeServiceMessage(`testRetrySupport`, { enabled: `true` });
    }
  }

  onError(error: TestError) {
    console.error(error);
  }

  onTestBegin(test: TestCase): void {
    if (this.#mode === ReporterMode.Test) {
      let parentSuite = test.parent;
      while (parentSuite?.parent?.parent !== this.rootSuite && parentSuite.parent) {
        parentSuite = parentSuite.parent;
      }
      if (parentSuite !== this.#lastRunningSuite) {
        if (this.#lastRunningSuite !== undefined) {
          this.#logSuiteResults(this.#lastRunningSuite);
        }
        this.#lastRunningSuite = parentSuite;
      }
    }
  }

  onEnd(result: FullResult) {
    switch (this.#mode) {
      case ReporterMode.Test:
        if (this.#lastRunningSuite !== undefined) {
          this.#logSuiteResults(this.#lastRunningSuite);
        }
        break;
      case ReporterMode.Suite:
      default:
        // @TODO try this
        // https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html#Importing+XML+Reports
        // console.log(`##teamcity[importData type='junit' path='test-results.xml']`);
        this.rootSuite.suites
          .flatMap(fileSuite => fileSuite.suites)
          .forEach(storySuite => this.#logSuiteResults(storySuite));
        break;
    }
    console.info(`Finished the run: ${result.status}`);
  }

  logToTC(action: ActionType, parts: string[]) {
    const textParts = [
      `##teamcity[${action}`,
      ...parts.filter(part => !!part),
      `flowId='${this.flowId}']`
    ];
    console.log(textParts.join(' '));
  }

  #logSuiteResults(suite: Suite): void {
    this.logToTC(`testSuiteStarted`, [
      `name='${escape(suite.title)}'`
    ]);

    suite.tests.forEach((testCase: TestCase) => this.#logTestResults(testCase));
    suite.suites.forEach((suite: Suite) => this.#logSuiteResults(suite));

    this.logToTC(`testSuiteFinished`, [
      `name='${escape(suite.title)}'`
    ]);
  }

  #logTestResults(test: TestCase) {
    test.results.forEach((result: TestResult) => this.#logResult(test, result));
  }

  #logResult(test: TestCase, result: TestResult) {
    const name = escape(test.title);
    const localISOTime = new Date(result?.startTime.getTime() - TeamcityReporter.#TZ_OFFSET)
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
          `details='${escape(result?.error?.stack || '')}'`
        ]);
        break;
      case 'failed':
        this.logToTC(`testFailed`, [
          `name='${name}'`,
          `message='${escape(result?.error?.message || '')}'`,
          `details='${escape(result?.error?.stack || '')}'`
        ]);
        break;
      case 'passed':
        break;
      default:
        throw new NotImplementedError(`${result?.status as string} isn't supported`);
    }

    for (const attachment of result.attachments || []) {
      this.#logAttachment(test, attachment);
    }

    this.logToTC(`testFinished`, [
      `name='${name}'`,
      `duration='${result?.duration}'`
    ]);
  }

  #logAttachment(test: TestCase, attachment: TestResult['attachments'][number]): void {
    // https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Additional+Test+Data
    // 'test-results' should be a part of the artifacts directory
    let value = '';
    if (attachment.path !== undefined) {
      const artifact = this.#testMetadataArtifacts;
      value = attachment.path;
      value = value.split(path.sep).join(path.posix.sep);
      value = value.slice(value.indexOf('test-results') + 13);
      value = `${artifact}${artifact.endsWith('.zip') ? '!' : ''}/${value}`;
    } else if (attachment.body !== undefined) {
      value = attachment.body.toString('base64');
    }

    let type;
    switch (attachment.contentType) {
      case 'image/png':
      case `application/zip`:
        type = `type='artifact'`;
        break;
      case `application/json`:
      default:
        type = `type='text'`;
    }

    writeServiceMessage(`testMetadata`, {
      type,
      testName: test.title,
      name: attachment.name,
      value,
      flowId: this.flowId,
    });
  }
}

export default TeamcityReporter;
