import {
  Reporter, FullConfig, TestCase,
  TestError, TestResult, FullResult
} from "@playwright/test/reporter";
import { randomUUID } from "crypto";
import * as path from "path";

import { NotImplementedError } from "./errors";
import { ActionType, ITeamcityReporterConfiguration } from "./teamcity.model";
import { stringify, writeServiceMessage, getTestName, TextParts } from "./utils";

// Constants
const DEFAULT_TEST_RESULTS_DIR = "test-results";
const ZIP_EXTENSION = ".zip";
const ZIP_SEPARATOR = "!";

// Content type constants
const CONTENT_TYPE_IMAGE_PNG = "image/png";
const CONTENT_TYPE_VIDEO_MP4 = "video/mp4";
const CONTENT_TYPE_VIDEO_WEBM = "video/webm";
const CONTENT_TYPE_APPLICATION_ZIP = "application/zip";
const CONTENT_TYPE_APPLICATION_JSON = "application/json";

// TeamCity metadata type constants
const METADATA_TYPE_IMAGE = "image";
const METADATA_TYPE_VIDEO = "video";
const METADATA_TYPE_ARTIFACT = "artifact";
const METADATA_TYPE_TEXT = "text";

// Test status messages
const MESSAGE_SKIPPED = "skipped";
const MESSAGE_TEST_INTERRUPTED = "Test interrupted";

/**
 * TeamCity reporter for Playwright test results.
 * Converts Playwright test events into TeamCity service messages.
 * @see https://www.jetbrains.com/help/teamcity/service-messages.html
 */
class TeamcityReporter implements Reporter {
  readonly #testMetadataArtifacts: string;

  readonly #flowIds = new Map<TestCase, string>();

  /**
   * Creates a new TeamCity reporter instance.
   * @param configuration - Optional configuration for the reporter
   */
  constructor(private configuration?: ITeamcityReporterConfiguration) {
    this.#testMetadataArtifacts = configuration?.testMetadataArtifacts
      ?? process.env.TEAMCITY_ARTIFACTS_PW_RESULT
      ?? DEFAULT_TEST_RESULTS_DIR;
  }

  /**
   * Indicates that this reporter prints to standard output.
   * @returns Always returns true
   */
  printsToStdio(): boolean {
    return true;
  }

  /**
   * Called at the beginning of the test run.
   * Logs configuration if requested and enables test retry support if configured.
   * @param config - The full Playwright configuration
   */
  onBegin(config: FullConfig): void {
    if (this.configuration?.logConfig) {
      writeServiceMessage("message", {
        text: stringify(config)
      });
    }

    // https://www.jetbrains.com/help/teamcity/service-messages.html#Enabling+Test+Retry
    if (config.projects.some(project => project.retries > 0)) {
      writeServiceMessage("testRetrySupport", {
        enabled: "true"
      });
    }
  }

  /**
   * Called when a test begins execution.
   * @param test - The test case that is starting
   */
  onTestBegin(test: TestCase): void {
    this.#writeTestFlow("testStarted", test);
  }

  /**
   * Called when a test outputs to stdout.
   * @param chunk - The output chunk (string or buffer)
   * @param test - Optional test case associated with the output
   */
  onStdOut(chunk: string | Buffer, test?: TestCase): void {
    if (test) {
      this.#writeTestFlow("testStdOut", test, {
        out: chunk.toString()
      });
    } else {
      console.log(chunk);
    }
  }

  /**
   * Called when a test outputs to stderr.
   * @param chunk - The error output chunk (string or buffer)
   * @param test - Optional test case associated with the output
   */
  onStdErr(chunk: string | Buffer, test?: TestCase): void {
    if (test) {
      this.#writeTestFlow("testStdErr", test, {
        out: chunk.toString()
      });
    } else {
      console.error(chunk);
    }
  }

  /**
   * Called when a test finishes execution.
   * Reports test status, attachments, and duration to TeamCity.
   * @param test - The test case that finished
   * @param result - The test result containing status, errors, and attachments
   */
  onTestEnd(test: TestCase, result: TestResult): void {
    switch (result.status) {
      case "skipped":
        this.#writeTestFlow("testIgnored", test, {
          message: MESSAGE_SKIPPED,
        });
        break;
      case "timedOut":
        this.#writeTestFlow("testFailed", test, {
          message: `${result.error?.message ?? ""}`,
          details: result.errors.map((e) => e.message).join("\n"),
        });
        break;
      case "failed":
        this.#writeTestFlow("testFailed", test, {
          message: `${result.error?.message ?? ""}`,
          details: `${result.error?.stack ?? ""}`,
        });
        break;
      case "interrupted":
        this.#writeTestFlow("testFailed", test, {
          message: MESSAGE_TEST_INTERRUPTED,
        });
        break;
      case "passed":
        break;
      default:
        throw new NotImplementedError(`${result?.status as string} isn't supported`);
    }

    for (const attachment of result.attachments || []) {
      this.#logAttachment(test, attachment);
    }

    this.#writeTestFlow("testFinished", test, {
      duration: `${result.duration}`
    });

    // Clean up flow ID to prevent memory leaks
    this.#flowIds.delete(test);
  }

  /**
   * Called when a global error occurs during test execution.
   * @param error - The error that occurred
   */
  onError(error: TestError): void {
    console.error(error);
  }

  /**
   * Called when the entire test run completes.
   * @param result - The final result of the test run
   */
  onEnd(result: FullResult): void {
    console.info(`Finished the run: ${result.status}`);
  }

  #logAttachment(test: TestCase, attachment: TestResult["attachments"][number]): void {
    // https://www.jetbrains.com/help/teamcity/service-messages.html#Reporting+Additional+Test+Data
    // "test-results" should be a part of the artifacts directory
    let value = "";
    if (attachment.path !== undefined) {
      const testResultsIndex = attachment.path.indexOf(DEFAULT_TEST_RESULTS_DIR);
      if (testResultsIndex === -1) return;

      const artifact = this.#testMetadataArtifacts;
      value = attachment.path;
      value = value.split(path.sep).join(path.posix.sep);
      // Skip past "test-results/" in the path
      value = value.slice(testResultsIndex + DEFAULT_TEST_RESULTS_DIR.length + 1);
      value = `${artifact}${artifact.endsWith(ZIP_EXTENSION) ? ZIP_SEPARATOR : ""}/${value}`;
    } else if (attachment.body !== undefined) {
      value = attachment.body.toString("base64");
    }

    let type;
    switch (attachment.contentType) {
      case CONTENT_TYPE_IMAGE_PNG:
        type = METADATA_TYPE_IMAGE;
        break;
      case CONTENT_TYPE_VIDEO_MP4:
      case CONTENT_TYPE_VIDEO_WEBM:
        type = METADATA_TYPE_VIDEO;
        break;
      case CONTENT_TYPE_APPLICATION_ZIP:
        type = METADATA_TYPE_ARTIFACT;
        break;
      case CONTENT_TYPE_APPLICATION_JSON:
      default:
        type = METADATA_TYPE_TEXT;
    }

    writeServiceMessage("testMetadata", {
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
