# Documentation Quality Scripts

This directory contains scripts for maintaining documentation quality across the project.

## Link Validation Scripts

### Quick Link Check (Recommended)

Fast JavaScript-based link checker for immediate feedback:

```bash
# Check entire docs directory
npm run lint:links

# Check specific directory  
node scripts/quick-link-check.js docs/cs/guide/chapter-01-process-thread

# Check single file
node scripts/quick-link-check.js docs/cs/guide/chapter-01-process-thread/index.md
```

**Features:**
- ⚡ Fast execution (processes files in milliseconds)
- 🎯 Works with both files and directories
- 📊 Clear summary with statistics
- ❌ Detection only - no automatic fixes

### Detailed Link Check (Bash Version)

More detailed bash-based checker with verbose logging:

```bash
# Basic check with detailed logging
npm run lint:links:verbose

# Check specific directory with verbose output
VERBOSE=true ./scripts/check-invalid-links.sh docs/cs/guide/chapter-01-process-thread

# Check single file
./scripts/check-invalid-links.sh docs/cs/guide/chapter-01-process-thread/index.md
```

**Features:**
- 📝 Detailed logging to file
- 🔍 Verbose mode for debugging
- 📋 Comprehensive reporting
- 🗂️ Checks for missing files in index.md

## What Gets Checked

### Link Types

✅ **Validated Links:**
- Internal relative links (`./other-file.md`)
- Internal absolute links (`/docs/path/file.md`)
- Directory links with index.md
- Anchor links within files (`#section`)

✅ **Skipped (Assumed Valid):**
- External URLs (`https://example.com`)
- Email links (`mailto:user@example.com`)
- FTP links (`ftp://server.com`)
- Fragment-only links (`#section-name`)

❌ **Reported as Broken:**
- Links to non-existent files
- Links to directories without index.md
- Malformed relative paths

### Index Completeness

Both scripts check if all `.md` files in a directory are properly listed in the corresponding `index.md` file.

## Output Examples

### Successful Check
```
==========================================
     Quick Link Checker
==========================================
Target: docs/cs/guide/chapter-01-process-thread

==========================================
            SUMMARY
==========================================
Files checked: 34
Total links: 156
Broken links: 0
Missing from index: 0
Duration: 45ms
[SUCCESS] ✅ All links are valid!
```

### Issues Found
```
Found Issues:
✗ BROKEN LINK in docs/cs/guide/chapter-01-process-thread/01-01-01-thread-fundamentals.md
  Link: ./04-02-mutex-basics.md

✗ NOT IN INDEX: docs/cs/guide/chapter-01-process-thread/01-06-05-cpu-affinity-scripts.md

==========================================
            SUMMARY
==========================================
Files checked: 34
Total links: 156
Broken links: 23
Missing from index: 1
Duration: 67ms
[ERROR] ❌ Found issues that need attention
```

## Integration with CI/CD

Add to your workflow to ensure link quality:

```bash
# Check everything before commit
npm run lint:all

# Individual checks
npm run lint:check     # Markdown formatting
npm run lint:mermaid   # Mermaid diagrams  
npm run lint:links     # Link validation
```

## Troubleshooting

### Common Issues

**Permission Errors:**
```bash
chmod +x scripts/check-invalid-links.sh
```

**Path Resolution Issues:**
- Ensure you run scripts from the project root directory
- Use relative paths from the current working directory

**Performance:**
- JavaScript version is faster for large directories
- Bash version provides more detailed logging

### Exit Codes

- `0`: All links valid, no issues found
- `1`: Broken links or missing files detected

This makes the scripts suitable for use in CI/CD pipelines and pre-commit hooks.