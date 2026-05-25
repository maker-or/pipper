import os
import re

css_head = """@import "tailwindcss";
@plugin "tailwindcss-animate";

@theme inline {
  --font-sans: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;

  /* Surfaces */
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);

  /* Text */
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-text-placeholder: var(--text-placeholder);
  --color-text-disabled: var(--text-disabled);
  --color-text-accent: var(--text-accent);

  /* Icons */
  --color-icon: var(--icon);
  --color-icon-muted: var(--icon-muted);
  --color-icon-disabled: var(--icon-disabled);
  --color-icon-accent: var(--icon-accent);

  /* Borders */
  --color-border: var(--border);
  --color-border-variant: var(--border-variant);
  --color-border-focused: var(--border-focused);
  --color-border-selected: var(--border-selected);

  /* Elements */
  --color-element: var(--element-background);
  --color-element-hover: var(--element-hover);
  --color-element-active: var(--element-active);
  --color-element-selected: var(--element-selected);

  /* Ghost Elements */
  --color-ghost: var(--ghost-element-background);
  --color-ghost-hover: var(--ghost-element-hover);
  --color-ghost-active: var(--ghost-element-active);
  --color-ghost-selected: var(--ghost-element-selected);

  /* Signals */
  --color-error: var(--error);
  --color-error-background: var(--error-background);
  --color-warning: var(--warning);
  --color-warning-background: var(--warning-background);
  --color-success: var(--success);
  --color-success-background: var(--success-background);
  --color-info: var(--info);
  --color-info-background: var(--info-background);

  /* Git/Diff */
  --color-created: var(--created);
  --color-modified: var(--modified);
  --color-deleted: var(--deleted);
  --color-conflict: var(--conflict);
  
  /* Shadcn compat */
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-ring: var(--ring);
  --color-input: var(--input);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
  --animate-accordion-down: accordion-down 0.2s ease-out;
  --animate-accordion-up: accordion-up 0.2s ease-out;

  @keyframes accordion-down {
    from {
      height: 0;
    }
    to {
      height: var(--radix-accordion-content-height);
    }
  }

  @keyframes accordion-up {
    from {
      height: var(--radix-accordion-content-height);
    }
    to {
      height: 0;
    }
  }
}

@layer base {
  :root {
    --radius: 0.625rem;
    
    /* Animation tokens */
    --resize-dur: 200ms;
    --resize-ease: cubic-bezier(0.2, 1, 0.3, 1);
    
    /* We don't define colors here anymore, they are injected by useTheme.ts! */
  }

  * {
    @apply border-border;
  }
  
  body {
    @apply bg-background text-foreground;
  }
}
"""

with open('src/_index_tail.css', 'r') as f:
    tail = f.read()

# Replace scrollbar colors
tail = re.sub(r'::-webkit-scrollbar-thumb \{\s*background:\s*rgba\(0,\s*0,\s*0,\s*0\.15\);\s*border-radius:\s*3px;\s*\}', r'::-webkit-scrollbar-thumb {\n  background: var(--scrollbar-thumb);\n  border-radius: 3px;\n}', tail)
tail = re.sub(r'::-webkit-scrollbar-thumb:hover \{\s*background:\s*rgba\(0,\s*0,\s*0,\s*0\.25\);\s*\}', r'::-webkit-scrollbar-thumb:hover {\n  background: var(--scrollbar-thumb-hover);\n}', tail)
tail = re.sub(r'\.dark ::-webkit-scrollbar-thumb \{\s*background:\s*rgba\(255,\s*255,\s*255,\s*0\.1\);\s*\}', '', tail)
tail = re.sub(r'\.dark ::-webkit-scrollbar-thumb:hover \{\s*background:\s*rgba\(255,\s*255,\s*255,\s*0\.18\);\s*\}', '', tail)

# Replace model picker thin scrollbars
tail = re.sub(r'\.model-picker-list::-webkit-scrollbar-thumb \{\s*background:\s*rgba\(0,\s*0,\s*0,\s*0\.1\);\s*border-radius:\s*2px;\s*\}', r'.model-picker-list::-webkit-scrollbar-thumb {\n  background: var(--scrollbar-thumb);\n  border-radius: 2px;\n}', tail)
tail = re.sub(r'\.model-picker-list::-webkit-scrollbar-thumb:hover \{\s*background:\s*rgba\(0,\s*0,\s*0,\s*0\.2\);\s*\}', r'.model-picker-list::-webkit-scrollbar-thumb:hover {\n  background: var(--scrollbar-thumb-hover);\n}', tail)
tail = re.sub(r'\.dark \.model-picker-list::-webkit-scrollbar-thumb \{\s*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);\s*\}', '', tail)
tail = re.sub(r'\.dark \.model-picker-list::-webkit-scrollbar-thumb:hover \{\s*background:\s*rgba\(255,\s*255,\s*255,\s*0\.15\);\s*\}', '', tail)

# Replace sidebar gradient
tail = re.sub(r'background:\s*linear-gradient\(\s*135deg,\s*oklch\(0\.95 0\.02 250\) 0%,\s*var\(--accent\) 50%,\s*oklch\(0\.92 0\.02 250\) 100%\s*\);', r'background: var(--ghost-element-hover);', tail)
tail = re.sub(r'background:\s*linear-gradient\(\s*135deg,\s*oklch\(0\.96 0\.01 250\) 0%,\s*var\(--accent\) 50%,\s*oklch\(0\.93 0\.01 250\) 100%\s*\);', r'background: var(--ghost-element-hover);', tail)

with open('src/index.css', 'w') as f:
    f.write(css_head + "\n" + tail)

print("done")
