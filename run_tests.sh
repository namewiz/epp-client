#!/bin/bash

# EPP Client Test Runner
# Runs comprehensive test suite with various options

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}EPP Client Test Suite${NC}"
echo -e "${GREEN}================================${NC}"
echo

# Parse arguments
WATCH=false
COVERAGE=false
SPECIFIC_TEST=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --watch)
      WATCH=true
      shift
      ;;
    --coverage)
      COVERAGE=true
      shift
      ;;
    --file)
      SPECIFIC_TEST="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Build test command
if [ "$SPECIFIC_TEST" != "" ]; then
  echo -e "${YELLOW}Running specific test: $SPECIFIC_TEST${NC}"
  TEST_FILES="test/$SPECIFIC_TEST"
else
  echo -e "${YELLOW}Running all tests${NC}"
  TEST_FILES="test/*.test.js"
fi

TEST_CMD="node --test"

if [ "$WATCH" = true ]; then
  echo -e "${YELLOW}Watch mode enabled${NC}"
  TEST_CMD="$TEST_CMD --watch"
fi

if [ "$COVERAGE" = true ]; then
  echo -e "${YELLOW}Coverage enabled${NC}"
  TEST_CMD="$TEST_CMD --experimental-test-coverage"
fi

TEST_CMD="$TEST_CMD $TEST_FILES"

echo
echo -e "${GREEN}Command:${NC} $TEST_CMD"
echo

# Run tests
$TEST_CMD

echo
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Test Summary${NC}"
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✓ Tests completed${NC}"
