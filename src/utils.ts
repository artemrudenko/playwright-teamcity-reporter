import { TestCase } from "@playwright/test/reporter";

import { ActionType } from "./teamcity.model";

export type TextParts = Record<string, string>;

const replacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

export const stringify = (data: any, space?: number) => {
  return JSON.stringify(data, replacer(), space).replace(/"/g, "'");
};

// Escape text message to be compatible with Teamcity
// https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html#Escaped+values
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

export const writeServiceMessage = (messageName: ActionType, parts: TextParts): void => {
  const textParts = Object.entries(parts)
    .map(([key, value]) => ` ${key}='${escape(value)}'`)
    .join('');

  console.log(`##teamcity[${messageName}${textParts}]`);
};

// https://www.jetbrains.com/help/teamcity/2021.2/service-messages.html#Interpreting+Test+Names
export const getTestName = (test: TestCase) => test.titlePath().filter(title => title).join(': ');
