# The Bus Depot as a Virtual Power Plant — speaker script

The words each presenter says aloud, slide by slide. A slide carries the shape of the argument; this script carries the connection behind it — the full story the bullets point at, grounded in the deck's research. Roughly 60–90 seconds per content slide.


<!-- slide:0 -->
## Slide 1 — The Bus Depot Is a Virtual Power Plant

_Presenter: — · title_

Think of a school bus not as a vehicle that sits idle all summer, but as a giant rolling battery waiting to be dispatched. With at least 26 utilities across 19 states now piloting vehicle-to-grid programs, that idea is already real. In this first section we unpack the control stack that makes it work, from charging to grid services.

<!-- /slide:0 -->

<!-- slide:1 -->
## Slide 2 — Parked Buses Can Carry the Peak

_Presenter: Rohan Das · agenda_

Think about a July afternoon when air conditioners are maxed out and the grid is begging for help. Our school buses are doing nothing — they're parked. That's our opportunity. I'll make the case in three moves. First, I'll show you the grid control stack that turns that parked time into dispatchable power. We're talking managed charging software that schedules charging when electricity is least expensive to avoid peak demand rates, plus bidirectional chargers that let us do vehicle to building for a school and vehicle to grid to send energy back to the utility grid for compensation. That's how we shave the peak instead of firing up those costly fossil fuel peaker plants they displaced in Beverly, Massachusetts. Then we have to prove routes still come first, so second I'll cover fleet operations — how you charge around those set daily schedules and summer idle time, while holding reserve to power shelters and ride through outages. And finally the money, because controls don't matter if rates punish you. I'll walk through new rate structures for demand charges and the proof point I'm proudest of: in the summers of 2021-2024, Highland orchestrated a commercial V2G program with National Grid at Beverly Public Schools, utilizing 3 electric school buses to send 27.7 MWh back to the grid over 316 hours. Let's start with controls.

<!-- /slide:1 -->

<!-- slide:2 -->
## Slide 3 — Chargers Don't Make a Power Plant 2 Controls Do

_Presenter: — · section_

A bus with a big battery is just parking potential until you can control it. So next we'll unpack the stack that makes dispatch possible — managed charging software, bidirectional hardware, and vehicle-to-grid dispatch. Get that right, and those idle midday and summer hours turn into grid value instead of dead asset time.

<!-- /slide:2 -->

<!-- slide:3 -->
## Slide 4 — Four Controls Turn Parked Buses Into Dispatchable Power

_Presenter: Rohan Das · layered-architecture_

Here's the shift: a parked bus isn't stranded capacity if you can command it like a power plant. That starts at the battery itself. The battery management system keeps the cells safe and tells us what we actually have to offer. Above that sits the bidirectional charger — and this is where the physics changes. We're talking about a smaller 12.5kW unit or a large 25kW unit built around a DC power bus, so the same box can send energy back to the utility grid or power a home or building. That's V2G plus V2H in one piece of hardware. But hardware alone doesn't dispatch. Our depot EMS does that. It uses software to schedule and automate their charging sessions when it's most convenient and when electricity is least expensive to avoid peak demand rates. So buses are ready for morning routes, never charging into the peak. Then the top link: the utility DERMS. That's what lets the grid call on us as a distributed resource. And this isn't theory. National Grid successfully delivered power from one electric school bus back to the grid for more than 50 hours over the course of the summer, and Con Edison was testing the charging and discharging of a fleet of five school buses with White Plains. Once you see that control chain work, fleet scheduling becomes the next problem — which is where we're going.

<!-- /slide:3 -->

<!-- slide:4 -->
## Slide 5 — 60kW Chargers Only Matter When Wired Into One VPP Path

_Presenter: Rohan Das · diagram_

Forget the idea that buying electric buses alone cleans the grid. A parked bus does nothing until you give it a single, controllable path to discharge. Think of each of our V2G school buses as a 96 kWh battery on wheels, like the six in Torrance. On their own they're stranded storage. Plug them into 60kW bidirectional DC fast chargers, the same setup we tested with Cajon Valley with SDG&E and Nuvve, and now you have DC discharge turning into AC-DC conversion the grid can actually use. But hardware isn't control. That's why Nuvve sits above the chargers to schedule and automate charging sessions, and why everything lands in one Depot EMS control. The EMS decides when to hold, when to charge, and when to feed the grid at peak demand, specifically to avoid peak demand rates. Add solar plus storage feeding DC solar straight in, with direct DC charging from solar sources, and you've closed the loop. So this stack is our answer to what comes next: fleet operations will live inside these constraints, and economics will prove why dispatching this way pays.

