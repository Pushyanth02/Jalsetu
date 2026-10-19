#!/bin/bash
# JalSetu — contextual scene image pool generation, parallel batches of 5.
set -u
OUT=/home/z/my-project/public/img/scenes
mkdir -p "$OUT"
S="1344x768"
STYLE="documentary photojournalism, Delhi India monsoon season, overcast daylight, muted tones, gritty realism, photorealistic, no text, no watermark"
PIDS=()

run() { # name prompt
  local name="$1"; shift
  if [ -s "$OUT/$name.png" ]; then echo "skip $name"; return; fi
  ( z-ai image -p "$1, $STYLE" -o "$OUT/$name.png" -s "$S" >/dev/null 2>&1 \
      && echo "OK  $name" || echo "FAIL $name" ) &
  PIDS+=($!)
  # throttle: batches of 5
  if (( ${#PIDS[@]} % 3 == 0 )); then wait; fi
}

run street-flood-1 "urban Delhi street with shallow sheet of ankle-deep monsoon flood water, pedestrians wading carefully along the roadside, rickshaws passing, wet asphalt reflections"
run street-flood-2 "residential colony road in Delhi with light water ponding along the curb after monsoon rain, shallow puddles reflecting grey sky, people walking on the drier side"
run street-flood-3 "heavily waterlogged Delhi arterial road with knee-deep flood water, stalled auto-rickshaws and cars with hazard lights, commuters carrying shoes wading through"
run street-flood-4 "severe urban flooding on a Delhi road, deep water submerging car wheels halfway, closed lane with barricade tape, monsoon downpour, dramatic grey sky"
run pothole-1 "close-up of a small water-filled pothole on a wet Delhi city road after rain, shallow muddy water, cracked asphalt edges, motorcycle passing in background"

run pothole-2 "poorly maintained colony road in Delhi with several water-filled potholes and light rain water accumulation, patched asphalt, scooter navigating around them"
run pothole-3 "large deep pothole filled with muddy rainwater on a busy Delhi street, two-wheeler riders swerving around it, passing traffic motion blur, overcast monsoon light"
run pothole-4 "badly broken road section in Delhi with a deep crater pothole full of muddy monsoon water, loose gravel and eroded asphalt, warning placed by locals"
run drain-overflow-1 "concrete storm drain grating along a Delhi roadside slowly seeping rain water onto the road edge, damp pavement spreading, light monsoon drizzle"
run drain-overflow-2 "open street-side storm drain in Delhi slowly overflowing after monsoon rain, water creeping across the kerb onto the road, wet debris near the grating"

run drain-overflow-3 "blocked storm drain in Delhi gushing muddy water across a city road during monsoon, strong water flow spreading over the asphalt, pedestrians keeping distance"
run drain-overflow-4 "overwhelming storm drain overflow on a Delhi street, muddy flood water with plastic debris spreading across the road surface, partially submerged drain grate"
run sewer-backup-1 "city manhole on a Delhi road with slight wastewater seepage forming a damp ring around the cast iron cover, wet asphalt after monsoon rain"
run sewer-backup-2 "lifted manhole cover on a Delhi street with slow wastewater overflow trickling onto the road, cautious pedestrians walking around, overcast light"
run sewer-backup-3 "sewer manhole overflowing onto a Delhi street during monsoon, murky wastewater spreading across the road, shopkeepers watching from shuttered shops"

run sewer-backup-4 "significant sewer backup on a Delhi road with wastewater flooding the street surface, municipal workers placing barricades, murky water pooling widely"
run underpass-1 "Delhi road underpass with a thin film of rain water at the lowest stretch, cars passing through slowly with spray, overhead lights reflecting on wet surface"
run underpass-2 "urban underpass in Delhi with pooled rain water accumulating at the lowest point, single warning cone placed by police, light traffic passing on the higher side"
run underpass-3 "half-flooded Delhi underpass with stalled vehicles in knee-deep water, municipal pump truck at work, reflective vests of workers, dramatic monsoon shadows"
run underpass-4 "fully flooded road underpass in Delhi closed with police barricades, deep green-brown water filling the entire dip, monsoon rain falling, warning signage"

wait
run weather-gauge-1 "professional rain gauge instrument at a ground weather station in an urban Delhi park during monsoon drizzle, measuring cylinder with collected rainwater, wet grass, soft grey light"
run weather-rain-2 "grey monsoon sky over Delhi skyline with heavy rain clouds and light drizzle falling on city rooftops, distant water towers, moody atmospheric light"
(
  if [ -s "$OUT/hero-delhi-monsoon.png" ]; then echo "skip hero"; else
  z-ai image -p "cinematic aerial dusk view of Delhi during monsoon, street lights and traffic streaks reflecting on waterlogged streets below, dark teal and amber palette, atmospheric rain haze, high detail" -o "$OUT/hero-delhi-monsoon.png" -s "1440x720" >/dev/null 2>&1 && echo "OK  hero" || echo "FAIL hero"; fi
) &

wait
echo "DONE-ALL"
ls -la "$OUT" | wc -l
