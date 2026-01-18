# EPP Client - Quick Start Guide

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your EPP server details:

```env
EPP_HOST=epp.your-registry.com
EPP_PORT=700
EPP_USERNAME=your-username
EPP_PASSWORD=your-password
```

### 3. Make CLI Executable

```bash
chmod +x src/cli/index.js
```

### 4. Test Connection

```bash
./src/cli/index.js check-domain example.com

# Or use the epp-cli command after npm link
npm link
epp-cli check-domain example.com
```

## Common Tasks

### Check Domain Availability

```bash
epp-cli check-domain example.com
```

### Get Domain Information

```bash
epp-cli info-domain example.com
```

### Create a Contact

```bash
epp-cli create-contact CONTACT-001 \
  --name "John Doe" \
  --email john@example.com \
  --city "New York" \
  --state NY \
  --postcode 10001 \
  --country US \
  --phone "+1.2125551234"
```

### Register a Domain

```bash
epp-cli create-domain newdomain.com \
  --registrant CONTACT-001 \
  --ns ns1.example.com,ns2.example.com \
  --period 1
```

### Update Nameservers

```bash
epp-cli update-nameservers example.com \
  --ns ns1.new.com,ns2.new.com
```

### Update Domain Status

```bash
# Add clientHold status
epp-cli update-domain example.com --add-status clientHold

# Remove clientHold status
epp-cli update-domain example.com --remove-status clientHold
```

### Enable/Disable Auto-Renew

```bash
# Enable auto-renew
epp-cli update-auto-renew example.com --enable

# Disable auto-renew
epp-cli update-auto-renew example.com --disable
```

## Output Formats

### Human-Readable (Default)

```bash
epp-cli check-domain example.com
```

Output:

```
[12:34:56] [INFO] Connecting to EPP server...
[12:34:56] [SUCCESS] Logged in successfully
[12:34:57] [INFO] Checking domain: example.com
[12:34:57] [SUCCESS] Command completed successfully
[12:34:57] [INFO] Result: {
  "domain": "example.com",
  "available": false,
  "status": "registered"
}
```

### JSON Output

```bash
epp-cli --json check-domain example.com
```

Output:

```json
{
  "domain": "example.com",
  "available": false,
  "status": "registered",
  "reason": null
}
```

### Verbose Output

```bash
epp-cli --verbose check-domain example.com
```

Shows:

- Connection details
- XML sent/received
- Detailed timing
- Full response data

### Quiet Mode

```bash
epp-cli --quiet check-domain example.com
```

Only shows errors.

## Scripting Examples

### Batch Check Domains

```bash
#!/bin/bash
for domain in $(cat domains.txt); do
  result=$(epp-cli --json check-domain "$domain")
  available=$(echo "$result" | jq -r '.available')
  echo "$domain: $available"
done
```

### Register Multiple Domains

```bash
#!/bin/bash
CONTACT="CONTACT-001"

while IFS= read -r domain; do
  echo "Registering: $domain"
  epp-cli create-domain "$domain" \
    --registrant "$CONTACT" \
    --ns ns1.example.com,ns2.example.com
done < domains.txt
```

### Update Nameservers in Bulk

```bash
#!/bin/bash
NEW_NS="ns1.new.com,ns2.new.com"

while IFS= read -r domain; do
  echo "Updating: $domain"
  epp-cli update-nameservers "$domain" --ns "$NEW_NS"
done < domains.txt
```

## Error Handling

### Check Exit Code

```bash
if epp-cli check-domain example.com; then
  echo "Command succeeded"
else
  echo "Command failed with code: $?"
fi
```

### Capture Errors

```bash
result=$(epp-cli --json check-domain example.com 2>&1)
if [ $? -eq 0 ]; then
  echo "Success: $result"
else
  echo "Error: $result"
fi
```

## Configuration Override

### Use Different Config File

```bash
epp-cli --config production.env check-domain example.com
```

### Override on Command Line

```bash
epp-cli \
  --host epp.test.com \
  --username test-user \
  --password test-pass \
  check-domain example.com
```

### Set Timeout

```bash
# 60 second timeout
epp-cli --timeout 60000 create-domain example.com ...
```

## Troubleshooting

### Connection Issues

```bash
# Test with verbose output
epp-cli --verbose check-domain example.com

# Check server accessibility
telnet epp.your-registry.com 700
```

### Authentication Errors

- Verify EPP_USERNAME and EPP_PASSWORD in .env
- Ensure account has proper permissions
- Check if IP address is whitelisted

### Command Timeouts

```bash
# Increase timeout to 2 minutes
epp-cli --timeout 120000 your-command
```

### Debug Mode

```bash
DEBUG=1 epp-cli --verbose check-domain example.com
```

## Getting Help

### General Help

```bash
epp-cli --help
```

### Version Information

```bash
epp-cli --version
```

## Tips & Tricks

### Create Alias

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias epp='epp-cli'
```

Then use:

```bash
epp check-domain example.com
```

### Use jq for JSON Processing

```bash
# Get just the availability status
epp-cli --json check-domain example.com | jq -r '.available'

# Pretty print JSON
epp-cli --json info-domain example.com | jq .
```

### Create Shell Functions

```bash
check-available() {
  epp-cli --json check-domain "$1" | jq -r '.available'
}

# Usage
check-available example.com
```

## Next Steps

1. Read the full [README.md](README.md) for comprehensive documentation
2. Check [CONTRIBUTING.md](contributing.md) to add custom commands
3. Run [examples.sh](examples.sh) to see more usage examples
4. Explore the EPP protocol documentation for your registry

## Support

- GitHub Issues: Report bugs or request features
- Documentation: Check README.md for detailed info
- Examples: Run examples.sh for working examples
