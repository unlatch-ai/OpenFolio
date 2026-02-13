"use client";

import React from "react";
import { CitationCard } from "./CitationCard";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

interface MessageContentProps {
  content: string;
}

type CitationType = "person" | "company" | "interaction";

const citationHrefRegex = /^(person|company|interaction):([a-z0-9-]+)$/i;

function parseCitationHref(href?: string) {
  if (!href) return null;
  const match = citationHrefRegex.exec(href);
  if (!match) return null;
  return {
    type: match[1].toLowerCase() as CitationType,
    id: match[2],
  };
}

function getNodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(getNodeText).join("");
  }
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function isCitationOnly(children: React.ReactNode) {
  const list = React.Children.toArray(children).filter((child) => {
    if (typeof child === "string") {
      return child.trim().length > 0;
    }
    return true;
  });
  if (list.length !== 1) return false;
  const onlyChild = list[0];
  if (!React.isValidElement(onlyChild)) return false;
  const props = onlyChild.props as Record<string, unknown>;
  return Boolean(props["data-citation-card"]);
}

export function MessageContent({ content }: MessageContentProps) {
  if (!content) return null;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        urlTransform={(url) => {
          if (parseCitationHref(url)) {
            return url;
          }
          return defaultUrlTransform(url);
        }}
        components={{
          a: ({ href, children }) => {
            const citation = parseCitationHref(href);
            if (citation) {
              const name = getNodeText(children) || "Untitled";
              return (
                <span data-citation-card>
                  <CitationCard type={citation.type} id={citation.id} name={name} />
                </span>
              );
            }

            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => {
            const items = React.Children.toArray(children);
            const isCitationList =
              items.length > 0 &&
              items.every(
                (child) => {
                  if (!React.isValidElement(child)) return false;
                  const props = child.props as Record<string, unknown>;
                  return Boolean(props["data-citation-item"]);
                }
              );
            return (
              <ul
                className={
                  isCitationList
                    ? "flex flex-wrap gap-2 list-none pl-0 mb-2"
                    : "list-disc pl-4 mb-2"
                }
              >
                {children}
              </ul>
            );
          },
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
          li: ({ children }) => {
            const citationOnly = isCitationOnly(children);
            return (
              <li
                data-citation-item={citationOnly || undefined}
                className={citationOnly ? "list-none m-0 p-0" : "mb-1"}
              >
                {children}
              </li>
            );
          },
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="bg-muted p-3 rounded-lg overflow-x-auto mb-2">
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
