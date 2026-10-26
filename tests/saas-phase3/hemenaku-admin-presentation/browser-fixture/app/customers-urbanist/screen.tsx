"use client";

import { useEffect, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from "react";
import { CUSTOMER_ID, CUSTOMERS, NOW, SEGMENTS, SUMMARY, TAGS, listItem, workspace } from "./fixture-data";

type Modules = {
  Layout: ComponentType<{ model: any; children: ReactNode }>;
  Workspace: ComponentType<{ canManage: boolean; primaryCustomerAction?: boolean; children: ReactNode }>;
  List: ComponentType<{ canManage: boolean; embedded?: boolean }>;
  New: ComponentType;
  Detail: ComponentType<{ customerId: string; canManage: boolean; canArchive: boolean; segmentsAvailable: boolean }>;
  Edit: ComponentType<{ customerId: string }>;
  Taxonomy: ComponentType<{ kind: "tags" | "segments"; canManage: boolean; embedded?: boolean }>;
};
const MODEL = { analyticsAvailable: false, storeSlug: "customers-urbanist-fixture", membershipLabel: "Mağaza sahibi", planCode: "growth", planVersion: 2, entitlementStatus: "active" as const, storefrontHostname: "customers-urbanist.example.test", locale: "tr-TR" };
const VIEWS = ["list", "new", "detail", "edit", "tags", "segments"];

/** Local visual acceptance only: real components and strict synthetic API, no network fallback. */
export function CustomersUrbanistFixture({ view, scenario, customerId }: { view: string; scenario: string; customerId?: string }) {
  const [modules, setModules] = useState<Modules>();
  const [failure, setFailure] = useState("");
  const retryAllowed = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const originalFetch = window.fetch;
    retryAllowed.current = false;
    const knownIds = new Set(CUSTOMERS.map(customer => customer.id));
    window.fetch = async (input, init) => {
      const request = new Request(new URL(input instanceof Request ? input.url : String(input), window.location.href), input instanceof Request ? input : init);
      const url = new URL(request.url);
      if (url.origin !== window.location.origin) return Response.json({ code: "membership_denied" }, { status: 403 });
      const path = url.pathname;
      const match = path.match(/^\/api\/customers\/([a-f0-9-]{36})(?:\/(workspace|archive|notes|tags|segments))?$/);
      const knownRecord = Boolean(match && knownIds.has(match[1]));
      const knownPath = path === "/api/customers" || ["summary", "tags", "segments", "export"].some(name => path === `/api/customers/${name}`) || knownRecord;
      if (!knownPath) return Response.json({ code: "membership_denied" }, { status: 403 });
      if (url.search && (path !== "/api/customers" || request.method !== "GET")) return Response.json({ code: "invalid_input" }, { status: 400 });
      if (request.method === "POST") {
        if (scenario === "readonly") return Response.json({ code: "membership_denied" }, { status: 403 });
        const writable = path === "/api/customers" || path === "/api/customers/tags" || path === "/api/customers/segments" || knownRecord && match?.[2] !== "workspace";
        return Response.json({ code: writable ? "version_conflict" : "membership_denied" }, { status: writable ? 409 : 403 });
      }
      if (request.method !== "GET") return Response.json({ code: "membership_denied" }, { status: 403 });
      if (scenario === "loading") return new Promise<Response>(() => {});
      if (scenario === "error" && !retryAllowed.current) return Response.json({ code: "unavailable" }, { status: 503 });
      if (scenario === "locked" && path === "/api/customers/segments") return Response.json({ code: "feature_not_enabled" }, { status: 403 });
      const empty = scenario === "empty";
      if (path === "/api/customers/summary") return Response.json(empty ? { active: 0, archived: 0, consentedEmail: 0, totalSpentCents: 0, currency: "TRY", asOf: NOW } : SUMMARY);
      if (path === "/api/customers/tags") return Response.json({ items: empty ? [] : TAGS });
      if (path === "/api/customers/segments") return Response.json({ items: empty ? [] : SEGMENTS });
      if (path === "/api/customers/export") return Response.json({ items: empty ? [] : CUSTOMERS.map(listItem), exportedAt: NOW });
      if (knownRecord && match) {
        const record = CUSTOMERS.find(customer => customer.id === match[1])!;
        if (match[2] === "workspace") return Response.json(workspace(record.id, empty));
        if (match[2]) return Response.json({ code: "customer_not_found" }, { status: 404 });
        return Response.json({ ...record, ...(scenario === "archived" ? { status: "archived" } : {}), ...(empty ? { addresses: [], consents: [], notes: [], tags: [], segments: [], orderCount: 0, totalSpentCents: 0 } : {}) });
      }
      const keys = Array.from(url.searchParams.keys());
      if (keys.some(key => !["pageSize", "search", "status", "cursor"].includes(key)) || new Set(keys).size !== keys.length || url.searchParams.get("pageSize") !== "25") return Response.json({ code: "invalid_input" }, { status: 400 });
      const status = url.searchParams.get("status"), cursor = url.searchParams.get("cursor"), query = (url.searchParams.get("search") ?? "").toLocaleLowerCase("tr-TR");
      if (status && status !== "active" && status !== "archived" || cursor && cursor !== "fixture-page-2") return Response.json({ code: "invalid_input" }, { status: 400 });
      const records = (empty ? [] : CUSTOMERS).filter(customer => (!status || customer.status === status) && [customer.displayName, customer.email ?? "", customer.phone ?? ""].some(value => value.toLocaleLowerCase("tr-TR").includes(query)));
      return Response.json({ items: (cursor ? records.slice(4) : records.slice(0, 4)).map(listItem), ...(!cursor && records.length > 4 ? { nextCursor: "fixture-page-2" } : {}) });
    };
    // customerApi captures fetch at module evaluation, so install the synthetic transport first.
    void Promise.all([
      import("@/components/panel/PanelLayoutClient"), import("@/components/customers/CustomerWorkspace"),
      import("@/components/customers/CustomerListConsole"), import("@/components/customers/CustomerFormConsole"),
      import("@/components/customers/CustomerDetailConsole"), import("@/components/customers/CustomerEditConsole"),
      import("@/components/customers/CustomerTaxonomyConsole"),
    ]).then(([layout, workspace, list, form, detail, edit, taxonomy]) => {
      if (!cancelled) setModules({ Layout: layout.PanelLayoutClient, Workspace: workspace.CustomerWorkspace, List: list.CustomerListConsole, New: form.CustomerFormConsole, Detail: detail.CustomerDetailConsole, Edit: edit.CustomerEditConsole, Taxonomy: taxonomy.CustomerTaxonomyConsole });
    }).catch(error => { if (!cancelled) setFailure(String(error)); });
    return () => { cancelled = true; window.fetch = originalFetch; };
  }, [scenario]);
  if (failure) return <p role="alert">{failure}</p>;
  if (!modules) return <p role="status">Yerel örnek hazırlanıyor…</p>;
  const { Layout, Workspace, List, New, Detail, Edit, Taxonomy } = modules;
  const selectedView = VIEWS.includes(view) ? view : "list";
  const id = CUSTOMERS.some(customer => customer.id === customerId) ? customerId! : CUSTOMER_ID;
  const canManage = scenario !== "readonly";
  const captureNavigation = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest("button");
    if (scenario === "error" && button?.textContent?.trim() === "Tekrar dene") retryAllowed.current = true;
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin || !/^\/customers(?:\/|$)/.test(target.pathname)) return;
    event.preventDefault();
    const path = target.pathname.split("/").filter(Boolean);
    const next = path.length === 1 ? "list" : ["new", "tags", "segments"].includes(path[1]) ? path[1] : path[2] === "edit" ? "edit" : "detail";
    const query = new URLSearchParams({ view: next, state: scenario });
    if (path[1] && CUSTOMERS.some(customer => customer.id === path[1])) query.set("id", path[1]);
    window.location.assign(`/customers-urbanist?${query}`);
  };
  let content: ReactNode;
  if (!canManage && (selectedView === "new" || selectedView === "edit")) content = <p role="alert">Bu müşteri işlemi için yetkiniz yok.</p>;
  else if (selectedView === "new") content = <New />;
  else if (selectedView === "edit") content = <Edit customerId={id} />;
  else if (selectedView === "detail") content = <Detail customerId={id} canManage={canManage} canArchive={canManage} segmentsAvailable={scenario !== "locked"} />;
  else content = <Workspace canManage={canManage} primaryCustomerAction={selectedView === "list"}>{selectedView === "tags" || selectedView === "segments" ? <Taxonomy kind={selectedView} canManage={canManage} embedded /> : <List canManage={canManage} embedded />}</Workspace>;
  return <div data-fixture="customers-urbanist" data-view={selectedView} data-state={scenario} data-qa-ready="true" onClickCapture={captureNavigation}><Layout model={MODEL}>{content}</Layout></div>;
}
