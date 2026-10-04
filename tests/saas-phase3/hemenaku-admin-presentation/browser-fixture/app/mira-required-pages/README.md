# Required pages local QA

This fixture renders the production page list and rich content editor. Every API
request is answered in memory; unknown paths, foreign origins and session writes
are blocked. It has no database, tenant session, provider or remote mutations.
Existing fixture routes and their server handlers are unchanged.

From the repository root:

```sh
node --experimental-transform-types --test tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-required-pages/fixture-transport.test.ts
CELEBIX_FIXTURE_MEMORY_CACHE=1 node node_modules/next/dist/bin/next dev tests/saas-phase3/hemenaku-admin-presentation/browser-fixture --webpack -p 3554
```

Open `http://127.0.0.1:3554/mira-required-pages`. The production edit links lead to
the isolated `/content/pages/[recordId]/edit` fixture. Successful edits persist in
memory across navigation; a full reload restores the blank starter drafts.

## Routes and scenarios

| Local path | Purpose |
| --- | --- |
| `/mira-required-pages` | Required pages plus a legacy custom page, deliberately supplied out of order |
| `/mira-required-pages?view=edit&page=about` | Blank Hakkımızda rich editor |
| `/mira-required-pages?view=edit&page=contact` | Blank İletişim rich editor |
| `/mira-required-pages?view=edit&page=blog` | Blank Blog rich editor |
| `/mira-required-pages?view=edit&page=custom` | Legacy editor with ordinary URL and language fields |
| `?state=readonly` | View without management permission |
| `?state=loading` | Pending local data read |
| `?state=load-error` | Failed read with retry action |
| `?state=save-error&view=edit` | Rejected local save, submitted fields preserved |
| `?state=conflict&view=edit` | Concurrent version change with protected local draft |

Use CUA for the browser verification, without CDP, Playwright shell or hidden
application state. Check the rendered DOM, accessibility state, console and
network only.

## Evidence checks

- At 1440, 1024 and 390 px, list order is Hakkımızda / İletişim / Blog / custom;
  there are no “Zorunlu” labels and required records have no archive action. The custom
  page retains its archive control. No horizontal overflow or console errors.
- Required editors omit address/language controls. Name, formatted body,
  publishing and SEO fields remain editable. Keyboard tab order, focus styles,
  save disabled until dirty and dirty-navigation confirmation work.
- Enter content and save; the list shows the updated name, opening the editor
  again shows the saved body and required identity. Inspect history after save.
- Read-only shows its status and disables editing; no save/archive action.
- Error and conflict saves preserve entered content; loading does not flash the
  legacy placeholder state; load failure offers a retry.
- Capture list/editor screenshots for all three viewports and error/read-only
  screenshots. This is UI evidence only; SQL provisioning, tenant isolation and
  storefront publication require separate backend tests.
