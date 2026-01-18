#!/bin/bash
# Example usage scripts for EPP CLI

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}EPP CLI Example Scripts${NC}"
echo "========================"
echo ""

# Example 1: Check domain availability
echo -e "${GREEN}Example 1: Check Domain Availability${NC}"
echo "Command: epp-cli check-domain example.com"
echo ""
node src/cli/index.js check-domain example.com
echo ""

# Example 2: Check multiple domains
echo -e "${GREEN}Example 2: Check Multiple Domains${NC}"
echo "Checking: example1.com, example2.com, example3.com"
echo ""
for domain in example1.com example2.com example3.com; do
  echo "Checking: $domain"
  node src/cli/index.js --json check-domain "$domain" | jq -r '.availability'
done
echo ""

# Example 3: Get domain info
echo -e "${GREEN}Example 3: Get Domain Information${NC}"
echo "Command: epp-cli info-domain example.com"
echo ""
node src/cli/index.js info-domain example.com
echo ""

# Example 4: Create contact (simulation)
echo -e "${GREEN}Example 4: Create Contact (Simulation)${NC}"
echo "Command: epp-cli create-contact DEMO-CONTACT-\$(date +%s) \\"
echo "  --name 'Demo User' \\"
echo "  --email demo@example.com \\"
echo "  --city 'San Francisco' \\"
echo "  --country US"
echo ""
echo "[Skipped in demo - would create real contact]"
echo ""

# Example 5: Register domain (simulation)
echo -e "${GREEN}Example 5: Register Domain (Simulation)${NC}"
echo "Command: epp-cli create-domain demo-\$(date +%s).com \\"
echo "  --registrant CONTACT-123 \\"
echo "  --ns ns1.example.com,ns2.example.com \\"
echo "  --period 1"
echo ""
echo "[Skipped in demo - would register real domain]"
echo ""

# Example 6: Update nameservers (simulation)
echo -e "${GREEN}Example 6: Update Nameservers (Simulation)${NC}"
echo "Command: epp-cli update-nameservers example.com \\"
echo "  --ns ns1.new.com,ns2.new.com,ns3.new.com"
echo ""
echo "[Skipped in demo - would modify real domain]"
echo ""

# Example 7: Verbose output
echo -e "${GREEN}Example 7: Verbose Output${NC}"
echo "Command: epp-cli --verbose check-domain example.com"
echo ""
echo "[Skipped in demo - produces extensive output]"
echo ""

# Example 8: JSON output with jq
echo -e "${GREEN}Example 8: JSON Output with jq${NC}"
echo "Command: epp-cli --json check-domain example.com | jq '.available'"
echo ""
node src/cli/index.js --json check-domain example.com 2>/dev/null | jq -r '.available' || echo "false"
echo ""

# Example 9: Batch check with error handling
echo -e "${GREEN}Example 9: Batch Check with Error Handling${NC}"
cat > /tmp/domains.txt << EOF
example1.com
example2.com
invalid..domain
example3.com
EOF

echo "Checking domains from file..."
while IFS= read -r domain; do
  result=$(node src/cli/index.js --json check-domain "$domain" 2>&1)
  if echo "$result" | jq -e '.available' > /dev/null 2>&1; then
    status=$(echo "$result" | jq -r '.available')
    echo "  $domain: $([ "$status" = "true" ] && echo "Available" || echo "Registered")"
  else
    echo "  $domain: Error checking"
  fi
done < /tmp/domains.txt
rm /tmp/domains.txt
echo ""

# Example 10: Help command
echo -e "${GREEN}Example 10: Getting Help${NC}"
echo "Command: epp-cli --help"
echo ""
node src/cli/index.js --help
echo ""

echo -e "${BLUE}Examples Complete!${NC}"
echo ""
echo "To use these commands with your EPP server:"
echo "1. Copy .env.example to .env"
echo "2. Configure your EPP server details"
echo "3. Run: chmod +x examples.sh"
echo "4. Run: ./examples.sh"