<!-- /slide:4 -->

<!-- slide:5 -->
## Slide 6 — No Bus Exports Until Its Morning Route Is Safe

_Presenter: Rohan Das · flow_

Here's the bargain the grid has to accept if it wants our buses — transport first, grid second, no exceptions. Every bus parked at night already has a job in the morning, so we reserve that run energy first. The V2G model employs the bidirectional EV battery, when it is not in use for its primary mission, to participate in demand management. If the route isn't covered, there is no export. Period. Only then do we ask if this bus can actually give. We check charge level and that it is paired with a similarly capable EVSE, because a bidirectional EV can receive energy from electric vehicle supply equipment and provide energy to an external load when it is paired with a similarly capable EVSE. Third we check money. Managed charging software allows us to schedule and automate charging when electricity is least expensive to avoid peak demand rates, and to dodge demand charges that hit if usage spikes in a specific hour or, sometimes, a 15-minute interval. We only discharge if purchasing electricity during off-peak hours when prices are lower and selling excess energy back during peak hours when prices are higher makes sense. Only then do we answer the call. That is when customers can earn compensation in exchange for energy sent from their EV back to the grid — how National Grid delivered power back for more than 50 hours over the course of the summer, and how Con Edison sent power from five school buses back to customers.

<!-- /slide:5 -->

<!-- slide:6 -->
## Slide 7 — Student Routes Run First — The Grid Gets the Idle Hours

_Presenter: — · section_

We've talked grid controls — now let's talk buses. Kids always come first, morning pickup and afternoon drop-off are non-negotiable. That leaves you a gift: buses on set schedules that sit idle midday and all summer right when demand is high. So how do we turn that parked window into grid value without ever touching a route? That's what fleet operations is about.

<!-- /slide:6 -->

<!-- slide:7 -->
## Slide 8 — Routes First, Then Buses Carry the Peak

_Presenter: Mei Joseph · chronology_

Here's the gift hiding in plain sight after all our talk of controls: buses already work the perfect grid shift. Think through a school day with me. At dawn the priority is kids, period. We run the morning routes, and nothing leaves the battery until we've locked in enough energy for the next run. That rule is non-negotiable. By mid-morning those same buses are back in the lot, just sitting there, right as daytime demand across the city starts climbing. They run the afternoon bell, come home, and again we reserve tomorrow's miles first. Then comes the payoff. Early evening, when demand is at its highest and most expensive and utilities would otherwise fire up costly fossil fuel peaker plants, our parked fleet can discharge. Late night, we flip it, recharge overnight on off-peak time-of-use rates so they're full and ready for the next school day. Do that day after day, and summer is where it compounds. School's out, buses idle for weeks while heat drives peaks. That's how Beverly, with just three buses working with National Grid, sent 27.7 MWh back to the grid over 316 hours. So the operation isn't a disruption. Routes first, grid second, and that daily rhythm is what we'll make dispatchable next.

<!-- /slide:7 -->

<!-- slide:8 -->
## Slide 9 — V2G fails unless five links lock in order

_Presenter: Mei Joseph · dependencies_

Here’s the hard truth no hardware brochure will tell you: you can own the bus and the charger and still export nothing. We’re leaving the grid controls behind and stepping into the depot, because fleet operations decide whether V2G ever happens. Think of it as a chain, and Massachusetts proved in 2015 how it breaks. The Department of Energy Resources put three electric school buses across three school districts, watched them for about a year, wanted to test vehicle-to-grid — and never could, because the lack of resources and trained staff at the districts blocked that phase entirely. So order matters. First, morning routes have to be locked, because buses run set daily schedules and only then do you know when they sit idle in the summer and during portions of the school day when demand is high. Second, people — trained hands on site. Third, bidirectional DC power, the two-way path that lets you charge and discharge. Fourth, interconnection cleared, which means fast-tracking applications and technical help for under-resourced districts. Fifth, a rate that rewards you instead of punishing a single 15-minute interval spike in demand charges. Get that right and the payoff is real. In 2021 National Grid took just one bus in Beverly and delivered power back for more than 50 hours over the course of the summer, shaving peak and cutting the need to fire those costly peaker plants.

