export type GateMode = 'required' | 'warn' | 'skip';
export type CommitMsgStyle = 'conventional' | 'freeform' | 'skip';
export type CoverageDelta = 'nonneg' | 'any';

export interface QualitySpec {
  format: GateMode;
  lint: GateMode;
  typecheck: GateMode;
  test: GateMode;
  coverage: { min: number; delta: CoverageDelta };
  security: GateMode;
  commit_msg: CommitMsgStyle;
  reviewer_required: boolean;
}
