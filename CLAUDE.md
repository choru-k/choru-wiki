# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a technical documentation wiki built with MkDocs Material, containing computer science and system programming knowledge in Korean. The wiki covers memory management, process/thread concepts, Linux internals, and container technologies.

## Essential Commands

### Local Development
```bash
# Start the wiki server using Docker (recommended)
docker-compose up
# or
./serve.sh

# View at http://localhost:8000

# Build static site
docker run --rm -v ${PWD}:/docs squidfunk/mkdocs-material build
# or
./build.sh
```

### Without Docker (requires Python)
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start development server
mkdocs serve

# Build static site
mkdocs build
```

### Markdown Linting
```bash
# Install dependencies (first time only)
npm install

# Check markdown files for issues
npm run lint:check

# Auto-fix markdown formatting issues
npm run lint

# Check specific file
npx markdownlint docs/path/to/file.md

# Auto-fix specific file
npx markdownlint --fix docs/path/to/file.md
```

### Mermaid Diagram Validation
```bash
# Validate all Mermaid diagrams (recommended)
npm run lint:mermaid

# Validate specific folder
node scripts/validate-mermaid.js docs/cs/memory

# Validate specific file
node scripts/validate-mermaid.js docs/demo-mermaid.md

# Validate with glob patterns
node scripts/validate-mermaid.js "docs/cs/**/*.md"

# Get help
node scripts/validate-mermaid.js --help
```

**Features:**
- ✅ **Zero false positives**: Uses actual mmdc rendering for 100% accurate validation
- ⚡ **Fast parallel processing**: 14 workers process 341+ diagrams in ~117 seconds
- 🎯 **Specific targeting**: Validate individual files, folders, or glob patterns
- 📊 **Detailed reporting**: Shows exact line numbers and error descriptions
- 🚫 **CI/CD integration**: Exits with error code 1 when issues found

### Document Quality Management
```bash
# Use document-splitter for large documents (1000+ lines)
# This agent helps break down complex documents while maintaining content integrity

# Use educational-code-commentator for technical documentation
# This agent enhances code blocks with detailed educational comments

# Use korean-expression-fixer for Korean content review
# This agent fixes awkward Korean expressions and improves readability
```

### Deployment
```bash
# Automatic deployment via GitHub Actions on push to main branch
git push origin main

# Manual deployment to GitHub Pages
docker run --rm -v ${PWD}:/docs squidfunk/mkdocs-material gh-deploy --force
```

## Architecture & Structure

### Content Organization
The wiki uses a hierarchical structure with bilingual support:
- **Navigation**: English titles in `mkdocs.yml`
- **Content**: Korean technical content in markdown files
- **Tags**: YAML front matter format for categorization

### Key Directories
```
docs/
├── cs/                    # Computer Science content
│   ├── memory/           # 9 articles on memory management
│   └── process/          # 8 articles on processes/threads
├── javascripts/          # MathJax configuration for LaTeX support
└── stylesheets/          # Custom CSS for Korean text rendering
```

### Document Format Requirements & Common Issues

1. **Tags (Critical)**: Must use YAML front matter at the beginning of each markdown file:
```yaml
---
tags:
  - Memory
  - Linux
  - Process
---
```
**Issue**: Inline tags like `**Tags:** \`#memory\` \`#linux\`` won't be recognized by MkDocs Material.
**Solution**: Always use YAML front matter format with proper indentation.

2. **Placeholder Formatting**: Use square brackets for placeholders in technical content:
   - Use `[pid]` instead of `<pid>`
   - Use `[pod]` instead of `<pod>`
   - Use `[uid]` instead of `<uid>`
   - Use `[container-id]` instead of `<container-id>`
   
**Issue**: Markdown parser treats `<pid>` as HTML tags, causing text to disappear (e.g., "/proc/<pid>/maps" renders as "/proc//maps").
**Solution**: Use square brackets `[placeholder]` for all placeholders. This is more readable than HTML entities and avoids parsing issues.

3. **Bold Text in Lists**: Add blank line after bold headers for proper list rendering:
```markdown
**Features:**

- Item 1
- Item 2
```
**Issue**: Without blank line, bullet points appear on the same line as the header.
**Solution**: Always add a blank line between bold headers and lists.

4. **Bold Text in Numbered Lists**: Use colon separator properly:
```markdown
1. **Code Area**: Description here
2. **Data Area**: Description here
```
**Issue**: Bold text in numbered lists needs proper formatting to render correctly.
**Solution**: Use format `**Term**: Description` without the bold extending to the description.