<!-- /slide:8 -->

<!-- slide:9 -->
## Slide 10 — Routes Stay On Time While Buses Carry the Peak

_Presenter: Mei Joseph · kpi-dashboard_

Here's the question I get from every transportation director: if I give you my buses for the grid, do my kids still get to school on time? The answer is yes, and we've got the receipts. We've moved out of the control stack into what it actually looks like to run this day to day. Highland was the first to use electric school buses in a commercial Vehicle-to-Grid project in North America, and that operational discipline is why service comes first. In the summers of 2021-2024, Highland orchestrated a commercial V2G program with National Grid at Beverly Public Schools, utilizing 3 electric school buses to send 27.7 MWh back to the grid over 316 hours. Then in 2023-2024, we did it again with Green Mountain Power at South Burlington School District, where the district's 4 electric buses sent 31.7 MWh back to the grid over 282 hours. And that builds on what Con Edison proved testing the charging and discharging of a fleet of five school buses in partnership with White Plains School District. So when you look at this board, hold those two ideas together: routes protected, fleet ready, while peak load disappears. Next, I'll show you how dispatch makes that tradeoff disappear for drivers.

<!-- /slide:9 -->

<!-- slide:10 -->
## Slide 11 — Three Buses Sat a Year 2 Never Exported a Kilowatt

_Presenter: Mei Joseph · warning_

Here's the failure we have to design around. In 2015, the Massachusetts Department of Energy Resources deployed three electric school buses across three corresponding school districts and monitored them for about a year. The goal was to test the V2G application, and V2G was never tested. Not because the chemistry wasn't ready, but because of the lack of resources and trained staff at school districts to support this phase of the pilot program. We've just come out of the control stack — the inverters, the dispatch, the grid handshake. This is where I shift us into fleet operations, because that's where pilots actually live or die. A bus can be technically capable and still never export a kilowatt if no one is trained to plug it, schedule it, and bid it. And there's a second trap waiting. Even if you're ready, the rate can punish you. If you charge during peak usage periods, or you spike overall power usage during a specific hour — sometimes a 15-minute interval during a month — demand charges kick in. Significant cost increases can be incurred if demand charges are increased, enough to erase what you made shaving the peak. So the question for this section isn't can we discharge. It's can we do it without wearing the battery or stranding the morning route.

<!-- /slide:10 -->

<!-- slide:11 -->
## Slide 12 — Translate V2G capability into a bankable, equitable depot plan.

_Presenter: — · section_

We've proven the buses can do the work — now we have to prove the math works. In this final stretch, we'll turn that V2G capability into a depot plan a board can actually approve, one that pays for itself and puts underserved neighborhoods first. You'll leave with revenues, rates, resilience, and how our pilot de-risks it all.

<!-- /slide:11 -->

<!-- slide:12 -->
## Slide 13 — Unmanaged Charging Spikes Bills — V2G Turns Peak Into Revenue

_Presenter: Sara Ali · chart_

Here's where the depot stops being a cost center and starts acting like a power plant. Diesel, look at that first bar — zero. It burns fuel, it never gives anything back to the grid. An electric bus charged the unmanaged way is not much better. Plug in on a hot afternoon and you spike your load for one hour, sometimes one 15-minute interval, and you get hit with demand charges for the month. You pay more precisely when power is most expensive. Now look at the third bar. That is the flip. In 2021 National Grid took one electric school bus in Beverly, Massachusetts and delivered power back to the grid for more than 50 hours over the course of the summer, discharging during peak demand times. Same bus, same battery, but instead of adding to peak, it shaved peak. That matters twice. For you, that export is revenue and avoided demand charges. For the grid, it decreased the need to fire up costly fossil fuel peaker plants and helped reduce local emissions. So let me say it plain: only the V2G bar earns — the other two only cost. And if we can price that peak value right, which is what we will dig into next, electrification pays for itself.

