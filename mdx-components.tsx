import { useMDXComponents as getThemeMDXComponents } from "nextra-theme-docs";

type MDXComponents = Record<string, unknown>;

const themeComponents = getThemeMDXComponents();

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...themeComponents,
    ...components,
  };
}
