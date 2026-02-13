/**
 * Unit tests for executeSql safety helpers (lib/ai/tools.ts)
 *
 * Tests the keyword filter, table extraction, table qualification,
 * and workspace CTE injection -- the pure-logic layer that prevents
 * SQL injection and enforces workspace isolation.
 */

import { describe, it, expect } from "vitest";
import {
  hasForbiddenKeyword,
  extractReferencedTables,
  qualifyTableNames,
  buildWorkspaceCTEs,
} from "@/lib/ai/tools";

const WS_ID = "00000000-0000-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// hasForbiddenKeyword -- word-boundary matching
// ---------------------------------------------------------------------------
describe("hasForbiddenKeyword", () => {
  it("blocks actual forbidden keywords", () => {
    expect(hasForbiddenKeyword("delete from people")).toBe(true);
    expect(hasForbiddenKeyword("drop table people")).toBe(true);
    expect(hasForbiddenKeyword("insert into people values (1)")).toBe(true);
    expect(hasForbiddenKeyword("update people set name = 'x'")).toBe(true);
    expect(hasForbiddenKeyword("create table foo (id int)")).toBe(true);
    expect(hasForbiddenKeyword("alter table people add col int")).toBe(true);
    expect(hasForbiddenKeyword("truncate people")).toBe(true);
    expect(hasForbiddenKeyword("grant select on people to public")).toBe(true);
    expect(hasForbiddenKeyword("revoke select on people from public")).toBe(true);
  });

  it("allows column names that contain forbidden substrings", () => {
    expect(hasForbiddenKeyword("select created_at from people")).toBe(false);
    expect(hasForbiddenKeyword("select updated_at from people")).toBe(false);
    expect(hasForbiddenKeyword("select * from people order by created_at desc")).toBe(false);
    expect(hasForbiddenKeyword("select id, created_at, updated_at from companies")).toBe(false);
  });

  it("allows normal SELECT queries", () => {
    expect(hasForbiddenKeyword("select count(*) from people")).toBe(false);
    expect(hasForbiddenKeyword("select first_name, email from people where id = '1'")).toBe(false);
    expect(hasForbiddenKeyword("select p.first_name from people p join companies c on true")).toBe(false);
  });

  it("blocks keywords regardless of position in query", () => {
    expect(hasForbiddenKeyword("select 1; drop table people")).toBe(true);
    expect(hasForbiddenKeyword("select 1 union all delete from people")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractReferencedTables
// ---------------------------------------------------------------------------
describe("extractReferencedTables", () => {
  it("extracts tables from simple FROM clause", () => {
    const tables = extractReferencedTables("SELECT * FROM people");
    expect(tables).toEqual(["people"]);
  });

  it("extracts tables from JOINs", () => {
    const tables = extractReferencedTables(
      "SELECT * FROM people p JOIN companies c ON p.id = c.person_id"
    );
    expect(tables).toContain("people");
    expect(tables).toContain("companies");
  });

  it("extracts schema-qualified table names", () => {
    const tables = extractReferencedTables("SELECT * FROM public.people");
    expect(tables).toEqual(["people"]);
  });

  it("extracts tables from UNION queries", () => {
    const tables = extractReferencedTables(
      "SELECT first_name FROM people UNION ALL SELECT name FROM companies"
    );
    expect(tables).toContain("people");
    expect(tables).toContain("companies");
  });

  it("returns lowercase table names", () => {
    const tables = extractReferencedTables("SELECT * FROM People JOIN Companies ON true");
    expect(tables).toContain("people");
    expect(tables).toContain("companies");
  });
});

// ---------------------------------------------------------------------------
// qualifyTableNames
// ---------------------------------------------------------------------------
describe("qualifyTableNames", () => {
  it("qualifies bare org-scoped table names", () => {
    const result = qualifyTableNames("SELECT * FROM people");
    expect(result).toBe("SELECT * FROM public.people");
  });

  it("qualifies multiple tables in JOINs", () => {
    const result = qualifyTableNames(
      "SELECT * FROM people p JOIN companies c ON true"
    );
    expect(result).toContain("FROM public.people");
    expect(result).toContain("JOIN public.companies");
  });

  it("does not double-qualify already-qualified tables", () => {
    const result = qualifyTableNames("SELECT * FROM public.people");
    expect(result).toBe("SELECT * FROM public.people");
    expect(result).not.toContain("public.public");
  });
});

// ---------------------------------------------------------------------------
// buildWorkspaceCTEs
// ---------------------------------------------------------------------------
describe("buildWorkspaceCTEs", () => {
  it("wraps a single table in a CTE", () => {
    const result = buildWorkspaceCTEs(
      "SELECT * FROM public.people",
      ["people"],
      WS_ID
    );
    expect(result).toContain("WITH _ws_people AS");
    expect(result).toContain(`WHERE workspace_id = '${WS_ID}'`);
    expect(result).toContain("SELECT * FROM _ws_people");
  });

  it("wraps multiple tables for JOIN queries", () => {
    const result = buildWorkspaceCTEs(
      "SELECT * FROM public.people p JOIN public.companies c ON true",
      ["people", "companies"],
      WS_ID
    );
    expect(result).toContain("_ws_people AS");
    expect(result).toContain("_ws_companies AS");
    expect(result).toContain("FROM _ws_people");
    expect(result).toContain("JOIN _ws_companies");
  });

  it("wraps all tables in UNION queries", () => {
    const result = buildWorkspaceCTEs(
      "SELECT first_name, 'person' as type FROM public.people UNION ALL SELECT name, 'company' as type FROM public.companies",
      ["people", "companies"],
      WS_ID
    );
    expect(result).toContain("_ws_people AS");
    expect(result).toContain("_ws_companies AS");
    expect(result).toContain("FROM _ws_people");
    expect(result).toContain("FROM _ws_companies");
    const cteMatches = result.match(/workspace_id = /g);
    expect(cteMatches).toHaveLength(2);
  });

  it("handles subqueries referencing the same table", () => {
    const result = buildWorkspaceCTEs(
      "SELECT * FROM public.people WHERE created_at > (SELECT MIN(created_at) FROM public.people)",
      ["people"],
      WS_ID
    );
    expect(result).toContain("FROM _ws_people WHERE created_at >");
    expect(result).toContain("FROM _ws_people)");
    const cteDefs = result.match(/_ws_people AS/g);
    expect(cteDefs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: full pipeline (qualify -> CTE)
// ---------------------------------------------------------------------------
describe("full SQL safety pipeline", () => {
  it("handles 'show 5 most recent people by created_at'", () => {
    const query = "SELECT first_name, created_at FROM people ORDER BY created_at DESC LIMIT 5";
    const lower = query.toLowerCase();

    expect(hasForbiddenKeyword(lower)).toBe(false);

    const tables = extractReferencedTables(query);
    expect(tables).toContain("people");

    const qualified = qualifyTableNames(query);
    const final = buildWorkspaceCTEs(qualified, tables, WS_ID);
    expect(final).toContain("WITH _ws_people AS");
    expect(final).toContain("ORDER BY created_at DESC LIMIT 5");
  });

  it("handles multi-table count query", () => {
    const query =
      "SELECT 'people' as entity, COUNT(*) FROM people UNION ALL SELECT 'companies', COUNT(*) FROM companies";
    const lower = query.toLowerCase();

    expect(hasForbiddenKeyword(lower)).toBe(false);

    const tables = extractReferencedTables(query);
    expect(tables).toContain("people");
    expect(tables).toContain("companies");

    const qualified = qualifyTableNames(query);
    const final = buildWorkspaceCTEs(qualified, tables, WS_ID);

    expect(final).toContain("_ws_people AS");
    expect(final).toContain("_ws_companies AS");
    expect(final).toContain("FROM _ws_people");
    expect(final).toContain("FROM _ws_companies");
  });
});
