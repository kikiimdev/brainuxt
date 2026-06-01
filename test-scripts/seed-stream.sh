#!/bin/bash
# seed_stream.sh - Simulates a real-world high-frequency logging stream

API_URL="http://localhost:3000/api/memories/remember"

# Array of domain targets to test taxonomy routing sharding
DOMAINS=("SALAM-RINDU" "NEXUS-CORE" "SATU-DATA" "QUANTUM-LEDGER" "DEVOPS")
PROFILES=("build-log" "html-body" "git-status" "generic")
LOG_TYPES=("TODO" "PROGRESS" "METRIC")

echo "🚀 Starting high-velocity stream ingestion pool..."
echo "📥 Ingesting 105 rows into Brainuxt buffer plane..."
echo "----------------------------------------------------"

START_TIME=$(date +%s)

# Loops 105 times to comfortably break past your 10-item RAM buffer ceiling 10 times over
for i in {1..105}
do
  # Safely pick random array indexes using bash arithmetic
  DOMAIN=${DOMAINS[$RANDOM % ${#DOMAINS[@]}]}
  PROFILE=${PROFILES[$RANDOM % ${#PROFILES[@]}]}
  TYPE=${LOG_TYPES[$RANDOM % ${#LOG_TYPES[@]}]}
  
  # Generate unique 8-character random string alphanumeric footprints for FTS matching tests
  FOOTPRINT=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 8)

  # Create diverse operational markdown log text payload contexts
  if [ "$TYPE" == "TODO" ]; then
    CONTENT="TODO: Fix memory leak issue inside the $DOMAIN integration pipeline stream wrapper. Footprint: $FOOTPRINT"
  elif [ "$TYPE" == "PROGRESS" ]; then
    CONTENT="PROGRESS: $DOMAIN system successfully matched profile signature type $PROFILE. Footprint: $FOOTPRINT"
  else
    CONTENT="STRESS_TEST_SEED: Ingesting streaming pipeline frame context metrics for $DOMAIN.\nProfile signature matched: $PROFILE.\nSequence sequence footprint: $FOOTPRINT"
  fi

  # Fire JSON execution request silently over your network interface wire
  curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$CONTENT\", \"profile\": \"$PROFILE\"}" \
    -o /dev/null & # 🎯 The "&" pushes commands to the background for ultra-parallel speed!

  # Pause slightly every 10 iterations to let the local Bun event loops breathe
  if [ $((i % 10)) -eq 0 ]; then
    wait # Let current background curls finish before spawning more
    echo "📥 Stream pipeline processed $i/105 items..."
  fi
done

wait # Wait for final outstanding parallel network execution threads to return safely
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo "----------------------------------------------------"
echo "🏁 Stream ingestion complete in ${ELAPSED}s!"
echo "💡 Run 'brainuxt status' to check your RAM buffer allocations and relational database metrics."