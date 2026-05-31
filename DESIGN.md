# Design System: T3 Code

**Project ID:** local-repo

## Visual Theme & Atmosphere

T3 Code feels quiet, technical, and disciplined: a workspace built for sustained focus rather than browsing. The default experience is neutral-first and slightly austere, with dark surfaces that read like a polished terminal shell and light surfaces that stay soft and uncluttered. The visual language favors clarity, speed, and predictability over decoration.

The system leans into restrained depth: thin borders, muted fills, and whisper-soft shadows create separation without making the interface feel heavy. Most surfaces appear flat at first glance, then reveal subtle inset highlights and translucent layers on hover, focus, or elevation. Blue is the primary emotional accent — calm, precise, and productively alert.

A special Improve space introduces a more theatrical mood: warm sepia-dark foundations, amber highlights, and cinematic motion. It is intentionally richer and more expressive than the core app, but still obeys the same structural discipline.

## Color Palette & Roles

- **Carbon Graphite (#171717)** — the main dark-mode background for the app shell, sidebars, and primary surfaces.
- **Deep Ink (#0a0a0a)** — the deepest dark surface, used for editor cavities and high-contrast content planes.
- **Soft Fog (#f5f5f5)** — the main light-mode background and canvas color; calm and low-drama.
- **Paper White (#ffffff)** — the brightest light surface, used where an editor or content area needs maximum clarity.
- **Slate Border (#1d1d1d)** — the primary dark border tone; keeps structure visible without harsh outlines.
- **Mist Border (#d4d4d4)** — the light-mode frame color for quiet separation.
- **Panel Border Variant (#262626)** — a slightly lifted dark border for nested surfaces, inputs, and popovers.
- **Muted Steel (#737373)** — the default secondary text and icon tone; used for supporting labels, hints, and metadata.
- **Soft Placeholder Gray (#636363)** — disabled text, placeholders, and de-emphasized affordances in dark mode.
- **Primary Signal Blue (#009fff)** — the core action, focus, and selection color; used for primary buttons, rings, links, and selected states.
- **Selection Wash Blue (#19283c99)** — the dark selection fill; used for active rows and highlighted controls with a subdued blue tint.
- **Hover Wash Blue (#19283c59)** — the gentler hover state for ghost and low-emphasis interactive surfaces.
- **Critical Red (#ff2e3f)** — destructive actions, error states, and failure indicators in dark mode.
- **Success Green (#07c480)** — success states and completed actions in dark mode.
- **Info Cyan (#08c0ef)** — informational badges, rename states, and auxiliary system feedback in dark mode.
- **Conflict Violet (#7b43f8)** — merge/conflict states and special attention signals.

Light mode follows the same semantic structure with softer tones: **Warm White (#f5f5f5)**, **Editor White (#ffffff)**, **Ink Text (#0a0a0a)**, **Muted Gray (#737373)**, and the same **Primary Signal Blue (#009fff)** as the unifying accent.

## Typography Rules

The typography is modern, compact, and highly legible. The sans-serif voice is **Geist**, which keeps the UI feeling contemporary without becoming overly styled. Monospace content uses **SF Mono** first, then a conservative fallback stack, reinforcing the code-native character of the product.

Headings are semibold or bold, with tight tracking and minimal ornament. They are used as clear signposts rather than decorative statements. Body text stays neutral and readable, usually medium weight or regular weight with comfortable leading. Small labels often shift to uppercase with increased letter-spacing to create a crisp, instrument-panel feel.

Long-form content is encouraged to balance and wrap elegantly, especially in onboarding, markdown, and error states. Code, diffs, file paths, and terminal-like surfaces always keep the monospace voice to preserve the product’s technical identity.

## Component Stylings

- **Buttons:** Crisp rounded rectangles with **subtly rounded corners** rather than pill shapes, usually `rounded-lg` with a thin border and medium weight text. Primary buttons are filled with the signal blue and read as the strongest call to action. Secondary and outline buttons stay neutral and slightly translucent. Ghost buttons are minimal and blend into the surface until hover or press. Motion is restrained: a small press scale, a soft hover fill, and a quick focus ring.
- **Cards/Containers:** Cards use **generously rounded corners** on larger surfaces and smaller rounded corners on compact surfaces. They are bordered, lightly elevated, and visually quiet. The dominant treatment is a faint shadow plus a subtle inset highlight, which gives the illusion of material thickness without harsh contrast. Popovers, dialogs, sheets, and command panels follow the same logic, with slightly stronger elevation and optional backdrop blur.
- **Inputs/Forms:** Inputs are clean, bordered fields with a neutral background, tight padding, and a precise focus ring. The shape is **subtly rounded**, with the field boundary clearly defined but never loud. Invalid states use red borders and tinted rings; autofill and pressed states remain understated. Form controls are designed to feel like part of a system, not separate widgets.
- **Sidebars and Navigation:** The sidebar is dense, structured, and efficient. On desktop it occupies a fixed column width, with an icon-collapsed mode for tighter layouts. Active items use the blue selection wash, while hover states use gentle tinted fills. Floating sidebar variants gain rounded corners and a border to feel like a surfaced panel rather than a hard partition.
- **Empty States and Onboarding Panels:** Empty states are centered, bounded by rounded containers, and kept visually calm. They often use a softer card fill, a modest icon frame, and a single strong action button. The goal is reassurance and clarity, not persuasion through decoration.

## Layout Principles

The layout strategy is pane-based, full-height, and controlled. The app prefers locked viewport shells, `min-h-0` containment, and no accidental page scrolling. Content is arranged in predictable columns and split panes, with the sidebar anchoring the left edge and the main workspace filling the remainder of the screen.

Spacing follows a disciplined rhythm: compact headers, moderate internal padding, and slightly more breathing room around empty states and marketing pages. Most structure comes from alignment and border contrast rather than large gaps. The result is efficient without feeling cramped.

Large screens preserve persistent navigation and parallel work surfaces. Smaller screens collapse into sheets and inset panels so the hierarchy stays intact. Safe-area insets are respected, scrollbars are thin, and overflow is carefully managed to keep the interface stable during long sessions, reconnects, and streaming updates.

Depth is used sparingly but intentionally: the default impression is flat and practical, while hover, focus, and modal surfaces receive just enough softness to separate layers. This keeps the interface calm under load and ensures the content always remains the focal point.
