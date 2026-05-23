export interface AppearancePalette {
  readonly id: "canopy" | "ochre" | "violet";
  readonly label: string;
  readonly description: string;
  readonly hue: number;
  readonly colors: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
}

export const APPEARANCE_PALETTES = [
  {
    id: "canopy",
    label: "Canopy",
    description: "Deep green, calm focus",
    hue: 120,
    colors: [
      "oklch(0.185 0.031 120)",
      "oklch(0.216 0.043 120)",
      "oklch(0.28 0.08 120)",
      "oklch(0.331 0.111 120)",
      "oklch(0.377 0.137 120)",
      "oklch(0.428 0.161 120)",
      "oklch(0.496 0.184 120)",
      "oklch(0.585 0.205 120)",
      "oklch(0.703 0.205 120)",
      "oklch(0.761 0.186 120)",
      "oklch(0.875 0.117 120)",
      "oklch(0.933 0.068 120)",
    ],
  },
  {
    id: "ochre",
    label: "Ochre",
    description: "Warm amber, high signal",
    hue: 75,
    colors: [
      "oklch(0.193 0.027 75)",
      "oklch(0.224 0.038 75)",
      "oklch(0.288 0.072 75)",
      "oklch(0.338 0.1 75)",
      "oklch(0.383 0.123 75)",
      "oklch(0.433 0.144 75)",
      "oklch(0.501 0.166 75)",
      "oklch(0.592 0.188 75)",
      "oklch(0.733 0.194 75)",
      "oklch(0.788 0.177 75)",
      "oklch(0.894 0.11 75)",
      "oklch(0.945 0.064 75)",
    ],
  },
  {
    id: "violet",
    label: "Violet",
    description: "Cool violet, technical depth",
    hue: 275,
    colors: [
      "oklch(0.182 0.027 275)",
      "oklch(0.213 0.038 275)",
      "oklch(0.278 0.075 275)",
      "oklch(0.329 0.104 275)",
      "oklch(0.375 0.128 275)",
      "oklch(0.426 0.149 275)",
      "oklch(0.494 0.17 275)",
      "oklch(0.58 0.19 275)",
      "oklch(0.632 0.185 275)",
      "oklch(0.685 0.173 275)",
      "oklch(0.85 0.107 275)",
      "oklch(0.922 0.063 275)",
    ],
  },
] as const satisfies readonly AppearancePalette[];

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

export function resolveAppearancePalette(hue: number): AppearancePalette {
  return APPEARANCE_PALETTES.reduce<AppearancePalette>(
    (closest, palette) =>
      hueDistance(hue, palette.hue) < hueDistance(hue, closest.hue) ? palette : closest,
    APPEARANCE_PALETTES[0],
  );
}
