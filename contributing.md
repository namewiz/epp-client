# Contributing to EPP Client

Thank you for your interest in contributing to EPP Client! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/namewiz/epp-client.git
cd epp-client
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment**

Copy `.env.example` to `.env` and configure with your EPP server details:

```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Test your setup**

```bash
# Run the CLI
node src/cli/index.js --help
node src/cli/index.js check-domain example.com

# Or use npx after linking
npm link
epp-cli --help
```

## Project Structure

```
epp-client/
├── src/
│   ├── index.js          # Main export (re-exports from lib)
│   ├── lib/
│   │   └── index.js      # Core EPP client library
│   └── cli/
│       ├── index.js      # CLI (Commander-based)
│       ├── config.js     # Configuration handling
│       ├── logger.js     # Logging utilities
│       └── utils.js      # Helper functions
├── test/                 # Test files
├── index.d.ts            # TypeScript definitions
├── package.json
├── README.md
└── CONTRIBUTING.md       # This file
```

## Adding a New Command

The CLI uses [Commander.js](https://github.com/tj/commander.js) and calls the library directly for all commands.

### 1. Add the Library Method (if needed)

If your command requires new functionality, first add it to `src/lib/index.js`:

```javascript
/**
 * Your method description
 */
async yourMethod(options) {
  const { param1, param2 } = options;

  // Build XML command
  const xml = `...`;

  // Send and return result
  return this.sendCommand(xml, options);
}
```

### 2. Add the Command Definition

Add your command using Commander in `src/cli/index.js`:

```javascript
program
  .command("your-command")
  .alias("your")  // optional short alias
  .description("Description of your command")
  .argument("<arg>", "Description of required argument")
  .requiredOption("--required-opt <value>", "Required option description")
  .option("--optional-opt <value>", "Optional option description", "default")
  .action(async (arg, options) => {
    await withClient(async (client) => {
      const result = await client.yourMethod({
        param1: arg,
        param2: options.requiredOpt,
      });
      if (result instanceof Error) throw result;
      return {
        success: true,
        data: result.data,
        message: "Command completed successfully",
      };
    });
  });
```

### 3. Update README

Add examples and documentation to `README.md` under the CLI section.

## Code Style Guidelines

### General Principles

- Use ES modules (import/export)
- Use async/await for asynchronous operations
- Return Error objects from library methods instead of throwing
- Use descriptive variable and function names
- Add JSDoc comments for public functions

### Formatting

- 2 spaces for indentation
- Use double quotes for strings
- Semicolons at end of statements
- Maximum line length: 100 characters

### Error Handling

Library methods should return Error objects rather than throwing:

```javascript
// Good - in library code
if (!required) {
  return new Error("Required parameter missing");
}

// Good - in CLI action handlers
const result = await client.someMethod(options);
if (result instanceof Error) throw result;
```

### Logging

Use the logger utility with appropriate levels:

```javascript
import { logger } from "./logger.js";

logger.error("Critical error");
logger.warn("Warning message");
logger.info("Informational message");
logger.success("Success message");
logger.verbose("Detailed debug info");
```

## Testing

### Running Tests

```bash
npm test
```

### Manual Testing

Test your changes with real EPP servers (use test/OT&E environments):

```bash
# Set up test environment
export EPP_HOST=epp-test.registry.example
export EPP_USERNAME=test-user
export EPP_PASSWORD=test-pass

# Test your command
node src/cli/index.js your-command test-arg --required-opt value

# Test with verbose output
node src/cli/index.js --verbose your-command test-arg

# Test JSON output
node src/cli/index.js --json your-command test-arg
```

### Edge Cases to Test

- Missing required arguments
- Invalid argument formats
- Empty/null values
- Very long strings
- Special characters
- Network timeouts
- Server errors

## Pull Request Process

1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**

- Write clear, descriptive commit messages
- Keep commits focused and atomic
- Test thoroughly

3. **Update documentation**

- Update README.md if adding features
- Update .env.example if adding config options

4. **Submit pull request**

- Provide clear description of changes
- Reference any related issues
- Include examples of usage

## Commit Message Guidelines

Format:

```
type: brief description

Detailed explanation if needed
```

Types:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

Examples:

```
feat: add support for domain transfer command

- Implemented domain:transfer EPP command
- Added transfer-domain CLI command
- Updated help documentation
```

```
fix: handle timeout errors gracefully

Previously, timeout errors would crash the CLI.
Now they're caught and displayed as user-friendly error messages.
```

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
