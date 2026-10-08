import type { MaterialFinish } from "./types";

export const PALETTE_NEUTRALS = [
  "#f6f3ec",
  "#e4ddd1",
  "#cfc6b8",
  "#b0a798",
  "#8a8377",
  "#5d584f",
  "#34322d",
] as const;

export const PALETTE_WOODS = [
  "#e8d3ae",
  "#d7c4aa",
  "#c09a68",
  "#a1743f",
  "#7c5330",
  "#4d3320",
] as const;

export const PALETTE_FABRICS = [
  "#efe9df",
  "#d9d0c2",
  "#bdb1a0",
  "#93a08f",
  "#6c7d8d",
  "#4a5462",
  "#7a5560",
  "#2f3138",
] as const;

export const PALETTE_DARKS = [
  "#0f0f11",
  "#232427",
  "#3a3d43",
  "#585d66",
  "#8b919b",
  "#c8ccd3",
  "#f4f5f7",
] as const;

export const PALETTE_METALS = [
  "#eef0f2",
  "#ccd0d4",
  "#a6acb3",
  "#7d838a",
  "#565b61",
  "#d8b57a",
] as const;

export const PALETTE_ACCENTS = [
  "#d9534f",
  "#e08a3c",
  "#e5c07b",
  "#5b9cff",
  "#3f8f7a",
  "#7a5cc4",
  "#c21616",
] as const;

export const WOOD_FINISHES: readonly MaterialFinish[] = [
  { id: "natural", label: "Natural", color: "#d7c4aa", roughness: 0.55 },
  { id: "honey", label: "Honey", color: "#c09a68", roughness: 0.5 },
  { id: "walnut", label: "Walnut", color: "#7c5330", roughness: 0.45 },
  { id: "matte", label: "Matte", roughness: 0.85 },
  { id: "gloss", label: "Gloss", roughness: 0.18 },
];

export const FABRIC_FINISHES: readonly MaterialFinish[] = [
  { id: "linen", label: "Linen", color: "#e6ded1", roughness: 0.9 },
  { id: "velvet", label: "Velvet", roughness: 0.7 },
  { id: "leather", label: "Leather", roughness: 0.42 },
  { id: "sheen", label: "Silk sheen", roughness: 0.3 },
];

export const METAL_FINISHES: readonly MaterialFinish[] = [
  { id: "brushed", label: "Brushed", roughness: 0.45 },
  { id: "polished", label: "Polished", roughness: 0.15 },
  { id: "matte", label: "Matte", roughness: 0.75 },
];

export const PAINT_FINISHES: readonly MaterialFinish[] = [
  { id: "matte", label: "Matte", roughness: 0.8 },
  { id: "satin", label: "Satin", roughness: 0.45 },
  { id: "gloss", label: "Gloss", roughness: 0.18 },
];
