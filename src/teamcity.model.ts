export type SuiteStatesType = 'testSuiteStarted' | 'testSuiteFinished';
export type TestStatesType = 'testStarted'
  | 'testMetadata'
  | 'testFinished'
  | 'testIgnored'
  | 'testFailed';
export type StdType = 'testStdOut' | 'testStdErr';

export type ActionType = 'message'
  | 'testRetrySupport'
  | SuiteStatesType
  | TestStatesType
  | StdType;

export interface ITeamcityReporterConfiguration {
  testMetadataArtifacts?: string;
  logConfig?: boolean;
}

export enum ReporterMode {
  Test,
  Suite
}
