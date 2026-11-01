# Audited conversion coverage

Source `662f7d6`. This is conditional semantic conversion, not legacy visual parity.

All **74** schema type names are audited: **50** have field-gated mappings and **24** refuse entirely. Untouched one-slide canonical specimens: **46** semantic conversions, **37** persisted imports and **37** atomic refusals. The 37 refused specimens comprise 24 unsupported families, four field gates and nine readable-fit/capacity refusals. These observations do not promise every input of a mapped type fits.

Common field policy: headline is the slide title; section resolves to its exact label plus one-based padded ordinal; standfirst and first-slide deck subtitle use context callouts. Context never becomes an extra sequence step or comparison peer. Source presenters use canonical locked chrome, not editable body content. Visible `speaker_note` is an audience callout; nonempty actual `notes` or `cites` refuse because the accepted scene has no speaker-note/source registry. Unknown top-level or nested fields refuse before coercion.

Before/after roles remain explicit even with identical titles. Each statistic qualifier, KPI trend/change, card body/kicker, pipeline gate, date/event, glossary definition and criterion weight stays associated with its authored carrier/label. Metric comparisons use peer stat carriers and supporting difference/body text.

Theme and style use canonical allowlists/normalization; mode is explicit light/dark. Effective base/operator/owner/source institutional identity, assets and rosters refuse until audited. Bare default slide numbers and supported chrome policy are preserved. Private notes/citations/media are never silently repurposed as body content.

