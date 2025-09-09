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

2. **Angle Brackets Rendering**: Use HTML entities for angle brackets in technical content:
   - Use `&lt;pid&gt;` instead of `<pid>`
   - Use `&lt;pod&gt;` instead of `<pod>`
   - Use `&lt;uid&gt;` instead of `<uid>`
   
**Issue**: Markdown parser treats `<pid>` as HTML tags, causing text to disappear (e.g., "/proc/<pid>/maps" renders as "/proc//maps").
**Solution**: Replace all angle brackets in technical content with HTML entities.

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
   - Use backticks for inline paths: \`/proc/&lt;pid&gt;/maps\`
   - In code blocks, angle brackets are safe to use as-is

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

## Content Migration from NotePlan

When migrating notes from NotePlan:
1. Extract tags from the original format and convert to YAML front matter
2. Fix angle bracket rendering issues
3. Add cross-references between related documents using `[text](relative-path.md)`
4. Ensure Korean content maintains proper formatting

## GitHub Pages Deployment

The wiki automatically deploys to `https://choru-k.github.io/choru-wiki/` when pushing to the main branch. GitHub Actions handles the build and deployment process.

## Important Notes

- The wiki uses MkDocs Material theme with Korean language support
- Search functionality supports both English and Korean
- Tags plugin automatically aggregates tags from all documents
- Custom CSS optimizes Korean font rendering and spacing

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