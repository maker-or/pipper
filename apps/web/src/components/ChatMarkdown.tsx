import { type ServerProviderSkill } from "@t3tools/contracts";
import {
  memo,
  useCallback,
  useMemo,
  type ComponentPropsWithoutRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Streamdown, defaultUrlTransform, type UrlTransform } from "streamdown";
import { renderSkillInlineMarkdownChildren } from "./chat/SkillInlineText";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { openInPreferredEditor } from "../editorPreferences";
import {
  normalizeMarkdownLinkDestination,
  resolveMarkdownFileLinkMeta,
  rewriteMarkdownFileUriHref,
} from "../markdown-links";
import { readLocalApi } from "../localApi";
import { cn } from "../lib/utils";

const MARKDOWN_FILE_LINK_CLASS_NAME =
  "chat-markdown-file-link relative top-[2px] max-w-full no-underline";
const MARKDOWN_FILE_LINK_LABEL_CLASS_NAME = "chat-markdown-file-link-label truncate";
const MARKDOWN_LINK_HREF_PATTERN = /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

interface ChatMarkdownProps {
  text: string;
  cwd: string | undefined;
  isStreaming?: boolean;
  skills?: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
}

const EMPTY_MARKDOWN_SKILLS: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">> = [];

type Components = ComponentPropsWithoutRef<typeof Streamdown>["components"];
type MarkdownComponents = NonNullable<Components>;

function pathParentSegments(path: string): string[] {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  return segments.slice(0, -1);
}

function buildFileLinkParentSuffixByPath(filePaths: ReadonlyArray<string>): Map<string, string> {
  const groups = new Map<string, Set<string>>();
  for (const filePath of filePaths) {
    const pathSegments = filePath
      .replaceAll("\\", "/")
      .split("/")
      .filter((segment) => segment.length > 0);
    const basename = pathSegments[pathSegments.length - 1];
    if (!basename) continue;
    const group = groups.get(basename) ?? new Set<string>();
    group.add(filePath);
    groups.set(basename, group);
  }

  const suffixByPath = new Map<string, string>();
  for (const group of groups.values()) {
    const uniquePaths = [...group];
    if (uniquePaths.length < 2) continue;

    const parentSegmentsByPath = new Map(
      uniquePaths.map((filePath) => [filePath, pathParentSegments(filePath)]),
    );
    const minUniqueDepthByPath = new Map<string, number>();

    for (const filePath of uniquePaths) {
      const segments = parentSegmentsByPath.get(filePath) ?? [];
      let resolvedDepth = segments.length;
      for (let depth = 1; depth <= segments.length; depth += 1) {
        const candidate = segments.slice(-depth).join("/");
        const collision = uniquePaths.some((otherPath) => {
          if (otherPath === filePath) return false;
          const otherSegments = parentSegmentsByPath.get(otherPath) ?? [];
          return otherSegments.slice(-depth).join("/") === candidate;
        });
        if (!collision) {
          resolvedDepth = depth;
          break;
        }
      }
      minUniqueDepthByPath.set(filePath, resolvedDepth);
    }

    for (const filePath of uniquePaths) {
      const segments = parentSegmentsByPath.get(filePath) ?? [];
      if (segments.length === 0) continue;
      const minUniqueDepth = minUniqueDepthByPath.get(filePath) ?? 1;
      const suffixDepth = Math.min(segments.length, Math.max(minUniqueDepth, 2));
      suffixByPath.set(filePath, segments.slice(-suffixDepth).join("/"));
    }
  }

  return suffixByPath;
}

function extractMarkdownLinkHrefs(text: string): string[] {
  const hrefs: string[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK_HREF_PATTERN)) {
    const href = match[1]?.trim();
    if (!href) continue;
    hrefs.push(href);
  }
  return hrefs;
}

function normalizeMarkdownLinkHrefKey(href: string): string {
  const normalizedHref = normalizeMarkdownLinkDestination(href);
  return rewriteMarkdownFileUriHref(normalizedHref) ?? normalizedHref;
}

interface MarkdownFileLinkProps {
  href: string;
  targetPath: string;
  displayPath: string;
  label: string;
  className?: string | undefined;
}

