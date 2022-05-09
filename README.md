# Playwright Teamcity Reporter

[![Build and test](https://github.com/artemrudenko/playwright-teamcity-reporter/actions/workflows/build-and-test.yml/badge.svg)](https://github.com/artemrudenko/playwright-teamcity-reporter/actions/workflows/build-and-test.yml)

This package will report your @playwright/test results to your Teamcity CI server, so you can see the number of executed tests, test failures and the tests tab right from your Teamcity UI.

## Installation

Install the package from NPM:

```cmd
npm install --save-dev playwright-teamcity-reporter
```

## Usage

Add to default reporter:

```cmd
npx playwright test  --reporter=line,playwright-teamcity-reporter
```

Use only playwright-teamcity-reporter:

```cmd
npx playwright test  --reporter=playwright-teamcity-reporter
```

You can also configure using playwright.config.js. To achieve that, add 'playwright-teamcity-reporter' to the reporter section of your configuration:

```ts
const config = {
  ...
  reporter: [
    ['playwright-teamcity-reporter', {'testMetadataArtifacts': 'test-results'}],
  ],
  ...
};
```

### Limitations

Please note that currently reporter isn't supporting test retries.
