export type StudioStylePresetId = "natural" | "crisp_voice" | "warm" | "thump";
export interface LayerAudioDspState {
  enabled: boolean;
  preset: StudioStylePresetId;
  enhanceAmount: number;
  normalizeLufs: boolean;
}
export interface DspPresetParams {
  id: StudioStylePresetId; label: string; gateThresholdDb: number;
  highpassHz: number; lowMidCutDb: number; presenceBoostDb: number;
  airShelfDb: number; deEsserThresholdDb: number; stereoWidth: number;
  compThresholdDb: number; compRatio: number; makeupGainDb: number;
}
export const DEFAULT_DSP_STATE: Readonly<LayerAudioDspState>;
