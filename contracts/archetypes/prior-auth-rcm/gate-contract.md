Archetype `prior-auth-rcm`. These items extend the numbered Gate Contract above
(same numbers). Roles are keys of `brief.roles`; each maps to a brief screen id.
An action is found by its `role` field in `brief.screens[].actions[]`.

6. These kit components take a `dataTour` prop and emit the attribute from it:
   `DataTable`, `Timeline`, `MetricPanel`, `ScenarioBanner`, `DocumentViewer`,
   `ApprovalQueue`, `AuditLog`. Pass the tour target as the prop; never wrap
   the component in a `<div data-tour="...">`. Row ids are derived:
   `DataTable dataTour="X"` renders the container as `X` and each row as
   `X-row-<rowKey(row)>`; `ApprovalQueue dataTour="X"` renders the list as
   `X`, its first item as `X-item`, other items as `X-item-<id>`. Use
   `brief.edge_case.record_id` as the row key of the edge-case record.
   - `tracker` screen: its `DataTable` rows must be `{{row_id_prefix.tracker}}<id>`
     (so its `dataTour` is that prefix minus the trailing `-row-`).
     Give `MetricPanel` the `dataTour` the brief tour targets on this screen.
   - `denials` screen: its `DataTable` rows must be `{{row_id_prefix.denials}}<id>`
     (so its `dataTour` is that prefix minus the trailing `-row-`).
     The element `data-tour="appeal-countdown"` is the countdown on the
     screen itself, always visible, never inside the drawer.
   - `appeals` screen: `ApprovalQueue`. If the brief tour targets `X-item` on this
     screen, its `dataTour` is `X` (the first item then carries `X-item`).
   - `case` screen: `Timeline` with the `dataTour` the brief tour targets on this screen.

10. Clicking the marked edge-case row on the `denials` screen opens a
    `RecordDrawer` (or inline panel) that holds that screen's action buttons.
    After the `move-to-appeals` action the drawer closes so the nav is
    clickable.

15. Clicking any row of the `tracker` screen's table (the `open-case` action,
    `kind: "row-click"`) navigates immediately to the `case` screen with the
    query parameter `{{detail_query_param}}=<id>`, for example
    `<case route>?{{detail_query_param}}=<id>` (under the hash router
    `#<case route>?{{detail_query_param}}=<id>`), and logs that action's
    toast. Do not open a `RecordDrawer`, modal or any other intermediate
    panel on the `tracker` screen, and do not require a second click on a
    button: the row click itself is the navigation. Row-click-opens-a-drawer is
    correct on `denials`, not on `tracker`. The `case` screen reads the query
    parameter `{{detail_query_param}}` and defaults to `brief.edge_case.record_id`.

17. Keep every entry in `nav.ts`. The `appeals` screen stays reachable from the
    nav by an in-app link to its route.