5. **File Path Formatting**: When referencing file paths in code blocks or inline:
   - Use backticks for inline paths: \`/proc/[pid]/maps\`
   - In code blocks, angle brackets for C/C++ includes are safe to use as-is: `#include <stdio.h>`

6. **Mermaid Diagram Common Issues**: Based on comprehensive validation of 341+ diagrams, these are the most frequent Mermaid parsing errors:

**6.1 Korean Text + Comma in Node Labels (Most Common)**:
```mermaid
# Bad - Parse error likely
graph TD
    A[Main Arena, 메인 스레드용]
    B{워크로드 타입}
    
# Good - Always quote labels with Korean text or commas
graph TD
    A["Main Arena, 메인 스레드용"]
    B{"워크로드 타입"}
```
**Issue**: Unquoted node labels containing Korean characters or commas cause parse errors in 90% of cases.
**Solution**: Always wrap node labels containing Korean text or commas in double quotes.

**6.2 Sequence Diagram Participant Strings**:
```mermaid
# Bad - Unclosed participant strings
sequenceDiagram
    participant A as "User
    participant B as Server"
    
# Good - Proper string closing
sequenceDiagram
    participant A as "User"
    participant B as "Server"
```
**Issue**: Line breaks or unclosed quotes in participant definitions cause parsing failures.
**Solution**: Ensure all participant strings are properly closed on the same line.

**6.3 ER Diagram Syntax**:
```mermaid
# Good - ER diagrams use special brace syntax for relationships
erDiagram
    USER ||--o{ ORDER : places
    USER {
        int id PK
        string name
    }
```
**Note**: ER diagrams use `{` and `}` for entity definitions and relationships, which is correct syntax.

**6.4 Line Break Handling**:
```mermaid
# Bad - HTML line breaks cause issues
graph TD
    PCT[프로세스 제어 블록<br/>PCB]
    
# Good - Use quotes with actual line breaks or single line
graph TD
    PCT["프로세스 제어 블록
    PCB"]
    # Or: PCT["프로세스 제어 블록 PCB"]
```
**Issue**: HTML `<br/>` tags in Mermaid diagrams may not render correctly, especially with Korean text.
**Solution**: Use quoted strings with actual line breaks or keep text on a single line.

**6.5 SequenceDiagram Specific Issues**:
```mermaid
# Bad - Style declarations cause parse errors in sequence diagrams
sequenceDiagram
    participant A as 부모프로세스  # Bad - unquoted Korean
    A->>B: fork() → 자식 생성     # Bad - Unicode arrow
    style A fill:#4CAF50          # Bad - style declarations
    
# Good - Corrected version
sequenceDiagram
    participant A as "부모프로세스"  # Good - quoted Korean
    A->>B: fork() - 자식 생성      # Good - ASCII dash
    # No style declarations        # Good - styles removed
```
**Issue**: SequenceDiagram has unique syntax requirements that differ from other Mermaid diagram types.
**Solution**: 
- Always quote Korean text in participant `as` declarations
- Remove `style` declarations (they cause parse errors in sequence diagrams)
- Use ASCII characters instead of Unicode symbols (→ becomes -)
- Replace HTML `<br/>` with actual line breaks in quoted strings

**6.6 Validation Best Practices**:
- **Always test diagrams**: Use `npm run lint:mermaid` to validate all diagrams
- **Use Worker-based validation**: Current script validates 341 diagrams in ~117 seconds with 14 workers
- **No false positives**: Validation uses actual mmdc rendering, ensuring only real errors are reported
- **Quote Korean content**: When in doubt, wrap Korean text and comma-containing labels in quotes

### Extended Markdown Features

The wiki supports:
- **LaTeX Math**: Inline `\(equation\)` and display `\[equation\]`
- **Mermaid Diagrams**: Flow charts, sequence diagrams, state diagrams
- **Code Highlighting**: With line numbers and highlighting specific lines
- **Admonitions**: Note, warning, tip, danger blocks
- **Tabbed Content**: For showing code in multiple languages

### Configuration Files

- `mkdocs.yml`: Main configuration with navigation, theme, and plugin settings
- `docker-compose.yml`: Docker container configuration for local development
- `requirements.txt`: Python dependencies (mkdocs-material, Pygments)
- `.github/workflows/deploy.yml`: Automatic deployment to GitHub Pages
- `package.json`: Node.js dependencies for markdown linting
- `.markdownlint.json`: Markdownlint configuration rules
- `.lintstagedrc.json`: Lint-staged configuration for pre-commit hooks
- `.husky/pre-commit`: Git pre-commit hook to run linters automatically