| Source type | Mapping fields beyond common fields | Declared field refusals | Canonical specimen result |
|---|---|---|---|
| `title` | Common fields only | Common/conditional gates | Created |
| `section` | Common fields only | Common/conditional gates | Created |
| `chapter` | Common fields only | Common/conditional gates | Created |
| `closing` | body, cta | Common/conditional gates | Created |
| `agenda` | items | Common/conditional gates | text element legacy-s1:legacy-s1-b1:content (body) cannot fit its box at the readable floor |
| `bullets` | bullets | Common/conditional gates | Created |
| `numbered-list` | items | Common/conditional gates | Created |
| `checklist` | items | Common/conditional gates | Created |
| `feature-grid` | items | Common/conditional gates | field has no audited semantic conversion |
| `grid-items` | items | Common/conditional gates | text element legacy-s1:legacy-s1-b1:content (body) cannot fit its box at the readable floor |
| `icon-list` | Entire type refused | headline, items, presenter, section, speaker_note, standfirst, type | icon-list has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `stacked-list` | items | Common/conditional gates | text element legacy-s1:legacy-s1-b4:content (body) cannot fit its box at the readable floor |
| `cards` | cards | Common/conditional gates | text element legacy-s1:legacy-s1-b3:content (body) cannot fit its box at the readable floor |
| `compare` | left, right, verdict | Common/conditional gates | Created |
| `pros-cons` | pros, cons | Common/conditional gates | Created |
| `before-after` | before, after | after_image, before_image | Created |
| `framework` | Entire type refused | concept, elements, headline, presenter, section, speaker_note, standfirst, type | framework has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `matrix` | Entire type refused | axes, headline, presenter, quadrants, section, speaker_note, standfirst, type | matrix has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `scorecard` | criteria, options | Common/conditional gates | Created |
| `vs` | left, right, left_body, right_body | Common/conditional gates | Created |
| `side-by-side` | Entire type refused | headline, left, presenter, right, section, speaker_note, standfirst, type | side-by-side requires the separately approved portable asset boundary |
| `stats` | stats | Common/conditional gates | text element legacy-s1:legacy-s1-b3:content (body) cannot fit its box at the readable floor |
| `big-number` | value, label, body, sub | Common/conditional gates | Created |
| `kpi-dashboard` | kpis | Common/conditional gates | Created |
| `data-cards` | cards | Common/conditional gates | Created |
| `progress-bars` | Entire type refused | bars, headline, presenter, section, speaker_note, standfirst, type | progress-bars has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `ranking-list` | items | Common/conditional gates | Created |
| `metric-comparison` | left, right, delta, body | Common/conditional gates | Created |
| `sparklines` | Entire type refused | headline, items, presenter, section, speaker_note, standfirst, type | sparklines has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `quote` | quote, attribution | Common/conditional gates | Created |
| `testimonial` | Entire type refused | headline, image, name, presenter, quote, role, section, speaker_note, standfirst, type | testimonial requires the separately approved portable asset boundary |
| `pull-quote` | quote, attribution | Common/conditional gates | Created |
| `epigraph` | quote, attribution, source | Common/conditional gates | Created |
| `callout` | label, body | Common/conditional gates | Created |
| `emphasis` | label, body | Common/conditional gates | Created |
| `warning` | label, body | Common/conditional gates | Created |
| `tip` | label, body | Common/conditional gates | Created |
| `takeaway` | label, body, points | Common/conditional gates | Created |
| `table` | columns, rows | Common/conditional gates | Created |
| `data-table` | columns, rows, row_labels | Common/conditional gates | authored cell alignment is not represented in accepted semantic tables |
| `decision-matrix` | criteria, options | Common/conditional gates | Created |
| `chart` | chart, aside | Common/conditional gates | chart kind scatter has no faithful accepted primitive |
| `flow` | steps, direction | Common/conditional gates | authored flow orientation cannot be preserved by the accepted semantic compiler |
| `funnel` | Entire type refused | headline, presenter, section, speaker_note, stages, standfirst, type | funnel has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `pipeline` | stages | Common/conditional gates | text element legacy-s1:legacy-s1-b2:content (body) cannot fit its box at the readable floor |
| `dependencies` | Entire type refused | headline, nodes, presenter, section, speaker_note, standfirst, type | dependencies has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `branching-flow` | Entire type refused | branches, decision, headline, presenter, section, speaker_note, standfirst, steps, type | branching-flow has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `layered-architecture` | Entire type refused | headline, layers, presenter, section, speaker_note, standfirst, type | layered-architecture has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `image` | Entire type refused | caption, fit, headline, image, presenter, section, speaker_note, standfirst, type | image requires the separately approved portable asset boundary |
| `image-text` | Entire type refused | body, caption, headline, image, presenter, section, side, speaker_note, standfirst, type | image-text requires the separately approved portable asset boundary |
| `illustrated-points` | Entire type refused | caption, headline, image, points, presenter, section, side, speaker_note, standfirst, type | illustrated-points requires the separately approved portable asset boundary |
| `image-grid` | Entire type refused | headline, images, presenter, section, speaker_note, standfirst, type | image-grid requires the separately approved portable asset boundary |
| `hero-image` | Entire type refused | headline, image, presenter, section, speaker_note, standfirst, subtitle, type | hero-image requires the separately approved portable asset boundary |
| `split-screen` | Entire type refused | headline, left, left_caption, presenter, right, right_caption, section, speaker_note, standfirst, type | split-screen requires the separately approved portable asset boundary |
| `timeline` | events | Common/conditional gates | text element legacy-s1:legacy-s1-b1:content (body) cannot fit its box at the readable floor |
| `milestone` | milestones | Common/conditional gates | text element legacy-s1:legacy-s1-b1:content (body) cannot fit its box at the readable floor |
| `roadmap` | Entire type refused | headline, phases, presenter, section, speaker_note, standfirst, time_labels, type | roadmap has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `journey` | Entire type refused | headline, presenter, section, speaker_note, stages, standfirst, type | journey has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `chronology` | events | Common/conditional gates | text element legacy-s1:legacy-s1-b2:content (body) cannot fit its box at the readable floor |
| `references` | items | Common/conditional gates | Created |
| `diagram` | Entire type refused | edges, headline, layout, nodes, presenter, section, speaker_note, standfirst, type | diagram has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `pyramid` | Entire type refused | headline, levels, presenter, section, speaker_note, standfirst, type | pyramid has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `venn` | Entire type refused | headline, presenter, section, sets, speaker_note, standfirst, type | venn has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `hierarchy` | Entire type refused | children, headline, presenter, root, section, speaker_note, standfirst, type | hierarchy has no audited, faithful conversion using the accepted semantic/compiler primitives |
| `definition` | term, definition, example | Common/conditional gates | Created |
| `glossary` | entries | Common/conditional gates | Created |
| `faq` | items | Common/conditional gates | Created |
| `team-grid` | members | Common/conditional gates | Created |
| `attribution` | items | Common/conditional gates | Created |
| `contact` | items | Common/conditional gates | Created |
| `equation` | formula, body, variables | Common/conditional gates | Created |
| `bibliography` | entries | Common/conditional gates | Created |
| `data-source` | sources | Common/conditional gates | Created |
| `freeform` | Entire type refused | headline, html, presenter, section, speaker_note, standfirst, type | freeform HTML is raster-only and cannot become native editable content |

Additional field gates: table row/header cardinality must agree exactly; data-table alignment other than left and highlighted rows refuse; charts accept bar/hbar/line/pie/doughnut/area only and require exact series/category cardinality. Flow orientation explicitly authored in `direction` refuses. Team images and feature icons refuse. Every accepted intent must survive scene realization, exact native data checks, readable fit and PPTX preflight before persistence.

Audit method and complete diagnostics: [coverage-audit.json](coverage-audit.json), reproduced by [audit-coverage.mjs](audit-coverage.mjs). Atomic refusal checks compare project, history and receipt counts. Audits are reported separately from Node leaf test totals. All future expansion is tracked only in [the roadmap](../ROADMAP.md#v2-7b-candidate).
