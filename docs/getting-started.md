# Getting Started

This guide will help you get started with your MkDocs Material wiki.

## Prerequisites

You'll need Docker installed on your system. Install from [docker.com](https://www.docker.com/get-started).

## Installation

### 1. Using Docker Compose (Recommended)

No installation needed! MkDocs Material runs in a container.

### 2. Local Development

Start the development server with Docker Compose:

```bash
docker-compose up
```

Or run directly with Docker:

```bash
docker run --rm -it -p 8000:8000 -v ${PWD}:/docs squidfunk/mkdocs-material
```

Your wiki will be available at `http://127.0.0.1:8000`

The development server will automatically reload when you make changes to your documentation.

## Writing Documentation

### File Structure

```
docs/
├── index.md          # Homepage
├── getting-started.md # This file
└── ...              # Add more pages as needed
```

### Adding New Pages

1. Create a new `.md` file in the `docs/` directory
2. Add it to the `nav` section in `mkdocs.yml`
3. Write your content using Markdown

Example:

```yaml
nav:
  - Home: index.md
  - Getting Started: getting-started.md
  - My New Page: my-new-page.md  # Add your new page here
```

## Markdown Features

### Headers

```markdown
# H1 Header
## H2 Header
### H3 Header
```

### Code Blocks

Use triple backticks with language specification:

````markdown
```python
def example():
    return "Hello World"
```
````

### Admonitions

```markdown
!!! note "Title"
    Content of the note.

!!! warning
    Warning content.

!!! tip
    Helpful tip.
```

### Tables

```markdown
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
| Data 3   | Data 4   |
```

## Building for Production

Build static site with Docker:

```bash
docker run --rm -v ${PWD}:/docs squidfunk/mkdocs-material build
```

Or with Docker Compose:

```bash
docker-compose run --rm mkdocs build
```

This creates a `site/` directory with your static website.

## Deployment

### GitHub Pages

The included GitHub Actions workflow will automatically deploy to GitHub Pages when you push to the main branch.

1. Enable GitHub Pages in your repository settings
2. Set source to "GitHub Actions"
3. Push to main branch
4. Your site will be available at `https://[username].github.io/[repository]/`

### Manual Deployment

Deploy to GitHub Pages manually with Docker:

```bash
docker run --rm -v ${PWD}:/docs squidfunk/mkdocs-material gh-deploy --force
```

## Customization

Edit `mkdocs.yml` to:

- Change theme colors
- Add/remove features
- Configure plugins
- Modify navigation structure

See the [Material for MkDocs documentation](https://squidfunk.github.io/mkdocs-material/) for all customization options.