## Content Migration from NotePlan

When migrating notes from NotePlan:
1. Extract tags from the original format and convert to YAML front matter
2. Fix angle bracket rendering issues
3. Add cross-references between related documents using `[text](relative-path.md)`
4. Ensure Korean content maintains proper formatting

## GitHub Pages Deployment

The wiki automatically deploys to `https://choru-k.github.io/choru-wiki/` when pushing to the main branch. GitHub Actions handles the build and deployment process.

## Quality Assurance Workflow

### Specialized Agents for Content Quality

Before committing significant documentation changes, use these specialized agents to ensure content quality:

1. **document-splitter**: Use when documents exceed 1000 lines
   - Automatically breaks down large documents into manageable sections
   - Maintains content integrity and cross-references
   - Creates comprehensive overview documents
   - Ideal for complex technical guides and extensive documentation

2. **educational-code-commentator**: Use for technical documentation with code blocks
   - Adds detailed educational comments to complex code examples
   - Transforms production code into learning resources
   - Maintains Korean storytelling format for consistency
   - Enhances code comprehension for readers

3. **korean-expression-fixer**: Use for Korean content review
   - Fixes awkward machine-translated or unnatural Korean expressions
   - Improves readability while maintaining technical accuracy
   - Ensures natural Korean flow in technical content
   - Reviews and enhances Korean grammar and style

### Pre-Commit Quality Review Process

For significant documentation updates, follow this process:

1. **Content Review**: Use appropriate specialized agents based on content type
2. **Technical Validation**: Run `npm run lint:mermaid` for diagram validation
3. **Markdown Linting**: Pre-commit hooks automatically run `markdownlint --fix`
4. **Final Commit**: Commit changes after all quality checks pass

## Important Notes

- The wiki uses MkDocs Material theme with Korean language support
- Search functionality supports both English and Korean
- Tags plugin automatically aggregates tags from all documents
- Custom CSS optimizes Korean font rendering and spacing
- **Pre-commit hooks automatically run markdown linting before each commit**
- Markdown files are automatically formatted to follow consistent style rules
- **Use specialized agents proactively to maintain high documentation quality**

## Troubleshooting Common Rendering Issues

### Tags Not Showing
**Symptom**: Tags don't appear in the rendered page.
**Fix**: Ensure YAML front matter is at the very beginning of the file with proper `---` delimiters.

### Missing Text After Angle Brackets
**Symptom**: Text like "/proc/<pid>/maps" renders as "/proc//maps".
**Fix**: Replace `<` with `&lt;` and `>` with `&gt;`.

### Bullet Points on Same Line as Header
**Symptom**: Lists appear inline with bold headers instead of below them.
**Fix**: Add a blank line between the bold header and the first list item.

### Bold Text Not Rendering in Lists
**Symptom**: `**text**` appears as plain text in numbered lists.
**Fix**: Ensure closing `**` is placed correctly: `1. **Term**: Description`.

### Korean Text Spacing Issues
**Symptom**: Korean text appears cramped or poorly spaced.
**Fix**: Custom CSS in `docs/stylesheets/extra.css` handles this - ensure it's loaded in `mkdocs.yml`.

## Markdown Linting Rules

The project uses `markdownlint` to enforce consistent markdown formatting. Key rules include:

### Enforced Rules
- **MD037**: No spaces inside emphasis markers (`**bold**` not `** bold **`)
- **MD032**: Lists must be surrounded by blank lines
- **MD030**: Spaces after list markers (1 space after `-`, `*`, `+`, `1.`)
- **MD009**: No trailing spaces (except for line breaks with exactly 2 spaces)
- **MD022**: Headings must be surrounded by blank lines
- **MD031**: Fenced code blocks must be surrounded by blank lines
- **MD047**: Files must end with a single newline character

### Disabled Rules
- **MD013/MD041**: Line length limit disabled (long URLs and tables allowed)
- **MD025**: Multiple top-level headings allowed
- **MD036**: Emphasis used instead of heading allowed
- **MD033**: HTML elements allowed for special cases (`<br>`, `<sup>`, `<sub>`, etc.)

### Pre-commit Hook
When you commit files, the pre-commit hook will:
1. Automatically run `markdownlint --fix` on staged markdown files
2. Fix any auto-fixable formatting issues
3. Fail the commit if there are unfixable issues (you'll need to fix them manually)

To bypass the hook in emergency situations (not recommended):
```bash
git commit --no-verify -m "commit message"
```