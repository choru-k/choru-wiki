#!/bin/bash

# Invalid Link Checker Script
# Simple detection and reporting of broken links in markdown files

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_FILES=0
FILES_WITH_ISSUES=0
TOTAL_LINKS=0
BROKEN_LINKS=0
MISSING_FILES=0

# Configuration
TARGET="${1:-docs}"
VERBOSE="${VERBOSE:-false}"

# Log file
LOG_FILE="link-check-$(date +%Y%m%d-%H%M%S).log"

print_usage() {
    cat << EOF
Usage: $0 [TARGET] [OPTIONS]

Arguments:
  TARGET            File or directory to scan (default: docs)

Environment Variables:
  VERBOSE=true      Enable verbose output

Examples:
  # Check entire docs directory
  ./scripts/check-invalid-links.sh

  # Check specific directory
  ./scripts/check-invalid-links.sh docs/cs/guide

  # Check single file
  ./scripts/check-invalid-links.sh docs/cs/guide/chapter-01/index.md

  # Verbose mode
  VERBOSE=true ./scripts/check-invalid-links.sh

EOF
}

log_message() {
    local level="$1"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE" >/dev/null
}

print_header() {
    echo -e "${BLUE}=================================="
    echo -e "    Invalid Link Checker"
    echo -e "==================================${NC}"
    echo "Target: $TARGET"
    echo "Log file: $LOG_FILE"
    echo "Verbose mode: $VERBOSE"
    echo ""
}

# Extract all markdown links from a file
extract_links() {
    local file="$1"
    # Match both [text](link) and [text]: link patterns
    {
        grep -oE '\[([^\]]*)\]\(([^)]+)\)' "$file" 2>/dev/null | sed 's/\[.*\](\([^)]*\))/\1/' || true
        grep -oE '^\[([^\]]*)\]: (.+)$' "$file" 2>/dev/null | sed 's/^\[[^\]]*\]: \(.*\)$/\1/' || true
    }
}

# Check if a link is valid (file exists or is valid URL)
check_link() {
    local file_path="$1"
    local link="$2"
    local file_dir
    file_dir="$(dirname "$file_path")"
    
    # Skip empty links
    [[ -z "$link" ]] && return 1
    
    # Skip anchor-only links (#section)
    [[ "$link" =~ ^#.* ]] && return 0
    
    # Skip external URLs (http/https/ftp/mailto)
    [[ "$link" =~ ^https?:// ]] && return 0
    [[ "$link" =~ ^ftp:// ]] && return 0
    [[ "$link" =~ ^mailto: ]] && return 0
    
    # Handle relative links
    local target_path
    if [[ "$link" =~ ^/ ]]; then
        # Absolute path from repo root
        target_path="$(dirname "$TARGET")/${link#/}"
    else
        # Relative path from current file
        target_path="${file_dir}/${link}"
    fi
    
    # Remove anchors from file paths
    target_path="${target_path%%#*}"
    
    # Normalize path (remove ./ and ../)
    if command -v realpath >/dev/null 2>&1; then
        target_path="$(cd "$file_dir" 2>/dev/null && realpath -m "$target_path" 2>/dev/null || echo "$target_path")"
    fi
    
    # Check if file exists
    [[ -f "$target_path" ]] && return 0
    
    # If it's a directory, check for index.md
    [[ -d "$target_path" && -f "${target_path}/index.md" ]] && return 0
    
    return 1
}

# Check a single markdown file
check_file() {
    local file="$1"
    local file_issues=0
    local file_links=0
    
    [[ "$VERBOSE" == "true" ]] && echo -e "${BLUE}Checking: $file${NC}"
    
    # Extract and check each link
    while IFS= read -r link; do
        [[ -z "$link" ]] && continue
        
        ((file_links++))
        ((TOTAL_LINKS++))
        
        if ! check_link "$file" "$link"; then
            ((file_issues++))
            ((BROKEN_LINKS++))
            
            echo -e "${RED}✗ BROKEN LINK${NC} in $file"
            echo -e "  Link: ${YELLOW}$link${NC}"
            
            log_message "ERROR" "Broken link in $file: $link"
        elif [[ "$VERBOSE" == "true" ]]; then
            echo -e "${GREEN}  ✓ $link${NC}"
        fi
    done < <(extract_links "$file")
    
    if [[ $file_issues -gt 0 ]]; then
        ((FILES_WITH_ISSUES++))
        echo -e "${RED}Found $file_issues broken link(s) in $file${NC}"
    elif [[ "$VERBOSE" == "true" ]]; then
        echo -e "${GREEN}✓ All $file_links link(s) valid in $file${NC}"
    fi
    
    echo ""
}

# Check if file or directory is missing from index
check_missing_from_index() {
    local chapter_dir="$1"
    local index_file="$chapter_dir/index.md"
    
    [[ ! -f "$index_file" ]] && return 0
    
    echo -e "${BLUE}Checking for missing files in index: $index_file${NC}"
    
    # Find all .md files except index.md
    while IFS= read -r md_file; do
        local basename_file
        basename_file="$(basename "$md_file")"
        
        # Skip index.md itself
        [[ "$basename_file" == "index.md" ]] && continue
        
        # Check if file is referenced in index
        if ! grep -q "$basename_file" "$index_file"; then
            ((MISSING_FILES++))
            echo -e "${RED}✗ NOT IN INDEX${NC}: $md_file"
            log_message "WARNING" "File not in index: $md_file"
        fi
    done < <(find "$chapter_dir" -maxdepth 1 -name "*.md" -type f)
}

# Main execution
main() {
    # Handle help
    if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
        print_usage
        exit 0
    fi
    
    print_header
    
    # Check if target exists
    if [[ ! -d "$TARGET" ]] && [[ ! -f "$TARGET" ]]; then
        echo -e "${RED}Error: Target '$TARGET' does not exist${NC}"
        exit 1
    fi
    
    log_message "INFO" "Starting link validation for: $TARGET"
    
    # Check single file
    if [[ -f "$TARGET" ]]; then
        if [[ "$TARGET" =~ \.md$ ]]; then
            TOTAL_FILES=1
            check_file "$TARGET"
        else
            echo -e "${RED}Error: File must be a markdown file (.md)${NC}"
            exit 1
        fi
    else
        # Check all markdown files in directory
        while IFS= read -r file; do
            ((TOTAL_FILES++))
            check_file "$file"
        done < <(find "$TARGET" -name "*.md" -type f | sort)
        
        # Check for missing files in chapter indices
        while IFS= read -r chapter_dir; do
            check_missing_from_index "$chapter_dir"
        done < <(find "$TARGET" -name "index.md" -type f -exec dirname {} \; | sort)
    fi
    
    # Print summary
    echo -e "${BLUE}=================================="
    echo -e "           SUMMARY"
    echo -e "==================================${NC}"
    echo "Files checked: $TOTAL_FILES"
    echo "Total links: $TOTAL_LINKS"
    echo "Broken links: $BROKEN_LINKS"
    echo "Files with issues: $FILES_WITH_ISSUES"
    echo "Files missing from index: $MISSING_FILES"
    echo "Log file: $LOG_FILE"
    
    if [[ $BROKEN_LINKS -eq 0 && $MISSING_FILES -eq 0 ]]; then
        echo -e "${GREEN}✅ All links are valid!${NC}"
        exit 0
    else
        echo -e "${RED}❌ Found issues that need attention${NC}"
        exit 1
    fi
}

# Run main function
main "$@"