export type TestStatesType = 'testStarted'
  | 'testMetadata'
  | 'testFinished'
  | 'testIgnored'
  | 'testFailed';
export type StdType = 'testStdOut' | 'testStdErr';

export type ActionType = 'message'
  | 'testRetrySupport'
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
