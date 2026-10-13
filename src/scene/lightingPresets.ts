export const LIGHTING_PRESETS = ["bright", "warm", "cool", "soft"] as const;

export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

export interface LightingPresetSpec {
  label: string;
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  lampColor: string;
  lampBase: number;
  lampPerM2: number;
  exposure: number;
}

// Each preset is a full, self-consistent look — colour temperature, fill and
// exposure move together so switching never leaves an unbalanced scene.
export const LIGHTING_PRESET_SPECS: Record<LightingPreset, LightingPresetSpec> = {
  bright: {
    label: "Bright",
    sunColor: "#fff2df",
    sunIntensity: 2.1,
    ambientColor: "#fff6ec",
    ambientIntensity: 0.55,
    hemiSky: "#ffffff",
    hemiGround: "#cfc8bc",
    hemiIntensity: 1.05,
    lampColor: "#fff2dc",
    lampBase: 6,
    lampPerM2: 0.6,
    exposure: 1.12,
  },
  warm: {
    label: "Warm",
    sunColor: "#ffd9a8",
    sunIntensity: 2,
    ambientColor: "#ffe9cf",
    ambientIntensity: 0.6,
    hemiSky: "#ffe9cf",
    hemiGround: "#c9b49a",
    hemiIntensity: 1,
    lampColor: "#ffd39a",
    lampBase: 7.5,
    lampPerM2: 0.7,
    exposure: 1.12,
  },
  cool: {
    label: "Cool",
    sunColor: "#eaf1ff",
    sunIntensity: 1.9,
    ambientColor: "#e8f1ff",
    ambientIntensity: 0.55,
    hemiSky: "#eaf2ff",
    hemiGround: "#c3ccd8",
    hemiIntensity: 1,
    lampColor: "#eaf2ff",
    lampBase: 6,
    lampPerM2: 0.6,
    exposure: 1.05,
  },
  soft: {
    label: "Soft",
    sunColor: "#fff3e2",
    sunIntensity: 1.2,
    ambientColor: "#fff4e8",
    ambientIntensity: 0.75,
    hemiSky: "#ffffff",
    hemiGround: "#d8d2c8",
    hemiIntensity: 1.35,
    lampColor: "#ffeccf",
    lampBase: 4,
    lampPerM2: 0.45,
    exposure: 1.16,
  },
};

export function isLightingPreset(value: unknown): value is LightingPreset {
  return (
    typeof value === "string" &&
    (LIGHTING_PRESETS as readonly string[]).includes(value)
  );
}
