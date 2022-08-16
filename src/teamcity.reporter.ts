import { Reporter, FullConfig, TestCase, TestError, TestResult, FullResult } from '@playwright/test/reporter';
import { randomUUID } from 'crypto';
import * as path from 'path';

import { NotImplementedError } from './errors';
import { ActionType, ITeamcityReporterConfiguration } from './teamcity.model';
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

export function testName(test: TestCase) {
  // https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html#Interpreting+Test+Names
  return test.titlePath().filter(title => title).join(': ');
}

// https://www.jetbrains.com/help/teamcity/service-messages.html
class TeamcityReporter implements Reporter {
  readonly #testMetadataArtifacts: string;

  readonly #flowIds = new Map<TestCase, string>();

  constructor(private configuration?: ITeamcityReporterConfiguration) {
    this.#testMetadataArtifacts = configuration?.testMetadataArtifacts
      ?? process.env.TEAMCITY_ARTIFACTS_PW_RESULT
      ?? 'test-results';
  }

  printsToStdio(): boolean {
    return true;
  }

  onBegin(config: FullConfig): void {
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
    this.#writeTestFlow(`testStarted`, test);
  }

  onStdOut(chunk: string | Buffer, test?: TestCase): void {
    if (test) {
      this.#writeTestFlow(`testStdOut`, test, { out: chunk.toString() });
    } else {
      console.log(chunk);
    }
  }

  onStdErr(chunk: string | Buffer, test?: TestCase): void {
    if (test) {
      this.#writeTestFlow(`testStdErr`, test, { out: chunk.toString() });
    } else {
      console.error(chunk);
    }
  }

  onEnd(result: FullResult) {
    console.info(`Finished the run: ${result.status}`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    switch (result.status) {
      case 'skipped':
        this.#writeTestFlow(`testIgnored`, test, {
          message: `skipped`,
        });
        break;
      case 'timedOut':
        this.#writeTestFlow(`testFailed`, test, {
          message: `Timeout of ${test.timeout}ms exceeded.`,
          details: `${result.error?.stack ?? ''}`,
        });
        break;
      case 'failed':
        this.#writeTestFlow(`testFailed`, test, {
          message: `${result.error?.message ?? ''}`,
          details: `${result.error?.stack ?? ''}`,
        });
        break;
      case 'passed':
        break;
      default:
        throw new NotImplementedError(`${result?.status as string} isn't supported`);
    }

    for (const attachment of result.attachments || []) {
      this.#logAttachment(test, attachment);
    }

    this.#writeTestFlow(`testFinished`, test, { duration: `${result.duration}` });
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
      testName: testName(test),
      name: attachment.name,
      value,
      flowId: this.#getFlowId(test),
    });
  }

  #writeTestFlow(messageName: ActionType, test: TestCase, parts: Record<string, string> = {}): void {
    writeServiceMessage(messageName, {
      name: testName(test),
      ...parts,
      flowId: this.#getFlowId(test),
    });
  }

  #getFlowId(test: TestCase): string {
    let flowId = this.#flowIds.get(test);
    if (flowId === undefined) {
      flowId = randomUUID();
      this.#flowIds.set(test, flowId);
    }

    return flowId;
  }
}

export default TeamcityReporter;
