#!/bin/bash
API_REMEMBER="http://localhost:3000/api/memories/remember"
API_RECALL="http://localhost:3000/api/memories/recall"
API_STATS="http://localhost:3000/api/dashboard/stats"

echo "📝 [1/3] Seeding Productivity Stream Logs..."

# 1. Seed scattered daily notes, tasks, and meeting lines
curl -s -X POST "$API_REMEMBER" -H "Content-Type: application/json" \
  -d '{"content": "MEETING: Sync with client regarding cluster bottlenecks. Client is worried about packet drop rates on production Node B.", "profile": "generic"}' > /dev/null

curl -s -X POST "$API_REMEMBER" -H "Content-Type: application/json" \
  -d '{"content": "TODO: Fix memory leak inside the transform bridge routing array before Friday release.", "profile": "build-log"}' > /dev/null

curl -s -X POST "$API_REMEMBER" -H "Content-Type: application/json" \
  -d '{"content": "PROGRESS: Upgraded FTS5 indexing queries for the main search controller plane.", "profile": "generic"}' > /dev/null

echo "⏳ Pausing 15 seconds to allow RAM buffer to commit to database disk..."
sleep 15

echo -e "\n🔍 [2/3] Testing FTS Lookup: Querying Specific Client Bottleneck..."
echo "----------------------------------------------------------------------"
# Test if FTS fallback successfully catches specific text keyword matches
curl -s -X POST "$API_RECALL" -H "Content-Type: application/json" \
  -d '{"query": "production Node B drop rates"}' | json_pp | grep -E "content|tags"

echo -e "\n📋 [3/3] Checking Dashboard Task Backlog State..."
echo "----------------------------------------------------------------------"
# Check if your terminal CLI state processor isolates the open action loop
# Run your native CLI tool directly to verify the output
# brainuxt status | grep -A 4 "Project Context"
curl -s -X GET "$API_STATS" | json_pp