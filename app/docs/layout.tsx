import type { ReactNode } from "react";
import Link from "next/link";
import { Footer, Layout, Navbar } from "nextra-theme-docs";
import { Search } from "nextra/components";
import { getPageMap } from "nextra/page-map";

import "nextra-theme-docs/style.css";

export const metadata = {
  title: {
    default: "OpenFolio Docs",
    template: "%s | OpenFolio Docs",
  },
  description: "Documentation for OpenFolio — the open-source, AI-native personal CRM.",
};

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const pageMap = await getPageMap("/docs");

  return (
    <Layout
      navbar={
        <Navbar
          logo={<Link href="/"><b>OpenFolio</b></Link>}
          projectLink="https://github.com/unlatch-ai/OpenFolio"
        />
      }
      footer={
        <Footer>
          AGPL-3.0 {new Date().getFullYear()} OpenFolio
        </Footer>
      }
      search={<Search />}
      pageMap={pageMap}
      docsRepositoryBase="https://github.com/unlatch-ai/OpenFolio/tree/main/content"

      editLink="Edit this page on GitHub"
      sidebar={{ defaultMenuCollapseLevel: 1 }}
      toc={{ backToTop: true }}
    >
      {children}
    </Layout>
  );
}
