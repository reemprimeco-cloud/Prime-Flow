# Fiery Print Settings

Structured print settings on every order and order item, mirroring the
Fiery Command WorkStation **Job Properties** the operator has to set before
printing. The manager fills them in on the order form; the employee reads
them off the job card before opening the file.

## Fields

| Field | Source on the Fiery | Stored as |
|---|---|---|
| Preset | Presets dropdown (server + local) | free text, with the shop's presets suggested |
| Media type | Media → Media type | free text, grouped list (most-used families first) |
| Paper source | Media → Paper source | `auto`, `multi_purpose_tray`, `drawer_1..3`, `paper_deck` |
| Paper size | Media → Output paper size | free text: standard sheets, custom sheets (33 x 48 cm…), "Add custom size…" |
| Sides | 2-sided printing | `simplex`, `duplex_long`, `duplex_short` |
| Color mode | Color → Color mode | `cmyk`, `grayscale` |
| Layout + Binding | Layout → Normal / Gangup / Booklet, binding edge | `normal`, `gangup`, `booklet` + `left`/`right` |
| Fold | Finishing → Fold style | `none`, `saddle`, `half`, `tri`, `z`, `gate` |
| Staple | Finishing → Stapler mode | `off`, `corner_*`, `double_*`, `saddle_stitch` |
| Other | anything else (resolution, image quality…) | free text |
| Mixed media | Media → Mixed media | list of ranges: `front_cover`, `back_cover`, `page_range`, `insert`, each with its own media type, paper size, source, sides, colour mode |

Every field is optional. A mixed-media field left empty inherits the job's
own setting. Option lists live in `lib/print-settings/index.ts`; adding a
preset or media family is a one-line change there (no migration).

## Storage

`orders.print_settings` and `order_items.print_settings` (jsonb, nullable;
migration `0028_print_settings.sql`). Empty settings are stored as `null`,
never `{}`. Reads go through `parsePrintSettings`, which treats anything
malformed as "no settings", so a hand-edited row can never break a page.

Custom paper sizes are not a separate table: the form suggests every size
used on the last 300 orders (`listPaperSizeSuggestions`), so a size typed
once is one tap next time.

## Where it shows

- **Order form** (manager): a collapsible "Fiery · Print Settings" block
  under Specifications for item 1, and one inside each additional item.
- **Employee job card**: a red Fiery block under Qty, above Order Details,
  with mixed-media ranges listed underneath. Absent when nothing is set.
- **Order drawer**: a "Fiery Print Settings" section, and a one-line
  summary per additional item.
- **Dashboard card** and the employee's items checklist: one summary line.

QuickBooks imports and public order requests arrive with no print settings;
the manager adds them when editing the order.

## Rolling back

The production state before this update is kept on the branch
`pre-fiery-print-settings` (commit `7523e87`). Reverting the merge commit
restores it; the two jsonb columns can stay in place harmlessly.
