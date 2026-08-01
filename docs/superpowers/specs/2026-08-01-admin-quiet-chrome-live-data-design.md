# Admin Quiet Chrome and Live Data Design

## Goal

Make the merchant admin concise and operational: each route has one visible page identity in the fixed top bar, content begins directly with controls or data, and every status shown to the merchant reflects current application authority rather than explanatory filler.

## Scope

This slice applies to the shared customer admin shell and therefore to every tenant, including Güzide Kuyumcu. It covers:

- repeated page titles and descriptions;
- dashboard channel, period, freshness, and update information;
- wrapping status badges;
- search icons that collide with placeholder text;
- desktop and mobile responsive behavior for these shared elements.

It does not redesign page-specific workflows, tables, forms, or navigation.

## Approved Experience

### One visible page identity

`PanelPageHeader` remains the compatibility API used by existing routes, but it publishes its title, optional subtitle, and actions to the top-bar bridge only. It must not render a second visible heading or descriptive paragraph in the content area.

The fixed top bar is the single visible page identity. Existing page actions continue to use the top-bar action portal on desktop and their established mobile fallbacks where a workflow already provides them.

### Quiet content

After the header bridge, a page starts with its first useful control, form, list, table, state, or action. Generic explanatory copy is not retained merely to fill space. Page-specific instructions remain only where they are required to complete a workflow or explain an error.

### Dashboard live context

The dashboard summary toolbar moves out of the content body and into a dedicated top-bar context slot. It contains:

- the actual storefront connection state;
- the working analytics-period selector;
- the current analytics loading, ready, or error state;
- the server-provided analytics generation time when available.

The fixed phrase `Kalıcı verilere göre` is removed. The displayed freshness label is derived from runtime state:

- `Canlı` when the current analytics response is ready;
- `Güncelleniyor` while a new period or refresh request is loading;
- `Veri alınamadı` when the analytics request fails;
- `Veri bekleniyor` when the authority is not yet available.

`Son güncelleme` is rendered only from the analytics response's `generatedAt` value. The storefront label is derived from the tenant chrome model and never hard-coded as verified.

### Responsive top bar

The top bar gains a contextual-content host separate from command actions. On wide screens, title, live context, page actions, and global utilities share the bar without overlapping. At narrower desktop widths, context may wrap to a compact second row. On mobile, the same live context becomes a horizontally scrollable or wrapped utility row below the title without hiding controls or changing their meaning.

### Shared control corrections

- Status badges use `white-space: nowrap`, stable inline-flex sizing, and a line height that prevents two-line pills such as `Teslim edildi`.
- Icon-bearing search fields reserve their icon area after all generic input rules have been applied. The icon and placeholder cannot occupy the same horizontal space.
- Focus rings, 48-pixel minimum interactive targets, and existing semantic labels remain intact.

## Component Boundaries

- `PanelPageHeader`: publishes chrome only; no duplicate visible markup.
- `PanelTopbarChrome`: carries page identity, actions, and optional contextual content through independent portals.
- `PanelLayoutClient`: owns the top-bar context host and responsive shell arrangement.
- `PanelDashboardHomeView`: supplies live dashboard context from existing runtime state and removes the body-level summary toolbar.
- Shared panel CSS: owns non-wrapping status-badge behavior.
- Quick-order link CSS: owns search-field icon spacing with sufficient selector priority.

These boundaries keep route components declarative and avoid editing every admin page independently.

## Data and State Flow

1. The dashboard loads tenant chrome and analytics through the existing APIs.
2. `PanelDashboardHomeView` derives storefront connection, period, freshness label, and update time from those results.
3. `PanelTopbarBridge` publishes page text and portals the live context into the shell.
4. Period changes continue through the existing `onPeriodChange` callback and immediately change freshness to `Güncelleniyor` until the matching response arrives.
5. Missing or failed data produces an honest status; no fake timestamp, verification state, or placeholder metric is invented.

## Error Handling

Moving information into the top bar must not hide failures. Analytics errors remain visible through the existing dashboard error surface and are also summarized as `Veri alınamadı` in the top bar. If the top-bar portal is not mounted during route transition, the page remains functional and the context appears once the shared host mounts.

## Verification

- Source/component tests prove `PanelPageHeader` no longer renders a visible content heading.
- Top-bar tests prove contextual content uses its own portal and survives route transitions without leaking stale state.
- Dashboard tests cover ready, loading, error, unavailable, verified-storefront, and pending-storefront states.
- Styling tests or rendered assertions cover single-line status badges and preserved search-input icon padding.
- Type checking and the existing customer-panel test suite pass.
- Browser verification covers Güzide Kuyumcu admin at desktop and mobile widths, including dashboard period selection, a route with `PanelPageHeader`, order status pills, and quick-order product search.
- Browser console has no relevant warnings or errors, and screenshots show no repeated heading, clipping, overlap, or unintended wrapping.

## Acceptance Criteria

1. No admin route displays the same page title in both the fixed top bar and content body.
2. Generic page descriptions do not consume content space.
3. Dashboard channel, period, freshness, and update time appear in the top-bar region and are absent from the body.
4. Dashboard freshness and timestamp reflect live request data and state.
5. `Teslim edildi` and other status badges remain on one line.
6. Search icons never overlap placeholder or entered text.
7. The behavior applies through shared components to all tenants without changing tenant isolation or backend authority.