const MarkdownFileLink = memo(function MarkdownFileLink({
  href,
  targetPath,
  displayPath,
  label,
  className,
}: MarkdownFileLinkProps) {
  const handleOpen = useCallback(() => {
    const api = readLocalApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Open in editor is unavailable",
      });
      return;
    }

    void openInPreferredEditor(api, targetPath).catch((error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Unable to open file",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    });
  }, [targetPath]);

  const handleCopy = useCallback((value: string, title: string) => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: `Failed to copy ${title.toLowerCase()}`,
          description: "Clipboard API unavailable.",
        }),
      );
      return;
    }

    void navigator.clipboard.writeText(value).then(
      () => {
        toastManager.add({
          type: "success",
          title: `${title} copied`,
          description: value,
        });
      },
      (error) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to copy ${title.toLowerCase()}`,
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      },
    );
  }, []);

  const handleContextMenu = useCallback(
    async (event: ReactMouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const api = readLocalApi();
      if (!api) return;

      const clicked = await api.contextMenu.show(
        [
          { id: "open", label: "Open in editor" },
          { id: "copy-relative", label: "Copy relative path" },
          { id: "copy-full", label: "Copy full path" },
        ] as const,
        { x: event.clientX, y: event.clientY },
      );

      if (clicked === "open") {
        handleOpen();
        return;
      }
      if (clicked === "copy-relative") {
        handleCopy(displayPath, "Relative path");
        return;
      }
      if (clicked === "copy-full") {
        handleCopy(targetPath, "Full path");
      }
    },
    [displayPath, handleCopy, handleOpen, targetPath],
  );

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            className={cn(MARKDOWN_FILE_LINK_CLASS_NAME, className)}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleOpen();
            }}
            onContextMenu={handleContextMenu}
          >
            <span className={MARKDOWN_FILE_LINK_LABEL_CLASS_NAME}>{label}</span>
          </a>
        }
      />
      <TooltipPopup
        side="top"
        className="max-w-[min(40rem,calc(100vw-2rem))] font-mono text-[11px] leading-tight"
      >
        <div className="markdown-file-link-tooltip-scroll overflow-x-auto whitespace-nowrap">
          {displayPath}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}, areMarkdownFileLinkPropsEqual);

function areMarkdownFileLinkPropsEqual(
  previous: Readonly<MarkdownFileLinkProps>,
  next: Readonly<MarkdownFileLinkProps>,
): boolean {
  return (
    previous.href === next.href &&
    previous.targetPath === next.targetPath &&
    previous.displayPath === next.displayPath &&
    previous.label === next.label &&
    previous.className === next.className
  );
}

function ChatMarkdown({
  text,
  cwd,
  isStreaming = false,
  skills = EMPTY_MARKDOWN_SKILLS,
}: ChatMarkdownProps) {
  const markdownFileLinkMetaByHref = useMemo(() => {
    const metaByHref = new Map<
      string,
      NonNullable<ReturnType<typeof resolveMarkdownFileLinkMeta>>
    >();
    for (const href of extractMarkdownLinkHrefs(text)) {
      const normalizedHref = normalizeMarkdownLinkHrefKey(href);
      if (metaByHref.has(normalizedHref)) continue;
      const meta = resolveMarkdownFileLinkMeta(normalizedHref, cwd);
      if (meta) {
        metaByHref.set(normalizedHref, meta);
      }
    }
    return metaByHref;
  }, [cwd, text]);
  const fileLinkParentSuffixByPath = useMemo(() => {
    const filePaths = [...markdownFileLinkMetaByHref.values()].map((meta) => meta.filePath);
    return buildFileLinkParentSuffixByPath(filePaths);
  }, [markdownFileLinkMetaByHref]);
  const markdownUrlTransform = useCallback<UrlTransform>((href, key, node) => {
    return rewriteMarkdownFileUriHref(href) ?? defaultUrlTransform(href, key, node);
  }, []);
  const markdownComponents = useMemo<MarkdownComponents>(
    () => ({
      h1({ node: _node, children, ...props }) {
        return <h1 {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</h1>;
      },
      h2({ node: _node, children, ...props }) {
        return <h2 {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</h2>;
      },
      h3({ node: _node, children, ...props }) {
        return <h3 {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</h3>;
      },
      h4({ node: _node, children, ...props }) {
        return <h4 {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</h4>;
      },
      h5({ node: _node, children, ...props }) {
        return <h5 {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</h5>;
      },
      h6({ node: _node, children, ...props }) {
        return <h6 {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</h6>;
      },
      blockquote({ node: _node, children, ...props }) {
        return (
          <blockquote {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</blockquote>
        );
      },
      p({ node: _node, children, ...props }) {
        return <p {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</p>;
      },
      li({ node: _node, children, ...props }) {
        return <li {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</li>;
      },
      th({ node: _node, children, ...props }) {
        return <th {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</th>;
      },
      td({ node: _node, children, ...props }) {
        return <td {...props}>{renderSkillInlineMarkdownChildren(children, skills)}</td>;
      },
      a({ node: _node, href, ...props }) {
        const normalizedHref = href ? normalizeMarkdownLinkHrefKey(href) : "";
        const fileLinkMeta = normalizedHref ? markdownFileLinkMetaByHref.get(normalizedHref) : null;
        if (!fileLinkMeta) {
          return <a {...props} href={href} target="_blank" rel="noopener noreferrer" />;
        }

        const parentSuffix = fileLinkParentSuffixByPath.get(fileLinkMeta.filePath);
        const labelParts = [fileLinkMeta.basename];
        if (typeof parentSuffix === "string" && parentSuffix.length > 0) {
          labelParts.push(parentSuffix);
        }
        if (fileLinkMeta.line) {
          labelParts.push(
            `L${fileLinkMeta.line}${fileLinkMeta.column ? `:C${fileLinkMeta.column}` : ""}`,
          );
        }

        return (
          <MarkdownFileLink
            href={fileLinkMeta.targetPath}
            targetPath={fileLinkMeta.targetPath}
            displayPath={fileLinkMeta.displayPath}
            label={labelParts.join(" · ")}
            className={props.className}
          />
        );
      },
    }),
    [fileLinkParentSuffixByPath, markdownFileLinkMetaByHref, skills],
  );

  return (
    <div className="chat-markdown w-full min-w-0 text-base leading-relaxed text-foreground/80">
      <Streamdown
        animated={{ animation: "blurIn", duration: 200, easing: "ease-out" }}
        isAnimating={isStreaming}
        components={markdownComponents}
        urlTransform={markdownUrlTransform}
      >
        {text}
      </Streamdown>
    </div>
  );
}

export default ChatMarkdown;
