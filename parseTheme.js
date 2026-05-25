const fs = require("fs");

const raw = fs.readFileSync("theme_example.json", "utf8");
const data = JSON.parse(raw);

const light = data.themes.find((t) => t.name === "Pierre Light").style;
const dark = data.themes.find((t) => t.name === "Pierre Dark").style;

function mapTokens(style) {
  const tokens = {
    "--background": style["background"],
    "--surface": style["surface.background"],
    "--surface-elevated": style["elevated_surface.background"],
    "--editor-background": style["editor.background"],
    "--app-chrome-background": style["tab_bar.background"],

    "--text": style["text"],
    "--text-muted": style["text.muted"],
    "--text-placeholder": style["text.placeholder"],
    "--text-disabled": style["text.disabled"],
    "--text-accent": style["text.accent"],

    "--icon": style["icon"],
    "--icon-muted": style["icon.muted"],
    "--icon-disabled": style["icon.disabled"],
    "--icon-placeholder": style["icon.placeholder"],
    "--icon-accent": style["icon.accent"],

    "--border": style["border"],
    "--border-variant": style["border.variant"],
    "--border-focused": style["border.focused"],
    "--border-selected": style["border.selected"],
    "--border-disabled": style["border.disabled"],

    "--element-background": style["element.background"],
    "--element-hover": style["element.hover"],
    "--element-active": style["element.active"],
    "--element-selected": style["element.selected"] || style["element.active"],
    "--element-disabled": style["element.disabled"],

    "--ghost-element-background": style["ghost_element.background"],
    "--ghost-element-hover": style["ghost_element.hover"],
    "--ghost-element-active": style["ghost_element.active"],
    "--ghost-element-selected": style["ghost_element.selected"],
    "--ghost-element-disabled": style["ghost_element.disabled"],

    "--scrollbar-thumb": style["scrollbar.thumb.background"],
    "--scrollbar-thumb-hover": style["scrollbar.thumb.hover_background"],
    "--scrollbar-track": style["scrollbar.track.background"],

    "--error": style["error"],
    "--error-background": style["error.background"],
    "--error-border": style["error.border"],
    "--warning": style["warning"],
    "--warning-background": style["warning.background"],
    "--warning-border": style["warning.border"],
    "--success": style["success"],
    "--success-background": style["success.background"],
    "--success-border": style["success.border"],
    "--info": style["info"] || style["text.accent"],
    "--info-background": style["info.background"] || style["element.background"],
    "--info-border": style["info.border"] || style["border"],
    "--conflict": style["conflict"],
    "--conflict-background": style["conflict.background"],
    "--conflict-border": style["conflict.border"],
    "--created": style["created"],
    "--created-background": style["created.background"],
    "--created-border": style["created.border"],
    "--modified": style["modified"],
    "--modified-background": style["modified.background"],
    "--modified-border": style["modified.border"],
    "--deleted": style["deleted"],
    "--deleted-background": style["deleted.background"],
    "--deleted-border": style["deleted.border"],
    "--renamed": style["renamed"],
    "--renamed-background": style["renamed.background"],
    "--renamed-border": style["renamed.border"],
  };
  return tokens;
}

const lightTokens = mapTokens(light);
const darkTokens = mapTokens(dark);

const template = `export interface Theme {
  id: string;
  name: string;
  type: "light" | "dark";
  tokens: Record<string, string>;
}

const sharedShadcnMapping = {
  "--foreground": "var(--text)",
  "--primary": "var(--element-selected)",
  "--primary-foreground": "var(--background)",
  "--secondary": "var(--element-background)",
  "--secondary-foreground": "var(--text)",
  "--muted": "var(--element-background)",
  "--muted-foreground": "var(--text-muted)",
  "--accent": "var(--ghost-element-hover)",
  "--accent-foreground": "var(--text)",
  "--destructive": "var(--error)",
  "--destructive-foreground": "var(--background)",
  "--card": "var(--surface)",
  "--card-foreground": "var(--text)",
  "--popover": "var(--surface-elevated)",
  "--popover-foreground": "var(--text)",
  "--input": "var(--border-variant)",
  "--ring": "var(--border-focused)",
};

export const THEMES: Record<string, Theme> = {
  light: {
    id: "light",
    name: "Light",
    type: "light",
    tokens: {
${Object.entries(lightTokens)
  .map(([k, v]) => `      "${k}": "${v}",`)
  .join("\n")}
      ...sharedShadcnMapping,
    },
  },
  dark: {
    id: "dark",
    name: "Dark",
    type: "dark",
    tokens: {
${Object.entries(darkTokens)
  .map(([k, v]) => `      "${k}": "${v}",`)
  .join("\n")}
      ...sharedShadcnMapping,
    },
  },
};
`;

fs.writeFileSync("apps/web/src/themes.ts", template);
console.log("Updated apps/web/src/themes.ts!");
