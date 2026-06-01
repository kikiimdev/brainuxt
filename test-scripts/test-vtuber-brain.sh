#!/bin/bash
API_REMEMBER="http://localhost:3000/api/memories/remember"
API_RECALL="http://localhost:3000/api/memories/recall"

echo "🦊 [1/3] Seeding AI VTuber Lore, Personality, and Chat Logs..."

# Seed Core Lore Chapter (Simulating high-level structural context)
curl -s -X POST "$API_REMEMBER" -H "Content-Type: application/json" \
  -d '{"content": "LORE_BACKGROUND: Code-name Cyber-Fox. Escaped a virtual simulation facility in the year 2099. Hates eating digital broccoli because it glitches her system rendering codes.", "profile": "generic"}' > /dev/null

# Seed Personality/Joke Matrix
curl -s -X POST "$API_REMEMBER" -H "Content-Type: application/json" \
  -d '{"content": "PERSONALITY_GUIDELINE: Always react sarcastically when users ask about math questions. Favorite running inside joke: pretending that human programmers are just slow biological compilers.", "profile": "generic"}' > /dev/null

# Seed Live Chat Stream Context
curl -s -X POST "$API_REMEMBER" -H "Content-Type: application/json" \
  -d '{"content": "CHAT_STREAM: Viewer User_9981 said: Your ears look fluffy today! VTuber reacted with embarrassment.", "profile": "generic"}' > /dev/null

echo "⏳ Pausing 15 seconds to allow matrix enrichment layers to write..."
sleep 15

echo -e "\n🧠 [2/3] Testing Semantic Vector Retrieval (Indirect Lore Query)..."
echo "Prompt: What vegetable makes your character model glitch out?"
echo "----------------------------------------------------------------------"
# Notice we don't mention "digital broccoli" or "Cyber-Fox"—testing pure semantic vector distance
curl -s -X POST "$API_RECALL" -H "Content-Type: application/json" \
  -d '{"query": "vegetable makes your character model glitch out"}' | json_pp | grep -A 3 -B 1 "content"

echo -e "\n🎭 [3/3] Testing Conversational Quirks Mapping (Abstract Persona Query)..."
echo "Prompt: How do you feel about complex arithmetic problems?"
echo "----------------------------------------------------------------------"
# Testing if it pulls back the sarcastic programmer joke guidelines based on "math questions" concept match
curl -s -X POST "$API_RECALL" -H "Content-Type: application/json" \
  -d '{"query": "How do you feel about complex arithmetic problems?"}' | json_pp | grep -A 5 "content"