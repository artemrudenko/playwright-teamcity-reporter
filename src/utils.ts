import { TestCase } from "@playwright/test/reporter";

import { ActionType } from "./teamcity.model";

export type TextParts = Record<string, string>;

/**
 * Serializes data to JSON string while handling circular references.
 * Converts double quotes to single quotes for TeamCity compatibility.
 * @param data - The data to stringify
 * @param space - Optional spacing for pretty printing
 * @returns JSON string with single quotes
 */
export const stringify = (data: any, space?: number): string => {
  // Create a new WeakSet for each stringify call to track circular references
  const seen = new WeakSet();
  const replacer = (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
  return JSON.stringify(data, replacer, space).replace(/"/g, "'");
};

/**
 * Escapes text to be compatible with TeamCity service message format.
 * Handles special characters, ANSI color codes, and Unicode line separators.
 * @param text - The text to escape
 * @returns Escaped text safe for TeamCity service messages
 * @see https://www.jetbrains.com/help/teamcity/service-messages.html#Escaped+values
 */
/* eslint-disable no-control-regex */
export const escape = (text: string): string => text
  ? text
    .replace(/\x1B.*?m/g, "")
    .replace(/\|/g, "||")
    .replace(/\n/g, "|n")
    .replace(/\r/g, "|r")
    .replace(/\[/g, "|[")
    .replace(/\]/g, "|]")
    .replace(/\u0085/g, "|x")
    .replace(/\u2028/g, "|l")
    .replace(/\u2029/g, "|p")
    .replace(/'/g, "|'")
  : '';
/* eslint-enable no-control-regex */

/**
 * Writes a TeamCity service message to stdout.
 * @param messageName - The type of service message (e.g., 'testStarted', 'testFinished')
 * @param parts - Key-value pairs to include in the message
 */
export const writeServiceMessage = (messageName: ActionType, parts: TextParts): void => {
  const textParts = Object.entries(parts)
    .map(([key, value]) => ` ${key}='${escape(value)}'`)
    .join("");

  console.log(`##teamcity[${messageName}${textParts}]`);
};

/**
 * Generates a qualified test name from a test case.
 * Joins all non-empty titles in the test's hierarchy with ': '.
 * @param test - The test case
 * @returns Formatted test name (e.g., 'Suite: SubSuite: Test Name')
 * @see https://www.jetbrains.com/help/teamcity/service-messages.html#Interpreting+Test+Names
 */
export const getTestName = (test: TestCase): string => test.titlePath().filter(title => title).join(": ");
