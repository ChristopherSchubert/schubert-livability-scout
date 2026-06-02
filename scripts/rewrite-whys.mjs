// "Why this could be the place" — paragraph-length pitches for every city.
// Voice: explain like to a smart friend who's never heard of these places.
// Structure per city: (1) where it is, what it looks like, the climate, the
// walkable spine; (2) the case for living there + the honest tradeoff. No
// inside jokes, no familiar shorthand — every sentence pulls weight.
import pg from "pg";
import { execSync } from "node:child_process";

const W = {
  // ── Pacific Coast / PNW ─────────────────────────────────────────────────
  "Santa Barbara, CA":
`Santa Barbara sits about 90 miles north of Los Angeles on the California coast, in a narrow strip of land where the Santa Ynez Mountains rise four thousand feet almost straight up out of the Pacific. That geography is the whole story: a thousand-meter mountain wall is half a mile behind you, the open ocean is half a mile in front, and the town is sandwiched between them. It's a small city — about 90,000 people — with a Mediterranean climate that's almost suspiciously consistent: daytime highs in the 60s and 70s nearly every month, rain only in winter, sunshine the rest of the year. The downtown is more walkable than most American beach towns; Spanish-colonial architecture (white stucco walls, red-tile roofs, ironwork) runs along State Street, the main spine that goes roughly a mile from the foothills down to the wharf. Around lower State and the Funk Zone, the neighborhood by the water, you'll find seventy-plus cafés, restaurants, and bars in a half-mile radius, with the beach a fifteen-minute walk south.

The case for living here, even part-time, is the rare combination: real daily walkability, a mountain backdrop you can hike from in-town trailheads, the Pacific in arm's reach, and weather that essentially never makes you stay indoors. The honest tradeoffs are price (it's expensive — median home values are well over a million dollars) and a certain wealthy polish that some people find lovely and others find sterile. What you'd be testing on the ground is whether the combination of beauty, climate, and walkable density earns past the price tag and the resort sheen.`,

  "San Luis Obispo, CA":
`San Luis Obispo — locals call it SLO — sits about halfway between Los Angeles and San Francisco on California's Central Coast, seven miles inland in a small valley ringed by a chain of volcanic peaks called the Nine Sisters. It's a college town of about 47,000, anchored by Cal Poly, with a Spanish mission at its heart and a creek that the downtown is literally built around. The climate is essentially perfect for outdoor living: highs in the 60s and 70s most of the year, cool nights, very little rain outside winter. The walkable spine is Higuera Street, brick-paved in places, with restaurants and cafés spilling onto patios year-round. Thursday night the farmers' market shuts the street to cars and pulls everyone out — it's a local ritual, not a tourist set piece. The mountains start at the edge of town (Bishop Peak, Cerro San Luis are real hikes from downtown), and wine country sits in either direction.

The case for SLO is genuine balance — a real walkable downtown with mountains within reach, a creek through the middle, and the coast close enough without being saltwater-corroded. The honest tradeoffs are the California cost-of-living tax and a college-town demographic skew (Cal Poly's twenty-somethings dominate the public mood — which is also why everything's open year-round). What you'd be testing is whether a smaller, less coastal Santa Barbara still scratches the same itch.`,

  "Santa Cruz, CA":
`Santa Cruz sits at the northern tip of Monterey Bay on the California coast, about 75 miles south of San Francisco. It's a small city of around 64,000 with two defining features that come right up against each other: the Pacific Ocean directly south, and the redwood forests of the Santa Cruz Mountains immediately north — you can be in old-growth forest twenty minutes from the beach. The downtown runs along Pacific Avenue, with the University of California, Santa Cruz on a hill above, keeping cafés, bookstores, and a music scene running year-round. The climate is moderately maritime — cool foggy mornings, mild winters, very little snow. Surfers fill the breaks year-round; the working wharf and the boardwalk give the town a daily rhythm that's more than tourism.

The case for living here is the forest-plus-coast combination — geographically rare in the US — plus a city that's lived-in and weird in equal measure. Downtown Santa Cruz has some of the closest energy to a European town that you find in California: human scale, year-round walking, visible counterculture. The honest tradeoffs are housing math (the Bay Area economy reached here a long time ago) and a sometimes-grungy, sometimes-charming alternative edge that isn't for everyone. You'd be testing whether mountains + ocean + walking density earns the price and the eccentricity.`,

  "Carmel-by-the-Sea, CA":
`Carmel-by-the-Sea is a one-square-mile village on the Monterey Peninsula, about 120 miles south of San Francisco. Founded as an artists' colony around 1900, it's been preserved deliberately: no street addresses (mail goes to the post office), no traffic lights, no neon signs, no buildings over two stories. The architecture is fairy-tale cottages, stone walls, twisting flagstone paths — it looks like nowhere else in America. Ocean Avenue runs the gentle slope from the highway down to Carmel Beach, where the Pacific meets white sand backed by cypress trees. The whole village is walkable end to end in twenty minutes. The climate is cool, foggy, and mild — Mediterranean without the heat — with highs in the 60s most of the year. Population is tiny (about 3,800) and skews older and wealthy.

The case for Carmel is that this might be the single most aesthetically perfect village in the US — every block is lush, every detail considered, the natural setting world-class. The honest tradeoff is loud: the wealth signal is intense (median home values exceed $2M), the town has the feel of a museum at times, and the year-round population is so small that off-season can feel hollow. What you'd be testing is whether sheer beauty and ease can overcome the discomfort of a place this curated and this rich.`,

  "Monterey / Pacific Grove, CA":
`Monterey and Pacific Grove are adjacent towns on the Monterey Peninsula, about 120 miles south of San Francisco, on the southern shore of Monterey Bay. They share a coastline but have different characters: Monterey is the larger half, with Cannery Row (the historic sardine canneries, now shops and restaurants) and the world-class Monterey Bay Aquarium. Pacific Grove next door is the quieter, more residential half — a grid of Victorian houses on cypress-edged streets between the bay and the open ocean. Pacific Grove's downtown is small but real, with a working independent bookstore, breakfast spots, and a recreation trail along the water connecting to Monterey. The climate is among the mildest in the US — cool fog-belt summers, mild winters, almost never below 40°F.

The case for living here is the setting: Monterey Bay is a national marine sanctuary, the Asilomar headlands are public coastline, and the climate makes outdoor life year-round. You give up some restaurant density for a setting that includes daily Monterey Bay sunsets. The honest tradeoff is the food scene is moderate (this isn't a foodie capital) and the wealth signal is high — the peninsula has been expensive for a long time. You'd be testing whether a smaller, quieter, foggier piece of the California coast is the actual fit.`,

  "Ventura, CA":
`Ventura sits on the California coast about 30 miles up from Malibu, an hour west of Los Angeles. It's a small city of about 110,000 — bigger than Santa Barbara, but with much less polish. The downtown is centered on Main Street, a few blocks inland from the beach: a real working downtown of vintage shops, breweries, restaurants, and the historic San Buenaventura Mission, with an honest mix of locals and surf-shop tourists. The pier is a working pier (people fish there), the beach is wide, and the Santa Ynez Mountains rise immediately behind town the same way they do in Santa Barbara. The climate is essentially identical to SB: Mediterranean, dry, mild year-round, almost always t-shirt weather.

The case for Ventura is that it gets you the things people move to Santa Barbara for — ocean, mountains, Mediterranean climate, walkable downtown — at maybe half the polish and a substantially lower price. The locals look more like surfers and tradespeople than trust-fund retirees. The honest tradeoff is the downtown is smaller and less dense than SB, with fewer restaurant options, and some areas just outside the core feel more car-oriented and suburban. You'd be testing whether the less-grand, more usable version of the same coast actually delivers daily.`,

  "Hood River, OR":
`Hood River sits in the Columbia River Gorge in northern Oregon, about an hour east of Portland on the Washington-state border. The Columbia is enormous here — a mile wide, with the Washington cliffs rising on the far bank and Mount Hood (11,250 feet, snow-capped, the iconic peak) immediately south of town. The town itself perches on terraced bluffs above the river. The downtown is small — a four-block walkable core on Oak Street and Cascade Avenue, with coffee shops, breweries, and gear stores serving the windsurfing and kiteboarding crowd that comes for the famous Gorge winds. The surrounding hills are orchard country (apples, pears, cherries). Population is around 8,500.

The case for Hood River is the setting per square foot is hard to beat: a mile-wide river, a glaciated mountain, and orchards within walking distance of espresso. The Gorge offers windsurfing in summer, hiking, waterfalls, and skiing depending on season. The honest tradeoffs are the size (this is a small town), the gray and wet PNW winters, and the famous wind that drives the watersports economy is, on bad days, a constant. You'd be testing whether a tiny town in a world-class landscape gives you enough daily texture.`,

  "Ashland, OR":
`Ashland is a small town of about 21,000 in the Cascade foothills of southern Oregon, just north of the California border. It's an unlikely cultural anchor: the Oregon Shakespeare Festival, founded in 1935, runs eight months a year across three theaters in town, drawing serious actors and audiences. That single institution gives Ashland a year-round cultural pulse far above its size. The downtown is anchored by the Plaza — a small triangular square at the edge of Lithia Park, a 93-acre park that follows Ashland Creek up into the hills. The walkable core is tight, just a handful of blocks of bookstores, cafés, restaurants, and theaters. Beyond town the Siskiyou Mountains rise to over 7,000 feet; the Pacific Crest Trail passes nearby.

The case for Ashland is the rare combination of small-town quiet and serious culture in a mountain valley with a real public park as its spine. The climate is unusually pleasant for the Pacific Northwest — drier and sunnier than Portland, with proper four seasons. The honest tradeoffs are two: wildfire smoke can be a real problem in late summer, and the town is fairly isolated (closest real airport is Medford, the closest major city is Portland five hours north). You'd be testing whether a small mountain town with theater and trails is enough.`,

  "Bellingham, WA":
`Bellingham sits at the very northwestern edge of the contiguous US — about 90 miles north of Seattle and 50 miles south of Vancouver, BC — on Bellingham Bay, part of the Salish Sea inlet system. The Cascade Mountains rise dramatically to the east, with Mount Baker (10,781 feet, glaciated, often visible from town) about 30 miles away. The city has two walkable cores: downtown, with the public market and arts venues, and Fairhaven on the south side, a beautifully preserved Victorian brick neighborhood. Population is about 95,000, with Western Washington University adding a steady college-town pulse. The bay is right there — kayaking, ferries to the San Juan Islands, working fishing fleet still in evidence.

The case for Bellingham is the combination of saltwater and serious mountains, real walkability across two distinct cores, and a city size just big enough to support the cafés and food culture you want without sprawl. The honest tradeoff is the famous Pacific Northwest gray — long winters with limited sun, frequent rain, short December days. Locals will tell you it's worth it; you'd be testing whether you agree. Skiing at Mount Baker (often record-breaking snowfall) is the winter outlet for those who lean in.`,

  "Bend, OR":
`Bend sits on the eastern slope of the Cascade Mountains in central Oregon, about three hours southeast of Portland. The geography is dramatic and counterintuitive: even though it's in Oregon, the climate is high desert — about 3,600 feet of elevation, 300 days of sun a year, dramatic cold-clear winter days, dry warm summers. The Deschutes River runs through the middle of town, and several volcanic Cascade peaks are visible from anywhere in the city. The walkable core is in downtown and the adjacent Old Mill District (a former lumber site, now restaurants and shops along the river). Population is about 100,000 and growing fast — Bend is a famously discovered place over the last decade. There are more than 20 craft breweries, a serious mountain-biking culture, and an outdoor-recreation economy.

The case for Bend is the climate-plus-landscape ratio — high-desert sun on dramatic mountains, the river through downtown, mountain-bike trails at the edge of town, skiing at Mt. Bachelor 20 miles away. The honest tradeoffs are the price (it's no longer cheap), summer wildfire smoke risk that's gotten worse, and the discovery itself — the town's character is being negotiated in real time as transplants arrive. You'd be testing whether a high-desert mountain town that's growing fast still feels like the thing people moved there for.`,

  // ── Southeast Coast ─────────────────────────────────────────────────────
  "Charleston, SC":
`Charleston sits on a peninsula at the southern South Carolina coast, where the Ashley and Cooper Rivers meet to form Charleston Harbor. The historic district occupies the peninsula's southern tip and is one of the largest intact pre-1830s historic districts in the US — block after block of pastel single-houses, cobblestoned streets, and church steeples (the "Holy City"). The city itself is about 150,000, but the peninsula stays walkable. The neighborhood worth testing is Cannonborough/Elliotborough, just north of the historic core — it's where younger locals actually live, with a real restaurant scene anchored on Spring and Cannon Streets. Charleston has long had one of the best food scenes in the country (FIG, Husk, Rodney Scott's). The climate is sub-tropical: gorgeous fall and spring, mild winter, brutal humid hot summer.

The case for Charleston is the rare American thing — a city that designed walkability into its 17th-century bones and never lost it. You're surrounded by water (harbor, marshes, beaches a short drive out), the architecture is unbroken, and the food is genuinely world-class. The honest tradeoff is summer (it's a different climate, and hurricane season is real) and the gentrification arc on the peninsula has pushed rents and home prices hard. You'd be testing it October through May.`,

  "Savannah, GA":
`Savannah sits on the Savannah River on the Georgia coast, near the South Carolina border, founded in 1733 as the first planned city in colonial America. The plan is the magic: 22 small leafy squares laid out on a grid, each shaded by enormous live oaks draped in Spanish moss, with houses and churches facing each square. Walking the historic district is essentially walking from one tree-shaded living room to the next. The area to test is the Historic District north of Forsyth Park (the southern anchor) — real residents and real cafés. River Street to the north is the tourist strip; you live above it, not on it. The metro is around 400,000; the historic core is smaller. The climate is sub-tropical — beautiful spring and fall, mild winter, summer is its own animal.

The case for Savannah is that the urban design itself does the work — walking is constantly rewarded by another square and another canopy, and the historic fabric is intact. SCAD (the Savannah College of Art and Design) keeps the city culturally alive year-round. The honest tradeoffs are summer humidity (different climate), the tourist gravity around River Street, and the city's racial/political weight is openly visible. You'd be testing the cooler months and the residential blocks above Forsyth.`,

  "St. Augustine, FL":
`St. Augustine sits on the northeast Florida coast, about 40 miles south of Jacksonville. It's the oldest continuously occupied European settlement in the US — founded by the Spanish in 1565 — and the colonial bones are still there: narrow brick streets, balconies overhanging the sidewalks, the massive 17th-century Castillo de San Marcos fort on the bayfront. The walkable historic district is small but dense, centered on St. George Street (pedestrianized, tourist-heavy by day) and the surrounding residential blocks. The Bridge of Lions crosses to Anastasia Island, where the beach is.

The case for St. Augustine is rare for the US: Spanish-colonial architecture, flat and walkable, on a barrier-island coast. The climate is mild fall through spring. The honest tradeoffs are summer (Florida summer is sauna conditions) and the tourist density on St. George Street, which is real. You'd live a few blocks off the main spine, on Cordova or Cuna, and test the off-season.`,

  "Beaufort, SC":
`Beaufort (pronounced BYOO-fort, not like the North Carolina one) sits on Port Royal Island in the South Carolina Lowcountry, about 70 miles south of Charleston. It's a small town of about 12,500, perched on the Beaufort River with salt marsh and live oaks everywhere — a quieter, slower-paced Charleston without the same density. The downtown is small: a few blocks along Bay Street, with a waterfront park overlooking the river, a real independent bookstore, and a handful of restaurants. The antebellum residential blocks (Bay Street, Federal Street) have some of the most photographed houses in the South.

The case for Beaufort is the Lowcountry setting at human scale — marsh sunsets, oak avenues, walkable historic streets — without Charleston's bustle or cost. The honest tradeoff is that it's quiet (you'd notice it especially in summer) and small (the food scene is limited, the cultural calendar is thin). You'd be testing whether the calm and the looks are enough.`,

  "Cape May, NJ":
`Cape May is a small town (about 3,500 year-round) at the southernmost tip of New Jersey, where the Atlantic meets Delaware Bay. The entire central district is a National Historic Landmark of Victorian gingerbread houses — pastels, turrets, wraparound porches — built in the 1870s and 1880s when Cape May was the most fashionable beach resort in America. The walkable spine is Washington Street, pedestrianized as the Washington Street Mall, with the beach two blocks south. Sunset Beach faces west into the bay; the lighthouse stands at Cape May Point.

The case for Cape May is genuinely unusual — an intact Victorian beach town where the architecture is preserved at scale and the beach is right there. Walkability is excellent within the historic district. The honest tradeoff is severe seasonality: summer is packed, and winter (after about December) is nearly silent with most restaurants closed. You'd be testing whether the off-season silence is rest or a death-test for daily life.`,

  "St. Petersburg, FL":
`St. Petersburg sits on the western side of Tampa Bay in Florida, across the bay from Tampa, on a peninsula that ends in the Gulf of Mexico. It's a city of about 260,000 with one of the best climates in the US — Guinness once recognized it for a 768-day streak of consecutive sunny days. The downtown waterfront is the star: a long park system along Tampa Bay with the Salvador Dalí Museum (the actual Dalí), the Chihuly glass collection, a marina, and a pier rebuilt as a real public destination. The walkable neighborhoods to test are the Edge District and Grand Central just inland — restaurants, breweries, gallery walks, a Saturday morning farmers' market.

The case for St. Pete is sunshine plus a walkable downtown waterfront plus a cultural density that surprises people. Beaches (St. Pete Beach, Treasure Island) are 20 minutes west. The honest tradeoff is summer (sauna conditions June through September) and hurricane risk — both Florida realities. The rest of the year is unusually good.`,

  "Newburyport, MA":
`Newburyport sits at the mouth of the Merrimack River on the Massachusetts North Shore, about 40 miles north of Boston. It's a small city of about 18,000 with a beautifully preserved Federal-era downtown — brick row houses, ship-captain mansions, a working waterfront where the Merrimack meets the Atlantic. The walkable core is small but dense, centered on Market Square and State Street, with a substantial independent bookstore (Jabberwocky Books) and a real restaurant scene. Plum Island Wildlife Refuge is 15 minutes east — a barrier island with miles of empty beach.

The case for Newburyport is New England seaport living at a polished, livable scale: history without museum-stiffness, ocean within reach, real daily walking. Boston is close enough for cultural overflow. The honest tradeoff is the winter (this is New England), and the town's politeness can read as reserve. You'd be testing whether four seasons including a hard one is what you actually want.`,

  "Annapolis, MD":
`Annapolis sits where the Severn River meets Chesapeake Bay on Maryland's Western Shore, about 30 miles east of Washington, DC. It's the Maryland state capital and home of the US Naval Academy — both shape daily life, keeping the city busy year-round in a way pure tourist towns aren't. The Historic District runs from the State House down to City Dock on the harbor — brick colonial streets, an unbroken 18th-century fabric, with Main Street as the spine. The Naval Academy grounds are open to the public; Eastport across the bridge is the maritime-craft neighborhood. Sailing culture is real — the harbor is full of working boats, not just yacht-club display.

The case for Annapolis is rare for the US: colonial walkability that hasn't been frozen as a theme, on saltwater, with state-capital and Navy money keeping the cafés and shops alive in February. The honest tradeoff is summer humidity and a tourist load that can be heavy in fair weather. You'd be testing whether year-round liveliness justifies the bustle.`,

  // ── Inland Appalachian / Mountains ──────────────────────────────────────
  "Asheville, NC":
`Asheville sits in a Blue Ridge mountain bowl in western North Carolina, where the French Broad River winds between peaks rising 6,000 feet. It's a small city (about 95,000) but has become the cultural anchor of the southern Appalachians — a serious food and craft-brewing scene, daily live music, and the Biltmore Estate (the largest private house in the US) at the edge of town. Downtown is walkable in a tight grid around Pack Square — restaurants, bookstores, breweries, street musicians most nights. West Asheville across the river is the other walkable neighborhood worth testing, more residential and arts-leaning. The Blue Ridge Parkway runs above town; Pisgah National Forest is at your back.

The case for Asheville is the unusual combination of serious mountains, a real downtown food scene, and a creative culture that's punched well above the city's weight for decades. Climate is genuinely four-season but mild — proper fall, real but moderate winter. The honest tradeoff is that Asheville has been discovered: rents and home prices have climbed sharply, and the tourist load in October is heavy. You'd be testing whether the place still feels like its own thing.`,

  "Durango, CO":
`Durango sits in southwestern Colorado, on the Animas River as it leaves the San Juan Mountains, at about 6,500 feet of elevation. It's a small town (about 19,000) with a remarkably intact 1880s Main Street — gold-mining boomtown brick architecture, and a still-operating narrow-gauge railroad that runs steam trains to Silverton. The walkable downtown runs about a mile along Main Avenue, with restaurants, bookstores, the train station, and the river at the eastern edge. The San Juans rise to over 14,000 feet immediately north; mountain biking, skiing at Purgatory, and wilderness trailheads are minutes from town.

The case for Durango is the rare combination of intact historic downtown and serious mountains, with the kind of clear high-altitude sun that makes winters paradoxically pleasant. The Animas runs cold and clean through town. The honest tradeoffs are the size (small for a real city; you'd notice it after a while) and isolation — the closest major city is Albuquerque, four hours south. You'd be testing whether a beautiful small town in a beautiful landscape is enough variety for daily life.`,

  "Boulder, CO":
`Boulder sits at the eastern edge of the Rocky Mountains in Colorado, about 30 miles northwest of Denver, where the Front Range rises abruptly from the plains. The defining feature is the Flatirons — a row of dramatic tilted sandstone slabs that loom over the southern edge of town. The University of Colorado anchors the city of about 105,000. The walkable spine is Pearl Street, pedestrianized as the Pearl Street Mall — four blocks of restaurants, bookstores, street performers, and a Saturday farmers' market that locals show up to. The trail system into the Flatirons (Chautauqua Park, the Mesa Trail) starts a mile from downtown.

The case for Boulder is what gets people to move here: 300-plus days of sun, mountains at the doorstep, a real downtown that lives year-round thanks to CU, plus serious bike infrastructure and outdoor culture. The honest tradeoff is the wealth signal — Boulder priced itself a long time ago (median home values are well over $1M) — and a certain self-regard that comes with being on every Best Of list for decades. You'd be testing whether daily access to mountains earns past the cost and the culture.`,

  "Santa Fe, NM":
`Santa Fe sits at 7,200 feet of elevation in the foothills of the Sangre de Cristo Mountains in northern New Mexico, about 60 miles north of Albuquerque. Founded by the Spanish in 1610, it's the oldest state capital in the US — and unlike most American cities, the architecture is strictly enforced: adobe construction, earth-toned walls, flat roofs, with the Plaza at the historic core. The walkable area is small but dense — the Plaza and Canyon Road, the art-gallery street that climbs into the foothills. Population is about 88,000. The high-desert light is unlike anywhere else in the US; it's the light Georgia O'Keeffe came for.

The case for Santa Fe is genuinely unique — no other US city looks or feels this way, with this kind of art and craft culture (over 200 galleries), mountain trails at the edge, and that quality of light. The cultural overlap of Spanish-colonial, Indigenous Pueblo, and Anglo art-scene is intact and visible. The honest tradeoffs are several: it's expensive (Santa Fe priced itself decades ago), it's very dry, the altitude takes a week to adjust to, and the winters are colder than most people expect. You'd be testing whether a place that looks like nowhere else is the place to be.`,

  "Charlottesville, VA":
`Charlottesville sits in the foothills of the Blue Ridge Mountains in central Virginia, about two hours southwest of Washington, DC. It's a small city of about 47,000, dominated by the University of Virginia — Thomas Jefferson's campus, with the famous Lawn at its center, is genuinely beautiful and walkable in its own right. The walkable downtown is built around the Downtown Mall — a pedestrianized eight-block stretch of brick where every restaurant has outdoor seating, with the Sprint Pavilion concert venue at one end and Court Square at the other. The Blue Ridge is visible to the west; Shenandoah National Park is 30 minutes away. Surrounding countryside is wine country (Monticello, Barboursville).

The case for Charlottesville is genuinely strong: a pedestrian downtown that's been a national model for decades, a major university keeping things alive year-round, food and wine culture that punches above its size, and the Blue Ridge as backdrop. The honest tradeoffs are summer humidity (Virginia summer) and the political/historical weight (the 2017 events still shape conversations). You'd be testing whether a small mid-Atlantic college town with mountains and a great downtown is your thing.`,

  "Lexington, VA":
`Lexington is a tiny town — about 7,300 — in the Shenandoah Valley of western Virginia, anchored by two colleges (Washington & Lee and the Virginia Military Institute) that dominate its character and skyline. It sits in horse country with the Blue Ridge to the east and the Allegheny Mountains to the west. The downtown is small but unusually intact: a few blocks of brick Victorian and Greek-revival storefronts on Washington Street and Main Street, with the two campuses immediately adjacent. Wine country and Shenandoah National Park are short drives.

The case for Lexington is the scenic-plus-historic combination at a remarkable small scale — you can walk the entire downtown plus both campuses in an afternoon, the surrounding country is genuinely beautiful, and the culture is more interesting than the town size suggests. The honest tradeoff is severe smallness: this is a 7,000-person town, and that's the deal you take. You'd be testing whether quiet, beautiful, and historic in a valley setting is the right fit.`,

  "Staunton, VA":
`Staunton (pronounced STAN-ton) is a small city of about 25,000 in the Shenandoah Valley of Virginia, about 30 minutes north of Lexington and right off Interstate 81. It has five National Register historic districts — an unusual concentration for a city this size — and is home to the American Shakespeare Center's Blackfriars Playhouse, a working replica of Shakespeare's London theater. The walkable downtown runs through the Beverley historic district, with brick streets, Victorian and Edwardian storefronts, and a beautifully preserved train station. The Blue Ridge frames the eastern view.

The case for Staunton is that it's a quietly perfect small Southern city — beautifully built, culturally serious for its size, in a stunning valley setting. The walkable historic core is genuinely lived-in. The honest tradeoff is the size (smaller than its press suggests) and a moderate restaurant scene. You'd be testing whether quiet Shenandoah Valley life with real theater nearby is enough.`,

  "Roanoke, VA":
`Roanoke sits in a Blue Ridge mountain bowl in southwestern Virginia, where the Roanoke River cuts through the southern Appalachians. Population is about 100,000 — the largest city along the Blue Ridge stretch. The famous Mill Mountain Star, a 100-foot illuminated star on the mountain above the city, is the local symbol. The walkable downtown centers on the Market District, around the Historic Roanoke City Market — a working farmers' market in operation since 1882, with restaurants and shops in the surrounding blocks. The Roanoke River Greenway runs through the city; the Blue Ridge Parkway is at the edge.

The case for Roanoke is the unusually good ratio of mountain-walkability for a city of this size — most cities surrounded by mountains are small towns, while most cities with proper urban density don't have mountains. The honest tradeoffs are regional smallness (you're three hours from Charlotte or Richmond for big-city needs) and a still-emerging downtown. You'd be testing whether a mid-size Blue Ridge city is what you wanted.`,

  "Harrisonburg, VA":
`Harrisonburg sits in the Shenandoah Valley of Virginia, about an hour north of Staunton and two hours from DC. It's home to James Madison University (about 22,000 students) and Eastern Mennonite University — two colleges keeping the city alive year-round, but without spring-break culture. Population is about 51,000. The walkable downtown has seen serious investment over the last decade — restaurants, breweries, a food co-op, a real arts scene around Court Square. The Massanutten range is visible to the east; the Allegheny mountains to the west.

The case for Harrisonburg is affordability plus walkability plus scenery — uncommon among Virginia college towns, where the others have priced themselves up. JMU's energy without the chaos. The honest tradeoff is that it's still a smaller city (you'd notice it after Charlottesville's depth), and the surrounding county is rural-conservative in flavor. You'd be testing whether a more affordable, less polished Shenandoah Valley spot delivers daily.`,

  "Morgantown, WV":
`Morgantown sits on the Monongahela River in the northern panhandle of West Virginia, about 75 miles south of Pittsburgh. West Virginia University (about 28,000 students) shapes everything — this is West Virginia's largest college town, with a famously intense football culture and a downtown that lives off the university year-round. Population is around 30,000. The walkable downtown is small but real, with bars, restaurants, and the rail-trail along the river as the spine. The terrain is steeply hilly (most of West Virginia is), with Cheat Lake and Coopers Rock State Forest at the edges.

The case for Morgantown is that it's the only real city in West Virginia, with a serious downtown and a college-town pulse in a genuinely beautiful Appalachian setting. The honest tradeoffs are West Virginia's broader image (which the state earns in some places and not others) and the football intensity in fall — which is also why the place stays alive year-round. You'd be testing whether a small Appalachian city built around its university is your speed.`,

  "Lewisburg, WV":
`Lewisburg is a small town — about 3,800 — in the Greenbrier Valley of southeastern West Virginia, about three hours from Charleston, WV or Roanoke, VA. It's one of those surprising small towns that's culturally heavier than it looks: Carnegie Hall is on the main street (one of only four original Carnegie Halls), the Greenbrier Valley Theatre is a serious regional theater, and the downtown has a proper independent bookstore. The walkable historic core is a few blocks of brick storefronts on Washington and Court Streets, surrounded by the Greenbrier State Forest and rolling Appalachian farmland. The famous Greenbrier resort is in nearby White Sulphur Springs.

The case for Lewisburg is that it's a tiny mountain town that's somehow cultural — Carnegie Hall in West Virginia is a perfect example. The honest tradeoffs are size and isolation; you're three hours from anywhere bigger. You'd be testing whether small-with-substance is enough.`,

  "Eureka Springs, AR":
`Eureka Springs is a Victorian boomtown built into the Ozark Mountains of northwestern Arkansas, near the Missouri border. It was built around natural mineral springs in the 1880s — the town wraps the steep hillsides so dramatically that there are no parallel streets in the downtown, just stairs and switchbacks connecting blocks. Population is about 2,100. The downtown along Spring Street and Main Street is a tight cluster of limestone Victorian buildings — galleries, restaurants, the Crescent Hotel above the town, mineral-spring grottoes. The Ozark hills are immediately around you. Beaver Lake and the White River are short drives.

The case for Eureka Springs is that it's genuinely one of the strangest small towns in the US — the topography forces a non-grid layout that creates constant surprise, the art and music scene is real (the famous May Festival of the Arts), and the Victorian fabric is intact. The honest tradeoffs are the size (very small), the tourist economy (the town runs on it), and the elevations are no joke. You'd be testing weird.`,

  // ── Ohio ────────────────────────────────────────────────────────────────
  "Cleveland (Tremont), OH":
`Tremont is a Cleveland neighborhood across the Cuyahoga River from downtown, perched on a bluff with views over the river valley to the city skyline. Built as a working-class Eastern European neighborhood in the late 1800s, it's been partly gentrified over the last two decades — old houses restored, restaurants and bars on Professor Avenue and West 14th Street, with Lincoln Park as the central green space. The walkable core is tight — a few blocks of Victorian houses, churches (the famous onion-domed St. Theodosius), and a serious restaurant row. Downtown Cleveland is across the river and the bridge is walkable.

The case for Tremont is the rare American combination of intact ethnic-historic neighborhood, real walkability, dramatic geography (the bluff is real), and proximity to a downtown core. The honest tradeoffs are Cleveland's broader context (the bigger-picture city question is real) and lake-effect winter. You'd be testing whether one excellent neighborhood is enough.`,

  "Cleveland (Ohio City), OH":
`Ohio City is the Cleveland neighborhood just west of downtown, anchored by the West Side Market — a 1912 indoor market hall with over 100 vendors that's been operating continuously for more than a century. It's one of the great public markets in the US, and the neighborhood around it is walkable, with breweries (Great Lakes Brewing, the original) and restaurants on West 25th Street. The walkable core is centered on the market and the surrounding blocks of old brick storefronts. Downtown Cleveland is a short walk over the Hope Memorial Bridge.

The case for Ohio City is that the market is genuinely a daily-life institution — you can do real grocery shopping there three times a week — and the surrounding walkability is real. The neighborhood mixes incomes in a way most American gentrification doesn't (yet). The honest tradeoffs are Cleveland's winter and the city's broader population and economic decline questions. You'd be testing whether a great neighborhood in a complicated city is enough.`,

  "Columbus (German Village), OH":
`German Village is a neighborhood just south of downtown Columbus, Ohio, settled by German immigrants in the mid-1800s — and the brick-rowhouse fabric they built is essentially intact: red brick, mansard roofs, stone curbs, oak trees on every block. It's one of the densest historic-rowhouse neighborhoods in the US. The walkable spine is Third Street, with Schiller Park as the central green space and the Book Loft (a 32-room independent bookstore in an old farmhouse) as the cultural anchor. The neighborhood is small — a few square blocks — but human-scaled in a way most American neighborhoods aren't.

The case for German Village is that walking the streets actually feels like walking through an older, denser country — closer to Europe than to suburban America. The brick everywhere is gorgeous. The honest tradeoff is the size: for variety you'd cross into Schumacher Place or downtown Columbus. You'd be testing whether one dense, beautiful neighborhood scratches the itch in a city that's mostly sprawl.`,

  "Columbus (Short North), OH":
`The Short North is Columbus's arts and entertainment district, running along High Street between downtown and the Ohio State University campus. The street is marked by illuminated metal arches every block — the visual identifier — and the strip is genuinely walkable: galleries, restaurants, coffee shops, the North Market public market at the southern end. The walkable spine is High Street itself, with the surrounding residential blocks (Italian Village to the east, Victorian Village to the west) being where you'd actually live. OSU's 60,000 students keep things alive year-round.

The case for the Short North is that it's the closest Columbus comes to a real urban core — a long, lively strip with serious food and gallery culture and constant foot traffic. The honest tradeoff is it's more strip than district (you live on a side street to keep nights quiet), and Columbus's broader sprawl is sprawl. You'd be testing whether the High Street energy is enough in a metro that's not built for walking.`,

  "Cincinnati (Over-the-Rhine), OH":
`Over-the-Rhine (called OTR by locals) is the neighborhood just north of downtown Cincinnati, named for the Miami and Erie Canal (the "Rhine") that historically separated it from downtown. It's the largest intact 19th-century historic district in the US — hundreds of Italianate brick row houses, Findlay Market (the oldest continuously operating municipal market in Ohio) as the heart, and the historic Music Hall on the western edge. Since around 2010, OTR has gone through one of the country's most dramatic urban revivals — once heavily abandoned, now full of restaurants, bars, and shops. The streetcar runs through it, connecting to downtown and the riverfront. Vine Street is the spine.

The case for OTR is genuinely remarkable: an intact 19th-century city neighborhood at a scale that doesn't exist elsewhere in the US, now lively and walkable, with strong food and music culture and downtown a short walk south. The honest tradeoffs are the gentrification politics (the revival displaced longtime residents — this is openly discussed) and Cincinnati's broader regional identity is complicated. You'd be testing whether one of the country's most beautiful neighborhoods is your home.`,

  // ── Pittsburgh ──────────────────────────────────────────────────────────
  "Pittsburgh (Squirrel Hill), PA":
`Squirrel Hill is a residential neighborhood in eastern Pittsburgh, about three miles from downtown, anchored by the intersection of Forbes and Murray Avenues — the commercial spine. It's been Pittsburgh's main Jewish neighborhood for over a century, and the dense, stable, multi-generational character shows: kosher delis, bookstores, a Carnegie Library branch, and an unusually walkable mix of cafés, restaurants, and small shops. Frick Park (a 600-acre Olmsted-designed park) borders the neighborhood to the south — real woods, not landscaping. The university districts (Pitt and Carnegie Mellon) are immediately west.

The case for Squirrel Hill is unusual for an American neighborhood: real walkability, a stable resident base (denser than most Pittsburgh neighborhoods), a forest at the edge, and a Pittsburgh-tax-included price tag that's much cheaper than coastal cities. The honest tradeoffs are Pittsburgh's gray winters (long stretches without sun) and hilly bus routes. You'd be testing whether a great neighborhood in a complicated city is the deal.`,

  "Pittsburgh (South Side), PA":
`The South Side Flats are a long, narrow Pittsburgh neighborhood along the south bank of the Monongahela River, with Mt. Washington rising steeply behind it. East Carson Street is the famous spine — a twelve-block strip of bars, restaurants, and old Pittsburgh architecture that's been one of the city's biggest nightlife scenes for decades. The walkability is real, the geography (river below, hill above) is genuinely dramatic for a US city, and there's a working-class history that's still visible in the storefronts and churches.

The case for the South Side is the rare combination of a long walkable commercial spine, river-and-slope geography you don't get in most US cities, and unpretentious Pittsburgh authenticity. The honest tradeoff is the bar-heavy character is real — late-night noise, weekend chaos — and you'd want to live a block or two off Carson, not on it. You'd be testing whether old Pittsburgh on a riverbank is your scene.`,

  "Pittsburgh (Strip District), PA":
`The Strip District is a long, narrow Pittsburgh neighborhood along the Allegheny River, just east of downtown. Historically the city's wholesale food and produce district, Penn Avenue is still lined with markets — Italian groceries (Pennsylvania Macaroni Company), fish markets, Polish delis, espresso stops, and the famous Wholey's fish market. It's a sensory ritual every morning. The walkability is improving as old warehouses convert to housing — you can now actually live in the Strip, not just shop in it. The Senator John Heinz History Center is the cultural anchor.

The case for the Strip is the daily food ritual is something most US cities lost: walking to the market for produce, fish, bread, espresso, the same vendors over years. The honest tradeoff is that residential is still emerging (you're early), and the area shuts down somewhat at night. You'd be testing whether a working market district as your neighborhood is the dream.`,

  // ── PA small ────────────────────────────────────────────────────────────
  "Lancaster, PA":
`Lancaster sits in the southeastern Pennsylvania Dutch Country, about 70 miles west of Philadelphia. The city itself (about 58,000) was platted in 1730 — and the central grid is essentially intact: tight downtown streets of brick and limestone, with Central Market (in operation since 1730 — the oldest continuously operating public market in the US) at the heart. The walkable downtown is concentrated around Penn Square and Central Market, with a real arts scene, restaurants, and an unusual concentration of independent shops. The surrounding countryside is Amish farms and produce country.

The case for Lancaster is the rare American combination of a genuinely old, walkable downtown (it really was laid out in 1730) plus serious food culture (the market, the farms) plus an arts scene. The honest tradeoff is the surrounding sprawl is sprawl, and the famous Amish-tourism economy can spill over into the city. You'd be testing the downtown blocks specifically.`,

  "Bethlehem, PA":
`Bethlehem sits in the Lehigh Valley of eastern Pennsylvania, about 60 miles north of Philadelphia. Founded in 1741 by Moravian missionaries, the historic district on the north side still has the limestone Moravian buildings — the Sisters' House, the Central Moravian Church, the Sun Inn. Main Street is the walkable spine. The south side, across the Lehigh River, was Bethlehem Steel — and the SteelStacks complex (the preserved blast furnaces, now a music venue and arts campus) is one of the better adaptive-reuse projects in the country. Lehigh University and Moravian University keep the city alive.

The case for Bethlehem is the combination of intact colonial-era core (rare in the US) and serious music programming at SteelStacks — Musikfest, the country's largest free music festival, runs ten days every August. The honest tradeoff is winter and a city still finding its post-steel identity. You'd be testing whether colonial-plus-industrial-reuse is the right blend.`,

  "Easton, PA":
`Easton sits at the confluence of the Delaware and Lehigh Rivers, on the New Jersey border in eastern Pennsylvania — the third corner of the Lehigh Valley with Bethlehem and Allentown. The downtown is built around Centre Square (an actual circular green at the city's heart), with Lafayette College on the hill to the north. The walkable core is concentrated around Centre Square and the surrounding blocks, with a serious public market (Easton Public Market) and the Crayola Experience (the actual Crayola museum) as anchors. The Karl Stirner Arts Trail runs along the river.

The case for Easton is that it's the most underrated of the Lehigh Valley three — cheaper than Bethlehem, more interesting than its reputation, with the river confluence and the Lafayette presence keeping things alive. The honest tradeoff is winter is real winter, and the city is still rebuilding. You'd be testing whether the underdog Lehigh Valley city has the daily texture.`,

  "Jim Thorpe, PA":
`Jim Thorpe is a tiny town (about 4,800) in the Lehigh Gorge of northeast Pennsylvania, sometimes called "the Switzerland of America" for its Victorian downtown wedged in a deep mountain valley. Originally two towns (Mauch Chunk and East Mauch Chunk), it was renamed in 1954 when the famous Native American athlete's body was buried there. The downtown is essentially one beautiful street — Broadway — sloping down to the Lehigh River, with the Asa Packer Mansion (a stunning Italianate house), the Old Jail (now a museum), and bell-towered churches. Lehigh Gorge State Park is at your doorstep, with rail-trail cycling, whitewater, and hiking.

The case for Jim Thorpe is the setting is genuinely uncommon for the East Coast: a Victorian streetscape in a deep, narrow mountain valley. The honest tradeoffs are the size (very small), the tourist-heavy fall season, and the geographic isolation. You'd be testing whether a tiny, beautiful mountain town is enough.`,

  "Bellefonte, PA":
`Bellefonte is a small town (about 6,200) in central Pennsylvania, about ten miles east of State College and Penn State University. It sits along Spring Creek with the Centre County Courthouse on a small hill in the center — a beautifully preserved Victorian downtown that locals call "the Victorian Capital of Pennsylvania." The walkable core is a few blocks of brick storefronts on Allegheny Street and High Street, with the famous Big Spring (the source of the town's name) at the foot of the hill. The state college and university nearby provide sports and culture overflow.

The case for Bellefonte is the rare combination of intact Victorian downtown + creek + courthouse-on-a-hill — it looks like a town designed for a postcard, and you can walk all of it. The honest tradeoff is the size (genuinely small) and the State College gravitational pull on the area. You'd be testing whether a beautiful little courthouse town in central PA is enough for daily life.`,

  "Lewisburg, PA":
`Lewisburg is a small town (about 5,600) in central Pennsylvania, on the West Branch of the Susquehanna River, anchored by Bucknell University on the hill above the downtown. The walkable historic core is a few blocks of well-preserved brick and frame buildings along Market Street, with Mondragon Books (a genuine independent), a real coffee shop, and a small theater. The Susquehanna is right there — wide, calm, with the surrounding rolling Allegheny ridge country for hiking. The town has a real grocery, a movie theater (the historic Campus Theatre), and a couple of proper restaurants — more than you'd expect for 5,600 people.

The case for Lewisburg is the surprising substance for the size — Bucknell delivers a level of cultural amenity (lectures, concerts, art shows) that most small towns don't have. The honest tradeoff is true smallness and a surrounding region that's rural-conservative. You'd be testing whether college-town-meets-river-town in central PA delivers.`,

  // ── NY upstate / Hudson Valley ──────────────────────────────────────────
  "Buffalo (Elmwood), NY":
`Elmwood Village is a Buffalo neighborhood on the city's west side, anchored by Elmwood Avenue — a long, walkable commercial strip between two of Frederick Law Olmsted's parks (Delaware Park to the north, Symphony Circle to the south). Buffalo State University and the Albright-Knox Art Gallery are both immediately adjacent. The walkable spine runs about a mile and a half along Elmwood, with restaurants, cafés, bookshops, and constant resident-and-student foot traffic. The architecture is taut: brick storefronts, Victorian houses on the residential side streets.

The case for Elmwood is the rare combination of a long walkable commercial strip, Olmsted parks on both ends, serious art (Albright-Knox), and a price point much lower than coastal cities. The honest tradeoff is the famous Buffalo winter — lake-effect snow is real, sometimes spectacularly so. People who live in Buffalo will tell you the snow is the deal you take to live there. You'd be testing whether you agree.`,

  "Buffalo (Allentown), NY":
`Allentown is a Buffalo historic district immediately east of Elmwood, designated as one of the country's largest preservation districts. It's gas-lit (literally), brownstone-and-Victorian, with a smaller, rawer commercial strip on Allen Street — historic bars (the Old Pink), serious restaurants, the small but real Buffalo theater scene, and an LGBTQ+ history. The walkable core is a few blocks of Allen Street and the surrounding residential streets. Downtown Buffalo is a short walk south.

The case for Allentown is the historic intactness — gas lamps and brownstones at scale, an unusual American thing — plus the rawer creative edge that you don't get in polished Elmwood. The honest tradeoffs are the Buffalo winter (the same lake-effect commitment as Elmwood) and the smaller restaurant scene compared to its neighbor. You'd be testing whether the older, edgier Buffalo neighborhood is more your speed.`,

  "Rochester (Park Ave), NY":
`Park Avenue is a Rochester residential neighborhood on the east side, with a walkable commercial strip running along Park Avenue itself — about a mile of brick row houses, indie shops, cafés, and restaurants. The famous Park Ave Festival shuts the street to cars for a weekend every August. Highland Park (Olmsted-designed, famous for its lilac collection) is at the southern edge. Downtown Rochester is a short drive west; the Genesee River cuts through the city.

The case for Park Ave is that it's Rochester's most consistently walkable residential-with-shops district — the kind of street that runs a real neighborhood. Rochester is much more affordable than New York City or Buffalo. The honest tradeoffs are the rust-belt context (Rochester's population has declined for decades) and the upstate winter (not as severe as Buffalo, but still long). You'd be testing whether a great neighborhood in a recovering city is enough.`,

  "Ithaca, NY":
`Ithaca sits at the southern tip of Cayuga Lake in the Finger Lakes region of central New York, about four hours from New York City. Cornell University crowns the hills above downtown — and the geography is the famous thing: deep gorges and waterfalls run through the city, with Ithaca Falls in the middle of a residential neighborhood and dozens of others within minutes. The walkable downtown is the Ithaca Commons, a four-block pedestrianized district with restaurants, bookstores, and a constant student-and-resident flow. The Commons has been pedestrianized since 1974 — one of the country's longest-running car-free zones. Population is about 32,000 in the city; Cornell adds 25,000 students.

The case for Ithaca is the genuinely unusual combination: real walkable downtown, dramatic gorge-and-waterfall geography in the middle of the city, a major university keeping culture year-round, plus the surrounding wine country (the Cayuga Wine Trail) and natural-foods scene. The honest tradeoffs are the long winter (this is upstate NY) and the small-city size — you'd cross to Rochester or Syracuse for big-city needs. You'd be testing a serious college town in a serious landscape.`,

  "Saratoga Springs, NY":
`Saratoga Springs sits at the southern edge of the Adirondacks in upstate New York, about a half hour north of Albany. The town is famous for two things: the natural mineral springs (Spa State Park is genuinely beautiful, with public bathhouses) and the August thoroughbred racing season at the historic Saratoga Race Course. Population is around 28,000. The walkable downtown runs along Broadway — a mile of restaurants, shops, the Saratoga Performing Arts Center for summer programming, and Skidmore College adding a year-round cultural pulse. The Adirondacks are visible to the north.

The case for Saratoga is the year-round Broadway corridor that holds up after the August chaos passes — real restaurants, real foot traffic, mineral springs to soak in. The honest tradeoff is the racing-season tourist density in August, and the winter is upstate NY winter (cold and long). You'd be testing the eleven other months when it's actually your town.`,

  "Hudson, NY":
`Hudson is a small city (about 5,900) on the east bank of the Hudson River in upstate New York, about two hours from New York City by train (Amtrak runs along the river). It was a whaling port turned industrial city; over the last two decades it's become the Hudson Valley's most concentrated antiques, design, and restaurant strip. The walkable spine is Warren Street, running uphill from the river — about a mile of antiques shops, galleries, restaurants, and bookstores. The Catskill Mountains are visible across the river to the west.

The case for Hudson is the cultural density per square block is genuinely unusual for a town this small — it's been called Brooklyn-on-the-Hudson, which captures both the appeal and the cost. The honest tradeoffs are the gentrification arc is real (the original residents have been substantially priced out, openly discussed) and the size (a real city it isn't). You'd be testing whether a small, intense Hudson Valley town is your speed.`,

  "Beacon, NY":
`Beacon is a small Hudson Valley city (about 13,800) on the east bank of the Hudson River, about 60 miles north of New York City — close enough that Metro-North brings it within a 90-minute train ride. The city sits at the foot of Mount Beacon (1,610 feet, with a hiking trail to the summit). The walkable spine is Main Street, running for about a mile through the historic downtown — restaurants, galleries, the famous Dia:Beacon (a massive contemporary art museum in a former Nabisco printing plant) at the western end near the river.

The case for Beacon is the combination of small-city walkability, the Hudson River and Mount Beacon as bookends, Dia as a serious cultural anchor, and the commuter rail to NYC. The honest tradeoff is the gentrification — Beacon's prices have moved hard over the last decade — and the size (it's not a real city). You'd be testing whether a polished small Hudson Valley town with one great museum is enough.`,

  "Kingston, NY":
`Kingston sits at the confluence of Rondout Creek and the Hudson River, about two hours from New York City and right at the foot of the Catskill Mountains. It was briefly the New York State capital in 1777 (the British burned it later that year). Population is around 24,000. There are two walkable cores: the Uptown Stockade District (17th-century stone houses, the historic spine) and Rondout (waterfront with restaurants and the working harbor). The Catskills are immediately west.

The case for Kingston is that it's the Hudson Valley's most authentic small-city option — less polished than Hudson or Beacon, more functional, with two real walkable districts and the river-plus-mountain setting. It's still affordable by Hudson Valley standards. The honest tradeoff is the post-industrial bones still show in places, and the city is still rebuilding (which is also part of the appeal). You'd be testing whether a less-polished Hudson Valley city has more daily texture than the more-polished ones.`,

  // ── New England stretch ─────────────────────────────────────────────────
  "Burlington, VT":
`Burlington sits on the eastern shore of Lake Champlain in northern Vermont, with the Adirondack Mountains visible across the lake in New York — that view is the defining feature. The city is about 45,000 and is anchored by the University of Vermont, which keeps it alive year-round. The walkable spine is the Church Street Marketplace — a four-block pedestrianized brick street with restaurants, the Burlington Farmers Market on Saturdays, and Vermont craft shops. The lakefront is a short walk west; the bike path runs for miles along the shore. Skiing at Stowe and Smugglers' Notch is an hour east.

The case for Burlington is the rare combination of a real walkable downtown, freshwater on a scale that feels like an inland sea, a major university keeping things culturally alive year-round, plus serious outdoor culture (sailing in summer, skiing in winter). The honest tradeoff is six months of cold — Vermont winter is real Vermont winter. Locals don't apologize for it; they lean in. You'd be testing whether a year-round outdoor commitment is what you want.`,

  "Portland, ME":
`Portland sits on a peninsula on Maine's southern coast, jutting into Casco Bay, about 100 miles north of Boston. It's the largest city in Maine but small by national standards (about 68,000), with a working waterfront where the fishing fleet still ties up and ferries run to the islands of Casco Bay. The walkable core is the Old Port — cobblestoned streets, brick warehouses converted to restaurants, breweries (Allagash, Maine Beer), bookstores. Munjoy Hill rises to the east, with the Eastern Promenade trail along the water. The food scene has been nationally famous for over a decade — Eventide Oyster, Fore Street, Duckfat — and the supply (Maine seafood, Vermont produce) is real.

The case for Portland is the working harbor at a scale that feels both old and current — fishing boats, ferries, breweries, restaurants, all on one walkable peninsula. The honest tradeoffs are winter (real Maine winter) and rents that have moved up significantly. Both are the price of a city this lived-in. You'd be testing whether the food and the harbor justify the cold.`,

  // ── Tennessee ───────────────────────────────────────────────────────────
  "Knoxville, TN":
`Knoxville sits on the Tennessee River in eastern Tennessee, at the foot of the Great Smoky Mountains. The University of Tennessee anchors the city of about 190,000, and the downtown has been through a serious revival over the last two decades. The walkable core is centered on Market Square (a small pedestrian square with restaurants and the Saturday farmers' market) and the Old City (a few blocks of bars and restaurants in old warehouses). The Tennessee River runs through, with parks and greenways along it. The Smokies are an hour east.

The case for Knoxville is the rare combination of mid-size Southern city with a genuinely revived downtown plus the Smoky Mountains within an hour — most cities with mountain access this good are much smaller. Climate is mild for the South (the elevation helps a little). The honest tradeoff is summer heat and the metro sprawl beyond the downtown core. You'd be testing whether a revived Tennessee downtown plus the Smokies works.`,

  "Chattanooga, TN":
`Chattanooga sits in a deep bend of the Tennessee River where the river cuts through the southern end of the Appalachian Mountains, on the Tennessee-Georgia border. Lookout Mountain looms over the city from the south. Population is about 180,000. The walkable core is the riverfront — the Tennessee Aquarium, the Hunter Museum of American Art on a bluff, Walnut Street Bridge (a pedestrian-only converted bridge) crossing to North Shore (the more residential walkable district). Downtown has been through a serious 30-year revival.

The case for Chattanooga is the geography is genuinely striking for a US city: a river-gorge setting with mountains directly above, plus a downtown that's been thoughtfully rebuilt around the river. Climate is mild for the South. The honest tradeoffs are summer heat (Tennessee summer) and the metro density drops off quickly past the riverfront. You'd be testing whether the river-and-mountain setting plus a revived downtown delivers.`,

  // ── Other US ────────────────────────────────────────────────────────────
  "Richmond, VA":
`Richmond is the Virginia state capital, on the James River, about 100 miles south of Washington, DC. It's a mid-size city (about 226,000) with a complicated history (Confederate capital, civil rights battles, recent monument removals) that it engages with openly. The walkable spine is the Fan / Museum District / Carytown stretch — about three miles of late-Victorian rowhouses, with restaurants, the Virginia Museum of Fine Arts (free admission, world-class collection), and Carytown's funky retail strip. The James River runs through the city, with serious park trails (Belle Isle, the Pipeline) on the river itself — class IV whitewater in the middle of a city.

The case for Richmond is the unusual combination of a mid-size walkable Southern city, dramatic urban river park, a serious art museum, and a food culture that takes itself seriously. The honest tradeoffs are summer humidity and a southern-city racial/political weight the city is honest about. You'd be testing whether mid-size and substantive is the right balance.`,

  "Frederick, MD":
`Frederick sits in north-central Maryland, about an hour from both Washington, DC and Baltimore, at the eastern foot of the Catoctin Mountains. Downtown is centered on Patrick and Market Streets — an unusually intact historic core for the DC metro area, with brick everywhere and Carroll Creek (a linear park along the engineered creek) as the central green space. The walkable downtown has a real food scene, independent shops, the Weinberg Center (a restored 1926 theater), and a Saturday farmers' market. Population is about 80,000. The Appalachian Trail crosses the Catoctin ridge nearby.

The case for Frederick is the rare DC-metro option that doesn't feel like a DC suburb — a real, walkable, historic downtown in a small city with mountains at the edge, twin commuter rails to DC and Baltimore. The honest tradeoff is the DC orbit shapes part of the identity (commuters, traffic on the highway). You'd be testing whether a small mid-Atlantic city with real character holds up daily.`,

  "Greenville, SC":
`Greenville sits in the foothills of the Blue Ridge Mountains in upstate South Carolina, about 100 miles southwest of Charlotte. It's a mid-size city (about 73,000 in the city, 950,000 metro) that's been national-press-level for downtown walkability for over a decade — the Main Street revival is the model other Southern cities are still trying to copy. The walkable spine is Main Street, with Falls Park on the Reedy River as the centerpiece — the Reedy River actually has waterfalls in the middle of downtown, with a pedestrian-only suspension bridge (the Liberty Bridge) over them. The Blue Ridge is 45 minutes north.

The case for Greenville is that downtown Main Street is genuinely one of the best in the Southeast — restaurants, shops, the river park, year-round foot traffic. The honest tradeoffs are the Southern-city growth tax (rents and traffic have climbed), and outside the downtown spine the metro is car-dependent sprawl. You'd be testing the central blocks specifically.`,

  "Petaluma, CA":
`Petaluma sits in Sonoma County, about 40 miles north of San Francisco, on the Petaluma River. The downtown is built around Western Avenue and Petaluma Boulevard, with iron-front commercial buildings from the 1880s that survived earthquakes and are essentially intact. Population is about 60,000. The walkable core straddles the river, with the Petaluma Public Library, the Mystic Theatre, and the Wednesday farmers' market as anchors. Dairy country surrounds the city (this is the heart of California's organic dairy industry). Lagunitas Brewing is here.

The case for Petaluma is the rare combination of intact 1880s downtown, river through the middle, working farm country at the edges, and Bay Area access (40 minutes to SF, an hour to wine country in both directions). The honest tradeoff is the Bay Area cost-of-living signal applies even at small-town scale. You'd be testing whether a Sonoma County town that's still farm-economy-real is your fit.`,

  // ── Calibration anchors (Slovenia + Pittsburgh controls) ────────────────
  "Bled, Slovenia":
`Bled is a small town in northwestern Slovenia, in the Julian Alps, about 35 miles from the Slovenian capital Ljubljana. The defining feature is Lake Bled — an emerald-green lake with a small island in the middle, an 11th-century church on the island, and a medieval castle perched on a cliff above the lake. The Julian Alps rise behind. It is, by general consensus, one of the most photogenic small places in Europe.

In this database, Bled isn't a candidate to visit — it's the calibration anchor. This is what "setting" at 10 actually looks like, the place the owner rates around 10/10 on the felt scale. The question every American candidate has to answer is how close it even gets.`,

  "Piran, Slovenia":
`Piran is a Venetian-era walled town on a small peninsula jutting into the Adriatic Sea on Slovenia's tiny coastline (Slovenia has about 30 miles of coast, total). The town walls climb a hill to the Cathedral of St. George; the central Tartini Square opens directly onto the sea; the streets are narrow stone alleys lived in by actual residents, not just tourists.

In this database, Piran isn't a candidate to visit — it's the calibration anchor. This is what a small Mediterranean walled town that's still lived-in (not a museum, not a resort) actually feels like, rated around 10/10 on the felt scale. The point isn't to recreate this in America; it's to be honest about what "lived" really means.`,

  "Ljubljana, Slovenia":
`Ljubljana is the capital of Slovenia, with a population of about 280,000 — small for a national capital. The Ljubljanica River runs through the historic center, crossed by Plečnik's famous bridges; Prešeren Square is the social heart; the old town is largely pedestrianized. It functions as a real European capital that's still small enough to walk end to end in an afternoon.

In this database, Ljubljana isn't a candidate to visit — it's the calibration for what a real working European city feels like, rated around 8 on the felt scale. The realistic ceiling for any actual city (not a postcard town).`,

  "Pittsburgh (Shadyside), PA":
`Shadyside is a Pittsburgh neighborhood on the east side, about three miles from downtown, anchored by the Walnut Street retail strip — high-end shops, restaurants, and a college-adjacent demographic (Carnegie Mellon and the University of Pittsburgh are nearby).

In this database, Shadyside isn't a candidate to visit — it's a control. The owner has lived in or near it and rates the lived experience low (about 3/10) despite Walnut Street looking exactly like what walkability metrics reward. The point is that retail-on-a-street isn't the same as a real lived neighborhood. Keeping Shadyside in the data catches any algorithm that mistakes "shops" for "life."`,

  "Pittsburgh (Lawrenceville), PA":
`Lawrenceville is a Pittsburgh neighborhood along the Allegheny River, northeast of downtown, with Butler Street as the famous spine — bars, restaurants, design shops, the gentrified-old-Pittsburgh aesthetic that's become a "Best Neighborhoods" list staple.

In this database, Lawrenceville isn't a candidate to visit — it's a control. The owner rates it low (about 3/10) on the felt scale despite Butler Street looking like everything the metrics reward. The point is that consumption (bars and restaurants) isn't the same as community. Anchors the floor of the felt scale: a place that scores high on POI counts but fails the felt test.`,

  "Sewickley, PA":
`Sewickley is a polished suburban borough along the Ohio River, about 12 miles northwest of downtown Pittsburgh. It has a small walkable Beaver Street commercial spine, beautiful old houses, and a small-town quality that real-estate listings love.

In this database, Sewickley is a control — unrated by the owner, left in to see what "pleasant but bounded" looks like in the measured data. Useful for spotting when the algorithm over-rewards an attractive but limited commercial strip.`,

  "Oakmont, PA":
`Oakmont is a small Allegheny River borough about 12 miles northeast of downtown Pittsburgh. It has a modest commercial strip along Allegheny River Boulevard and is best known to outsiders for the Oakmont Country Club (Pittsburgh's famous golf course).

In this database, Oakmont is a control — left in to expose whether the algorithm over-rewards a thin commercial spine in a quiet borough. Useful as a comparison to Sewickley.`,

  "Verona, PA":
`Verona is a small Allegheny River borough next to Oakmont, with a similar small commercial strip along the river and a similar quiet residential character.

In this database, Verona is a control — held in the set to verify whether two similar small boroughs read similarly in the measured data. If Oakmont and Verona produce very different scores despite very similar geography, that's diagnostic information about the metric's robustness.`,

  "Allison Park, PA":
`Allison Park is the owner's home suburb — Hampton Township, about 14 miles north of downtown Pittsburgh. It's car-dependent suburban geography by design: no walkable commercial core, residents drive everywhere, the daily-life model is essentially the opposite of what this project is trying to find.

In this database, Allison Park is the floor. It should score low on every walkability and aliveness metric — that's the point. If it doesn't, the metric is broken. The control that defines what failure looks like.`,
};

const pw = execSync("security find-generic-password -a livability-scout -s supabase-db-password -w", { encoding: "utf8" }).trim();
const c = new pg.Client({ host: "aws-1-us-west-2.pooler.supabase.com", port: 5432, user: "postgres.fitjkrmiwkdolxhitroc", password: pw, database: "postgres", ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query("select id, name from cities order by name");
let updated = 0, missing = [];
for (const r of rows) {
  const text = W[r.name];
  if (!text) { missing.push(r.name); continue; }
  await c.query("update cities set why=$1 where id=$2", [text, r.id]);
  updated++;
}
console.log(`updated ${updated} of ${rows.length}`);
if (missing.length) console.log("MISSING:", missing.join(", "));
await c.end();
