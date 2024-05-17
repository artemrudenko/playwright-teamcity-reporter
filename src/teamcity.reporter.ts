import {
  Reporter, FullConfig, TestCase,
  TestError, TestResult, FullResult
} from '@playwright/test/reporter';
import { randomUUID } from 'crypto';
import * as path from 'path';

import { NotImplementedError } from './errors';
import { ActionType, ITeamcityReporterConfiguration } from './teamcity.model';
import { stringify, writeServiceMessage, getTestName, TextParts } from './utils';

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

  onError(error: TestError): void {
    console.error(error);
  }

  onEnd(result: FullResult): void {
    console.info(`Finished the run: ${result.status}`);
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
      testName: getTestName(test),
      name: attachment.name,
      value,
      flowId: this.#getFlowId(test),
    });
  }

  #writeTestFlow(messageName: ActionType, test: TestCase, parts: TextParts = {}): void {
    writeServiceMessage(messageName, {
      name: getTestName(test),
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