<!-- /slide:12 -->

<!-- slide:13 -->
## Slide 14 — Peak-Shaving Wins Paid Dispatch; Backup Wins Battery Life

_Presenter: Sara Ali · decision-matrix_

Let's follow the money, because that's where V2G lives or dies. We've shown you we can control the dispatch and we can protect the morning routes — now the question is what job should we actually get paid for? I scored our three real choices the way a CFO would: revenue upside first, then how kind it is to the battery, then how simple it is to run day after day. Peak-shaving is our paid dispatch winner. That's the University of Delaware model, where UD as a registered market participant made roughly $1,200 per year per BEV available providing grid support to PJM, with Nuvve as the aggregator. You stay plugged in, you respond when called, you get the market rate. It cycles the battery, yes, but you get compensated for it. Resilience backup flips the tradeoff — keeping buses reserved to provide backup power to buildings during emergencies, like DTE Energy is testing. Beautiful for the community and gentle on battery life because you rarely dispatch, but you rarely get paid either. And TOU arbitrage in the middle — shifting charging off-peak and discharging at peak — saves money but can't match a real market payment. So for our pilot, we lead with paid peak-shaving and keep backup as our resilience story.

<!-- /slide:13 -->

<!-- slide:14 -->
## Slide 15 — Pilot in Three Moves: Test One, Pay Five, Scale Fifty

_Presenter: Sara Ali · roadmap_

Here's where we stop talking about potential and start talking about cashflow. We've shown you buses can keep routes safe, now I'm going to show you how they pay for themselves. We don't start big, we start small and safe. In months zero to three we do exactly what Highland and PEPCO did at Montgomery County Public Schools in fall 2024 — one bus, one successful first discharge test, with morning routes fully reserved. No export until student transportation is guaranteed. Then months four to twelve we earn peak revenue. We copy Con Edison's White Plains test from 2018 to September 2021 with five buses doing peak-shaving, chasing the result Highland proved with National Grid at Beverly — three buses sending 27.7 MWh back over 316 hours to displace those expensive fossil peaker plants. Year two onward we scale to a real virtual power plant modeled on South Burlington, where four buses sent 31.7 MWh back over 282 hours, and we do it equity-first like NV Energy's 50 buses prioritizing marginalized routes, building toward that Portland Clean Energy Fund vision of a resiliency hub in a low-income community.

<!-- /slide:14 -->

<!-- slide:15 -->
## Slide 16 — Sources: Pilot Census, Measured Exports, Federal Playbooks

_Presenter: Sara Ali · bibliography_

If you're going to bet a depot budget on Vehicle-to-Grid, you need receipts, not hype. That's why we're shifting gears here into economics and the pilot, and I want to be upfront about where every dollar and kilowatt-hour I'm about to quote comes from. Our census of scale comes from WRI's Electric School Bus Initiative, updated April 2025, which tracked at least 26 utilities across 19 states committed to pilot electric school bus V2G programs. That tells us this isn't one exotic demo. Then we have measured exports. In summer 2021, National Grid delivered power from one electric school bus back to the grid for more than 50 hours during peak demand in Beverly, Massachusetts, proof that you could shave the peak and avoid firing those costly fossil peaker plants while cutting local emissions. Highland then commercialized it with National Grid at Beverly Public Schools — in the summers of 2021-2024, 3 buses sent 27.7 MWh back over 316 hours. Con Edison proved the New York first between 2018 and September 2021, charging and discharging five buses with White Plains, Lion, Nuvve and National Express, with energy distributed to customers directly. And in 2023-2024, Highland with Green Mountain Power turned 4 buses in South Burlington into a virtual power plant, a distributed energy resource dispatched to optimize the grid, sending 31.7 MWh back over 282 hours.

<!-- /slide:15 -->

<!-- slide:16 -->
## Slide 17 — Dispatch Routes First, Rates Second, Grid Third

_Presenter: — · closing_

We've proven the buses can power the grid — now let's prove the money works. Beverly is our blueprint: 3 buses sent 27.7 MWh back over 316 hours in summers 2021-2024 because we protected morning routes first, then chased rates and grid signals. In this final section I'll show you how to repeat that playbook and make your depot the next grid asset.

<!-- /slide:16 -->
